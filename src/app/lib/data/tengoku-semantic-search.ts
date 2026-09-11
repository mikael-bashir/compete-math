// "Google-like" search: two named, separately-computed relevance signals,
// blended into one score per candidate, rather than a single ranking method.
//
// - meaningScore: cosine similarity between the query's sentence embedding
//   and a theorem's embedding (see tengoku-embeddings.ts). This is where
//   word-sense-by-context comes from for free — a *sentence* embedding
//   model encodes "mean" in "mean value theorem" differently than "mean" in
//   "the mean of a distribution" because it attends to the surrounding
//   words, unlike a bag-of-words/static-embedding approach would.
// - relevanceScore: the best of two lexical signals — Postgres's own
//   tsvector rank (exact/stemmed keyword matches, e.g. "adding" ~ "add"),
//   and pg_trgm similarity against the same concept_gloss text (catches
//   near-misses tsvector's stemmer doesn't — typos, partial identifier
//   substrings, morphological variants) — both backed by GIN indexes, so
//   "not a literal keyword search" doesn't mean an unindexed table scan.
//
// The two scores are min-max normalized *within this query's candidate
// pool* (there's no universal scale to calibrate ts_rank/trigram/cosine
// against ahead of time) and blended with fixed weights favoring meaning
// slightly over raw lexical overlap, matching how a query like "2 + 4 = 6"
// or an English question about a named theorem should still surface
// relevant formal machinery even with zero literal keyword overlap.
//
// Confidence gating: Google's own behavior is the model here — it doesn't
// return "no results" just because nothing is a stellar match, but it does
// hold back when the best candidate is genuinely unrelated to the query.
// The gate looks at *raw* signals, not the normalized blend below (see the
// comment beside its computation for why) — anything that clears it is
// always surfaced, best-effort, sorted by blended score.

import { getShardSql } from "./tengoku-shard-clients";
import { getActiveShardKeys, recordShardQueries, recordPopularityHits } from "./tengoku-shard-usage";
import { resolveMiscOverflowMetaShard, MISC_OVERFLOW_TARGETS, type ShardKey } from "./tengoku-shard-config";
import { embedQuery, toPgVector } from "./tengoku-embeddings";
import { searchTengokuEntries, type TengokuEntry } from "./tengoku";

const WEIGHT_MEANING = 0.6;
const WEIGHT_RELEVANCE = 0.4;

interface Candidate {
  key: string; // `${shardKey}:${id}` — globally unique across shards
  shardKey: ShardKey;
  id: number;
  meaningRaw?: number; // cosine similarity, already in [-1, 1]
  tsRankRaw?: number;
  trigramRaw?: number; // already in [0, 1]
  compatibleToolchains?: string[]; // known upfront only for misc-overflow hits
}

function minMaxNormalize(values: number[]): (v: number | undefined) => number {
  const defined = values.filter((v): v is number => v !== undefined);
  if (defined.length === 0) return () => 0;
  const min = Math.min(...defined);
  const max = Math.max(...defined);
  if (max - min < 1e-9) return (v) => (v === undefined ? 0 : 1); // all tied — don't zero everyone out
  return (v) => (v === undefined ? 0 : (v - min) / (max - min));
}

async function semanticCandidates(queryVecStr: string, limit: number): Promise<Candidate[]> {
  const activeShards = await getActiveShardKeys();
  const directShards = activeShards.filter((k) => k !== "misc");
  const overflowTargets = MISC_OVERFLOW_TARGETS.filter((k) => activeShards.includes(k));

  const [directResults, overflowResults] = await Promise.all([
    Promise.allSettled(
      directShards.map(async (key) => {
        const sql = getShardSql(key);
        const rows = await sql`
          SELECT id, 1 - (embedding <=> ${queryVecStr}::vector) AS sim
          FROM tengoku_entries
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${queryVecStr}::vector
          LIMIT ${limit};
        `;
        return { key, rows: rows as { id: number; sim: number }[] };
      }),
    ),
    Promise.allSettled(
      overflowTargets.map(async (key) => {
        const sql = getShardSql(key);
        const rows = await sql`
          SELECT entry_id, compatible_toolchains, 1 - (embedding <=> ${queryVecStr}::vector) AS sim
          FROM tengoku_search_meta_overflow
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${queryVecStr}::vector
          LIMIT ${limit};
        `;
        return { rows: rows as { entry_id: number; compatible_toolchains: string[] | null; sim: number }[] };
      }),
    ),
  ]);

  const out: Candidate[] = [];
  for (const r of directResults) {
    if (r.status !== "fulfilled") continue;
    for (const row of r.value.rows) {
      out.push({ key: `${r.value.key}:${row.id}`, shardKey: r.value.key, id: row.id, meaningRaw: row.sim });
    }
  }
  for (const r of overflowResults) {
    if (r.status !== "fulfilled") continue;
    for (const row of r.value.rows) {
      out.push({
        key: `misc:${row.entry_id}`,
        shardKey: "misc",
        id: row.entry_id,
        meaningRaw: row.sim,
        compatibleToolchains: row.compatible_toolchains ?? [],
      });
    }
  }
  return out;
}

async function lexicalCandidates(query: string, limit: number): Promise<Candidate[]> {
  const activeShards = await getActiveShardKeys();
  const directShards = activeShards.filter((k) => k !== "misc");
  const overflowTargets = MISC_OVERFLOW_TARGETS.filter((k) => activeShards.includes(k));

  const [directResults, overflowResults] = await Promise.all([
    Promise.allSettled(
      directShards.map(async (key) => {
        const sql = getShardSql(key);
        const rows = await sql`
          SELECT id,
                 ts_rank(search_vector, websearch_to_tsquery('english', ${query})) AS ts_rank,
                 similarity(coalesce(concept_gloss, ''), ${query}) AS trgm
          FROM tengoku_entries
          WHERE search_vector @@ websearch_to_tsquery('english', ${query})
             OR coalesce(concept_gloss, '') % ${query}
          ORDER BY GREATEST(ts_rank(search_vector, websearch_to_tsquery('english', ${query})), similarity(coalesce(concept_gloss, ''), ${query})) DESC
          LIMIT ${limit};
        `;
        return { key, rows: rows as { id: number; ts_rank: number; trgm: number }[] };
      }),
    ),
    Promise.allSettled(
      overflowTargets.map(async (key) => {
        const sql = getShardSql(key);
        const rows = await sql`
          SELECT entry_id, compatible_toolchains, similarity(coalesce(concept_gloss, ''), ${query}) AS trgm
          FROM tengoku_search_meta_overflow
          WHERE coalesce(concept_gloss, '') % ${query}
          ORDER BY trgm DESC
          LIMIT ${limit};
        `;
        return { rows: rows as { entry_id: number; compatible_toolchains: string[] | null; trgm: number }[] };
      }),
    ),
  ]);

  const out: Candidate[] = [];
  for (const r of directResults) {
    if (r.status !== "fulfilled") continue;
    for (const row of r.value.rows) {
      out.push({
        key: `${r.value.key}:${row.id}`,
        shardKey: r.value.key,
        id: row.id,
        tsRankRaw: row.ts_rank,
        trigramRaw: row.trgm,
      });
    }
  }
  for (const r of overflowResults) {
    if (r.status !== "fulfilled") continue;
    for (const row of r.value.rows) {
      out.push({
        key: `misc:${row.entry_id}`,
        shardKey: "misc",
        id: row.entry_id,
        trigramRaw: row.trgm,
        compatibleToolchains: row.compatible_toolchains ?? [],
      });
    }
  }
  return out;
}

// misc's own base table has no concept_gloss/embedding — it still
// participates via its pre-existing tsvector search_vector column, which
// `searchTengokuEntries` (the plain keyword path) already queries; folded
// in here as a third, low-weight lexical-only source so misc's un-tagged
// third-party content (which is the majority of the corpus) isn't invisible
// to a query this new pipeline otherwise has thin coverage for while the
// embedding backfill is still running.
async function miscBaseLexicalCandidates(query: string, limit: number): Promise<TengokuEntry[]> {
  try {
    return await searchTengokuEntries(query, limit);
  } catch {
    return [];
  }
}

async function hydrate(candidates: Candidate[]): Promise<Map<string, TengokuEntry>> {
  const byShard = new Map<ShardKey, Candidate[]>();
  for (const c of candidates) {
    const list = byShard.get(c.shardKey) ?? [];
    list.push(c);
    byShard.set(c.shardKey, list);
  }
  const out = new Map<string, TengokuEntry>();
  await Promise.all(
    Array.from(byShard.entries()).map(async ([shardKey, shardCandidates]) => {
      const sql = getShardSql(shardKey);
      const ids = shardCandidates.map((c) => c.id);
      const rows =
        shardKey === "misc"
          ? await sql`SELECT id, name, statement, proof, status, library, source_url, toolchain FROM tengoku_entries WHERE id = ANY(${ids}::int[]);`
          : await sql`SELECT id, name, statement, proof, status, library, source_url, toolchain, compatible_toolchains FROM tengoku_entries WHERE id = ANY(${ids}::int[]);`;
      const compatById = new Map(shardCandidates.map((c) => [c.id, c.compatibleToolchains]));
      for (const r of rows as any[]) {
        out.set(`${shardKey}:${r.id}`, {
          id: r.id,
          name: r.name,
          statement: r.statement,
          proof: r.proof,
          status: r.status === "trusted" ? "trusted" : "tentative",
          library: r.library,
          sourceUrl: r.source_url,
          toolchain: r.toolchain,
          compatibleToolchains: r.compatible_toolchains ?? compatById.get(r.id) ?? [],
        });
      }
    }),
  );
  return out;
}

export async function smartSearchTengokuEntries(query: string, limit = 30): Promise<TengokuEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const candidatePoolSize = limit * 3;

  const [semantic, lexical, miscBase] = await Promise.all([
    (async () => {
      try {
        const vec = await embedQuery(trimmed);
        return await semanticCandidates(toPgVector(vec), candidatePoolSize);
      } catch (e) {
        console.error("[tengoku] semantic candidate retrieval failed:", e);
        return [] as Candidate[];
      }
    })(),
    lexicalCandidates(trimmed, candidatePoolSize).catch((e) => {
      console.error("[tengoku] lexical candidate retrieval failed:", e);
      return [] as Candidate[];
    }),
    miscBaseLexicalCandidates(trimmed, Math.ceil(limit / 2)),
  ]);

  // Merge semantic + lexical rows that refer to the same (shardKey, id) into
  // one candidate carrying both raw signals.
  const merged = new Map<string, Candidate>();
  for (const c of [...semantic, ...lexical]) {
    const existing = merged.get(c.key);
    if (!existing) {
      merged.set(c.key, { ...c });
      continue;
    }
    if (c.meaningRaw !== undefined) existing.meaningRaw = c.meaningRaw;
    if (c.tsRankRaw !== undefined) existing.tsRankRaw = c.tsRankRaw;
    if (c.trigramRaw !== undefined) existing.trigramRaw = c.trigramRaw;
    if (c.compatibleToolchains) existing.compatibleToolchains = c.compatibleToolchains;
  }
  const pool = Array.from(merged.values());

  const normMeaning = minMaxNormalize(pool.map((c) => c.meaningRaw ?? -1).filter((_, i) => pool[i].meaningRaw !== undefined));
  const normTsRank = minMaxNormalize(pool.map((c) => c.tsRankRaw).filter((v): v is number => v !== undefined));
  const normTrigram = minMaxNormalize(pool.map((c) => c.trigramRaw).filter((v): v is number => v !== undefined));

  const scored = pool.map((c) => {
    const meaningScore = normMeaning(c.meaningRaw);
    const relevanceScore = Math.max(normTsRank(c.tsRankRaw), normTrigram(c.trigramRaw));
    return { candidate: c, meaningScore, relevanceScore, blended: WEIGHT_MEANING * meaningScore + WEIGHT_RELEVANCE * relevanceScore };
  });
  scored.sort((a, b) => b.blended - a.blended);

  // The confidence gate has to look at *raw*, absolute-scale signals, not
  // the min-max-normalized blend above — normalizing within the candidate
  // pool always stretches the least-bad candidate up to 1.0, so a pool of
  // uniformly-irrelevant matches (e.g. a gibberish query) would otherwise
  // look just as "confident" as a pool of genuinely good ones. A real
  // tsvector/trigram lexical hit is unambiguous on its own (the row only
  // appears here because it matched), and MiniLM cosine similarity has a
  // real absolute floor below which pairs are simply unrelated (empirically
  // ~0.0-0.15 for unrelated text with this model, ~0.25+ once genuinely on
  // topic) — either one being real is enough to trust the result set.
  // Calibrated empirically against this model/corpus: a genuinely unrelated
  // ("gibberish") query's *best* candidate (out of hundreds scanned, so
  // there's always some noise-driven maximum) topped out around 0.23, while
  // on-topic queries' top candidates ran 0.46-0.49 — 0.28 sits with real
  // margin above the noise ceiling rather than splitting the difference.
  const MEANING_FLOOR = 0.28;
  const TRIGRAM_FLOOR = 0.15;
  const hasRealLexicalHit = pool.some(
    (c) => c.tsRankRaw !== undefined || (c.trigramRaw !== undefined && c.trigramRaw >= TRIGRAM_FLOOR),
  );
  const topRawMeaning = pool.reduce((max, c) => Math.max(max, c.meaningRaw ?? -1), -1);
  const confident = hasRealLexicalHit || topRawMeaning >= MEANING_FLOOR;

  const hitShards = Array.from(new Set(pool.map((c) => c.shardKey)));
  recordShardQueries(hitShards).catch((err) => console.error("[tengoku] usage tracking failed:", err));

  const out: TengokuEntry[] = [];
  const seen = new Set<string>(); // dedupe by (library, name)

  if (confident) {
    const hydrated = await hydrate(pool);
    for (const s of scored) {
      const entry = hydrated.get(s.candidate.key);
      if (!entry) continue;
      const identity = `${entry.library}:${entry.name}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      out.push(entry);
      if (out.length >= limit) break;
    }
  }

  // misc's own tsvector-only results (no meaning/relevance blend available
  // for them yet) are appended after the confidently-scored set, never
  // ahead of it, and only fill remaining room — they're a coverage
  // fallback, not a competing ranking signal.
  for (const entry of miscBase) {
    if (out.length >= limit) break;
    const identity = `${entry.library}:${entry.name}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push(entry);
  }

  const idsByShard = new Map<ShardKey, number[]>();
  for (const s of scored.slice(0, out.length)) {
    const list = idsByShard.get(s.candidate.shardKey) ?? [];
    list.push(s.candidate.id);
    idsByShard.set(s.candidate.shardKey, list);
  }
  for (const [key, ids] of idsByShard) {
    recordPopularityHits(key, ids).catch((err) => console.error("[tengoku] popularity tracking failed:", err));
  }

  return out;
}
