// Retrieval channels (plan §5), each fanned out over the data shards and
// merged by a score every shard computes the same way.
import { DECL_COLS, fanout, fetchByIds, type Shard } from "./shards";
import type { ChannelResult, Hit } from "./fusion";
import type { Intent } from "./intent";
import type { Expansion } from "./expand";

export interface Ctx { q: string; intent: Intent; expansion: Expansion; gazetteerKey: string | null; limit: number; shards: Shard[]; control: Shard }
const byScore = (rows: Record<string, unknown>[], limit: number) =>
  rows.sort((a, b) => (Number(b.score) - Number(a.score)) || (Number(b.pagerank) - Number(a.pagerank))).slice(0, limit) as unknown as Hit[];

/** Exact, suffix, prefix, substring and fuzzy matches on the name; token overlap for English queries. */
export async function nameChannel(c: Ctx): Promise<ChannelResult> {
  if (c.intent === "name" || c.intent === "module") {
    const q = c.q.toLowerCase();
    const rows = await fanout(c.shards,
      `SELECT ${DECL_COLS},
         (CASE WHEN lower(d.name) = $1 THEN 4 WHEN lower(d.name) LIKE '%.' || $1 THEN 3 WHEN lower(d.name) LIKE $1 || '%' THEN 2 WHEN lower(d.name) LIKE '%' || $1 || '%' THEN 1 ELSE 0 END) + similarity(d.name, $2) AS score
       FROM decl d
       WHERE lower(d.name) LIKE '%' || $1 || '%' OR d.name % $2
       ORDER BY score DESC, d.pagerank DESC LIMIT $3`, [q, c.q, c.limit]);
    return { channel: "name", hits: byScore(rows, c.limit) };
  }
  const toks = c.expansion.tokens.filter((t) => t.length > 1);
  if (!toks.length) return { channel: "name", hits: [] };
  const rows = await fanout(c.shards,
    `SELECT ${DECL_COLS}, cardinality(ARRAY(SELECT unnest(d.name_tokens) INTERSECT SELECT unnest($1::text[])))::float - cardinality(d.name_tokens) / 100.0 AS score
     FROM decl d WHERE d.name_tokens && $1::text[]
     ORDER BY score DESC, d.pagerank DESC LIMIT $2`, [toks, c.limit]);
  return { channel: "name", hits: byScore(rows, c.limit) };
}

/** Weighted full-text over name, gloss, docstring, statement gloss, topics, module. */
export async function ftsChannel(c: Ctx): Promise<ChannelResult> {
  const text = c.intent === "name" ? c.expansion.tokens.join(" ") : [...c.expansion.words, ...c.expansion.tokens].join(" ");
  if (!text.trim()) return { channel: "fts", hits: [] };
  const rows = await fanout(c.shards,
    `SELECT ${DECL_COLS}, ts_rank_cd(t.search_text, q, 32) AS score
     FROM decl_text t JOIN decl d ON d.id = t.id, websearch_to_tsquery('english', $1) q
     WHERE t.search_text @@ q ORDER BY score DESC, d.pagerank DESC LIMIT $2`, [text, c.limit]);
  return { channel: "fts", hits: byScore(rows, c.limit) };
}

/** Declarations using the constants the query names, each weighted by rarity (IDF from the control shard). */
export async function symbolChannel(c: Ctx): Promise<ChannelResult> {
  const consts = c.expansion.constants;
  if (!consts.length) return { channel: "symbol", hits: [] };
  const [meta, dfs] = await Promise.all([
    c.control.sql(`SELECT decl_count FROM index_version WHERE id = 1`),
    c.control.sql(`SELECT name, df FROM symbol WHERE name = ANY($1::text[])`, [consts]),
  ]);
  const n = Number(meta[0]?.decl_count) || 300000;
  const df = new Map(dfs.map((r) => [r.name as string, Number(r.df)]));
  const weights = consts.map((k) => Math.log((n + 1) / ((df.get(k) ?? 0) + 1)));
  const rows = await fanout(c.shards,
    `SELECT ${DECL_COLS}, (SELECT coalesce(sum(u.w), 0) FROM unnest($1::text[], $2::float8[]) AS u(k, w) WHERE d.constants_used @> ARRAY[u.k]) - cardinality(d.constants_used) / 1000.0 AS score
     FROM decl d WHERE d.constants_used && $1::text[]
     ORDER BY score DESC, d.pagerank DESC LIMIT $3`, [consts, weights, c.limit]);
  return { channel: "symbol", hits: byScore(rows, c.limit) };
}

/** Named theorems: keys from docstrings and curation, on the control shard. */
export async function gazetteerChannel(c: Ctx): Promise<ChannelResult> {
  if (!c.gazetteerKey) return { channel: "gazetteer", hits: [] };
  const ids = await c.control.sql(`SELECT decl_id FROM gazetteer WHERE key = $1 ORDER BY weight DESC LIMIT $2`, [c.gazetteerKey, c.limit]);
  if (!ids.length) return { channel: "gazetteer", hits: [] };
  return { channel: "gazetteer", hits: (await fetchByIds(ids.map((r) => r.decl_id as string), c.shards)) as unknown as Hit[] };
}

/** Structural match, foundation version: the pattern's top relation is the
 * conclusion head and every named constant occurs; smaller statements first. */
export async function patternChannel(c: Ctx): Promise<ChannelResult> {
  if (c.intent !== "pattern" && c.intent !== "notation") return { channel: "pattern", hits: [] };
  const rel = /↔/.test(c.q) ? "Iff" : /≠/.test(c.q) ? "Ne" : /≤/.test(c.q) ? "LE.le" : /</.test(c.q) ? "LT.lt" : /≥/.test(c.q) ? "GE.ge" : />/.test(c.q) ? "GT.gt" : /=/.test(c.q) ? "Eq" : null;
  const consts = c.expansion.constants.filter((k) => !["Eq", "Ne", "LE.le", "LT.lt", "GE.ge", "GT.gt", "Iff"].includes(k));
  if (!rel && !consts.length) return { channel: "pattern", hits: [] };
  const rows = await fanout(c.shards,
    `SELECT ${DECL_COLS}, -cardinality(d.constants_used)::float + (CASE WHEN d.conclusion_head = $1 THEN 100 ELSE 0 END) AS score
     FROM decl d
     WHERE ($1::text IS NULL OR d.conclusion_head = $1) AND ($2::text[] = '{}' OR d.constants_used @> $2::text[]) AND d.kind IN ('theorem', 'lemma')
     ORDER BY score DESC, d.pagerank DESC LIMIT $3`, [rel, consts, c.limit]);
  return { channel: "pattern", hits: byScore(rows, c.limit) };
}

/** Meaning: cosine similarity on the gloss embeddings, once they are loaded. */
export async function semanticChannel(c: Ctx, embed: (q: string) => Promise<number[]>): Promise<ChannelResult> {
  if (c.intent === "name" || c.intent === "module") return { channel: "semantic", hits: [] };
  const vec = `[${(await embed(c.q)).join(",")}]`;
  const rows = await fanout(c.shards,
    `SELECT ${DECL_COLS}, 1 - (e.gloss_vec <=> $1::vector) AS score FROM decl_embedding e JOIN decl d ON d.id = e.id
     WHERE e.gloss_vec IS NOT NULL ORDER BY e.gloss_vec <=> $1::vector LIMIT $2`, [vec, c.limit]);
  return { channel: "semantic", hits: byScore(rows, c.limit) };
}

/** What people clicked for this exact query before. */
export async function clickChannel(c: Ctx): Promise<ChannelResult> {
  const ids = await c.control.sql(
    `SELECT k.decl_id, count(*) AS n FROM click k JOIN query_log q ON q.id = k.query_id WHERE q.normalised = $1 GROUP BY k.decl_id ORDER BY n DESC LIMIT $2`, [c.q, Math.min(c.limit, 20)]);
  if (!ids.length) return { channel: "click", hits: [] };
  return { channel: "click", hits: (await fetchByIds(ids.map((r) => r.decl_id as string), c.shards)) as unknown as Hit[] };
}
