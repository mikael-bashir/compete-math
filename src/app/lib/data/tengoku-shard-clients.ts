import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { SHARDS, type ShardKey } from "./tengoku-shard-config";

export type ShardSql = NeonQueryFunction<false, false>;

const clients = new Map<ShardKey, ShardSql>();

// One lightweight HTTP query function per angel database, cached for the
// life of the process. Deliberately `neon()` (the stateless one-shot HTTP
// driver @vercel/postgres's own default `sql` export wraps for the main
// app database) rather than `createPool()`'s WebSocket-based pool: a pool
// only pays off when a single request reuses the same connection for many
// queries, but a fan-out search sends exactly one query to each of 10
// shards — paying full WebSocket handshake setup on every request (and,
// worse, on every serverless function cold start in production) measured
// out at 1-3s per search. The HTTP driver has none of that setup cost.
export function getShardSql(shardKey: ShardKey): ShardSql {
  const cached = clients.get(shardKey);
  if (cached) return cached;

  const shard = SHARDS.find((s) => s.key === shardKey);
  if (!shard) throw new Error(`[tengoku] unknown shard key: ${shardKey}`);

  const connectionString = process.env[shard.envVar];
  if (!connectionString) {
    throw new Error(`[tengoku] missing ${shard.envVar} for shard ${shardKey}`);
  }

  // Next.js patches the global `fetch` for its Data Cache / request
  // memoization; without opting out, that machinery adds real overhead to
  // every one of these per-shard HTTP queries (measured: ~700ms extra on a
  // 10-way fan-out) and isn't semantically correct for live DB reads anyway.
  const sql = neon(connectionString, { fetchOptions: { cache: "no-store" } });
  clients.set(shardKey, sql);
  return sql;
}

export function allShardKeys(): ShardKey[] {
  return SHARDS.map((s) => s.key);
}

// Each angel database is a bare Neon project with nothing on it — this
// creates the one table Tengoku actually needs there. Safe to call every
// import run (IF NOT EXISTS throughout, matching the main app's migrate
// route convention).
export async function ensureShardEntriesTable(sql: ShardSql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS tengoku_entries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      statement TEXT NOT NULL,
      proof TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'tentative',
      library TEXT NOT NULL,
      source_url TEXT NOT NULL,
      toolchain TEXT NOT NULL,
      search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', name || ' ' || statement)
      ) STORED,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_tengoku_entries_search ON tengoku_entries USING GIN (search_vector);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tengoku_entries_library ON tengoku_entries(library);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tengoku_entries_status ON tengoku_entries(status);`;
}
