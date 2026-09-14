// Retrieval channels (plan §5). Each returns its own top-N; fusion.ts merges.
import type { Sql } from "./db";
import type { ChannelResult, Hit } from "./fusion";
import type { Intent } from "./intent";
import type { Expansion } from "./expand";

export interface Ctx { q: string; intent: Intent; expansion: Expansion; gazetteerKey: string | null; limit: number }
const COLS = "d.id, d.name, d.kind, d.tier, d.statement, d.module, d.docstring, d.type_hash, d.pagerank, d.deprecated_for, d.permalink";
const hits = (rows: unknown[]) => rows as Hit[];

/** Exact, prefix, suffix and fuzzy matches on the declaration name; token overlap for English queries. */
export async function nameChannel(sql: Sql, c: Ctx): Promise<ChannelResult> {
  if (c.intent === "name" || c.intent === "module") {
    const q = c.q.toLowerCase();
    const rows = await sql(
      `SELECT ${COLS} FROM decl d
       WHERE lower(d.name) = $1 OR lower(d.name) LIKE $1 || '%' OR lower(d.name) LIKE '%.' || $1 OR lower(d.name) LIKE '%' || $1 || '%' OR d.name % $2
       ORDER BY (lower(d.name) = $1) DESC, (lower(d.name) LIKE '%.' || $1) DESC, (lower(d.name) LIKE $1 || '%') DESC, similarity(d.name, $2) DESC, d.pagerank DESC
       LIMIT $3`, [q, c.q, c.limit]);
    return { channel: "name", hits: hits(rows) };
  }
  const toks = c.expansion.tokens.filter((t) => t.length > 1);
  if (!toks.length) return { channel: "name", hits: [] };
  const rows = await sql(
    `SELECT ${COLS}, cardinality(ARRAY(SELECT unnest(d.name_tokens) INTERSECT SELECT unnest($1::text[]))) AS overlap
     FROM decl d WHERE d.name_tokens && $1::text[]
     ORDER BY overlap DESC, cardinality(d.name_tokens) ASC, d.pagerank DESC LIMIT $2`, [toks, c.limit]);
  return { channel: "name", hits: hits(rows) };
}

/** Weighted full-text over name, gloss, docstring, statement gloss, topics, module. */
export async function ftsChannel(sql: Sql, c: Ctx): Promise<ChannelResult> {
  const text = c.intent === "name" ? c.expansion.tokens.join(" ") : [...c.expansion.words, ...c.expansion.tokens].join(" ");
  if (!text.trim()) return { channel: "fts", hits: [] };
  const rows = await sql(
    `SELECT ${COLS}, ts_rank_cd(t.search_text, q, 32) AS r
     FROM decl_text t JOIN decl d ON d.id = t.id, websearch_to_tsquery('english', $1) q
     WHERE t.search_text @@ q ORDER BY r DESC, d.pagerank DESC LIMIT $2`, [text, c.limit]);
  return { channel: "fts", hits: hits(rows) };
}

/** Declarations using the constants the query names, weighted by rarity. */
export async function symbolChannel(sql: Sql, c: Ctx): Promise<ChannelResult> {
  const consts = c.expansion.constants;
  if (!consts.length) return { channel: "symbol", hits: [] };
  const rows = await sql(
    `WITH n AS (SELECT greatest(decl_count, 1)::float AS total FROM index_version WHERE id = 1)
     SELECT ${COLS},
       (SELECT coalesce(sum(ln((n.total + 1) / (coalesce(s.df, 0) + 1))), 0) FROM unnest($1::text[]) c LEFT JOIN symbol s ON s.name = c, n WHERE d.constants_used @> ARRAY[c]) AS score
     FROM decl d WHERE d.constants_used && $1::text[]
     ORDER BY score DESC, cardinality(d.constants_used) ASC, d.pagerank DESC LIMIT $2`, [consts, c.limit]);
  return { channel: "symbol", hits: hits(rows) };
}

export async function gazetteerChannel(sql: Sql, c: Ctx): Promise<ChannelResult> {
  if (!c.gazetteerKey) return { channel: "gazetteer", hits: [] };
  const rows = await sql(`SELECT ${COLS} FROM gazetteer g JOIN decl d ON d.id = g.decl_id WHERE g.key = $1 ORDER BY g.weight DESC LIMIT $2`, [c.gazetteerKey, c.limit]);
  return { channel: "gazetteer", hits: hits(rows) };
}

/** Structural match, foundation version: the pattern's top relation is the
 * conclusion head and every named constant must occur. The skeleton index
 * (plan §2, type_skeleton) replaces this with real unification. */
export async function patternChannel(sql: Sql, c: Ctx): Promise<ChannelResult> {
  if (c.intent !== "pattern" && c.intent !== "notation") return { channel: "pattern", hits: [] };
  const rel = /↔/.test(c.q) ? "Iff" : /≠/.test(c.q) ? "Ne" : /≤/.test(c.q) ? "LE.le" : /</.test(c.q) ? "LT.lt" : /≥/.test(c.q) ? "GE.ge" : />/.test(c.q) ? "GT.gt" : /=/.test(c.q) ? "Eq" : null;
  const consts = c.expansion.constants.filter((k) => !["Eq", "Ne", "LE.le", "LT.lt", "GE.ge", "GT.gt", "Iff"].includes(k));
  if (!rel && !consts.length) return { channel: "pattern", hits: [] };
  const rows = await sql(
    `SELECT ${COLS} FROM decl d
     WHERE ($1::text IS NULL OR d.conclusion_head = $1) AND ($2::text[] = '{}' OR d.constants_used @> $2::text[]) AND d.kind IN ('theorem', 'lemma')
     ORDER BY cardinality(d.constants_used) ASC, d.pagerank DESC LIMIT $3`, [rel, consts, c.limit]);
  return { channel: "pattern", hits: hits(rows) };
}

/** Meaning: cosine similarity on the gloss embeddings, when they exist. */
export async function semanticChannel(sql: Sql, c: Ctx, embed: (q: string) => Promise<number[]>): Promise<ChannelResult> {
  if (c.intent === "name" || c.intent === "module") return { channel: "semantic", hits: [] };
  const vec = await embed(c.q);
  const rows = await sql(
    `SELECT ${COLS}, 1 - (e.gloss_vec <=> $1::vector) AS sim FROM decl_embedding e JOIN decl d ON d.id = e.id
     WHERE e.gloss_vec IS NOT NULL ORDER BY e.gloss_vec <=> $1::vector LIMIT $2`, [`[${vec.join(",")}]`, c.limit]);
  return { channel: "semantic", hits: hits(rows) };
}

/** What people clicked for this query before. */
export async function clickChannel(sql: Sql, c: Ctx): Promise<ChannelResult> {
  const rows = await sql(
    `SELECT ${COLS}, count(*) AS n FROM click k JOIN query_log q ON q.id = k.query_id JOIN decl d ON d.id = k.decl_id
     WHERE q.normalised = $1 GROUP BY d.id ORDER BY n DESC LIMIT $2`, [c.q, Math.min(c.limit, 20)]);
  return { channel: "click", hits: hits(rows) };
}
