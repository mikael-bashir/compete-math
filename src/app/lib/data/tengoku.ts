import { sql } from "@vercel/postgres";
import { getShardPool, allShardKeys } from "./tengoku-shard-clients";
import { getActiveShardKeys, recordShardQueries, recordPopularityHits } from "./tengoku-shard-usage";
import type { ShardKey } from "./tengoku-shard-config";

export type TengokuStatus = "tentative" | "trusted";

export interface TengokuEntry {
  id: number;
  name: string;
  statement: string;
  proof: string;
  status: TengokuStatus;
  library: string;
  sourceUrl: string;
  toolchain: string;
}

export interface TengokuStats {
  total: number;
  tentative: number;
  trusted: number;
  libraryCount: number;
}

// Theorem rows live on 10 sharded databases, not here — this just reads the
// snapshot the importer leaves behind (see refreshTengokuStatsCache), so a
// page load never has to fan out just to show a count.
export async function getTengokuStats(): Promise<TengokuStats> {
  try {
    const { rows } = await sql`SELECT total, trusted, tentative, library_count FROM tengoku_stats_cache WHERE id = 1;`;
    const r = rows[0];
    if (!r) return { total: 0, tentative: 0, trusted: 0, libraryCount: 0 };
    return { total: r.total, trusted: r.trusted, tentative: r.tentative, libraryCount: r.library_count };
  } catch (error) {
    console.error("[tengoku] stats cache read failed:", error);
    return { total: 0, tentative: 0, trusted: 0, libraryCount: 0 };
  }
}

// Recomputes the cached snapshot with one COUNT per shard. Deliberately not
// on the hot path — call this from the importer after a harvest lands, or
// from an admin action, not from a request handler.
export async function refreshTengokuStatsCache(): Promise<TengokuStats> {
  let total = 0;
  let trusted = 0;
  const libraries = new Set<string>();

  for (const key of allShardKeys()) {
    const pool = getShardPool(key);
    const { rows } = await pool.sql`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE status = 'trusted')::int AS trusted,
             array_agg(DISTINCT library) AS libs
      FROM tengoku_entries;
    `;
    const r = rows[0];
    total += r?.n ?? 0;
    trusted += r?.trusted ?? 0;
    for (const lib of r?.libs ?? []) {
      if (lib) libraries.add(lib);
    }
  }

  const tentative = total - trusted;
  await sql`
    INSERT INTO tengoku_stats_cache (id, total, trusted, tentative, library_count, refreshed_at)
    VALUES (1, ${total}, ${trusted}, ${tentative}, ${libraries.size}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      total = ${total}, trusted = ${trusted}, tentative = ${tentative},
      library_count = ${libraries.size}, refreshed_at = NOW();
  `;
  return { total, trusted, tentative, libraryCount: libraries.size };
}

interface ShardHit {
  key: ShardKey;
  rows: {
    id: number;
    name: string;
    statement: string;
    proof: string;
    status: string;
    library: string;
    source_url: string;
    toolchain: string;
    rank: number;
  }[];
}

// websearch_to_tsquery parses natural query syntax (quotes, "OR", bare
// negation with "-") instead of requiring Postgres's tsquery operators —
// the right choice for a Google-style search box. Fans out to every shard
// that isn't resting this month, merges by rank, and re-slices to `limit` —
// a shard that errors or is asleep just quietly contributes nothing rather
// than failing the whole search.
export async function searchTengokuEntries(query: string, limit = 30): Promise<TengokuEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const activeShards = await getActiveShardKeys();
    if (activeShards.length === 0) {
      console.error("[tengoku] search failed: every shard is resting this month");
      return [];
    }

    const settled = await Promise.allSettled<ShardHit>(
      activeShards.map(async (key) => {
        const pool = getShardPool(key);
        const { rows } = await pool.sql`
          SELECT id, name, statement, proof, status, library, source_url, toolchain,
                 ts_rank(search_vector, websearch_to_tsquery('english', ${trimmed})) AS rank
          FROM tengoku_entries
          WHERE search_vector @@ websearch_to_tsquery('english', ${trimmed})
          ORDER BY rank DESC
          LIMIT ${limit};
        `;
        return { key, rows: rows as ShardHit["rows"] };
      }),
    );

    const hitShards: ShardKey[] = [];
    const merged: (TengokuEntry & { rank: number; shardKey: ShardKey })[] = [];
    for (const result of settled) {
      if (result.status === "rejected") {
        console.error("[tengoku] shard search failed:", result.reason);
        continue;
      }
      hitShards.push(result.value.key);
      for (const r of result.value.rows) {
        merged.push({
          id: r.id,
          name: r.name,
          statement: r.statement,
          proof: r.proof,
          status: r.status === "trusted" ? "trusted" : "tentative",
          library: r.library,
          sourceUrl: r.source_url,
          toolchain: r.toolchain,
          rank: r.rank,
          shardKey: result.value.key,
        });
      }
    }

    recordShardQueries(hitShards).catch((err) => console.error("[tengoku] usage tracking failed:", err));

    merged.sort((a, b) => b.rank - a.rank);
    const top = merged.slice(0, limit);

    const idsByShard = new Map<ShardKey, number[]>();
    for (const entry of top) {
      const list = idsByShard.get(entry.shardKey) ?? [];
      list.push(entry.id);
      idsByShard.set(entry.shardKey, list);
    }
    for (const [key, ids] of idsByShard) {
      recordPopularityHits(key, ids).catch((err) => console.error("[tengoku] popularity tracking failed:", err));
    }

    return top.map((entry) => ({
      id: entry.id,
      name: entry.name,
      statement: entry.statement,
      proof: entry.proof,
      status: entry.status,
      library: entry.library,
      sourceUrl: entry.sourceUrl,
      toolchain: entry.toolchain,
    }));
  } catch (error) {
    console.error("[tengoku] search failed:", error);
    return [];
  }
}
