import { createPool, type VercelPool } from "@vercel/postgres";
import { SHARDS, type ShardKey } from "./tengoku-shard-config";

const pools = new Map<ShardKey, VercelPool>();

// One pooled client per angel database, created lazily and reused for the
// life of the process — mirrors how @vercel/postgres's default `sql` export
// works for the main app database.
export function getShardPool(shardKey: ShardKey): VercelPool {
  const cached = pools.get(shardKey);
  if (cached) return cached;

  const shard = SHARDS.find((s) => s.key === shardKey);
  if (!shard) throw new Error(`[tengoku] unknown shard key: ${shardKey}`);

  const connectionString = process.env[shard.envVar];
  if (!connectionString) {
    throw new Error(`[tengoku] missing ${shard.envVar} for shard ${shardKey}`);
  }

  const pool = createPool({ connectionString });
  pools.set(shardKey, pool);
  return pool;
}

export function allShardKeys(): ShardKey[] {
  return SHARDS.map((s) => s.key);
}

// Each angel database is a bare Neon project with nothing on it — this
// creates the one table Tengoku actually needs there. Safe to call every
// import run (IF NOT EXISTS throughout, matching the main app's migrate
// route convention).
export async function ensureShardEntriesTable(pool: VercelPool): Promise<void> {
  await pool.sql`
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
  await pool.sql`CREATE INDEX IF NOT EXISTS idx_tengoku_entries_search ON tengoku_entries USING GIN (search_vector);`;
  await pool.sql`CREATE INDEX IF NOT EXISTS idx_tengoku_entries_library ON tengoku_entries(library);`;
  await pool.sql`CREATE INDEX IF NOT EXISTS idx_tengoku_entries_status ON tengoku_entries(status);`;
}
