import { sql } from "@vercel/postgres";
import { SHARDS, type ShardKey } from "./tengoku-shard-config";

// Usage governance lives on the main app database, not the shards
// themselves — it's bookkeeping ("important stuff for tengoku"), never
// theorem text. Neon's free tier is metered in compute-hours, which isn't
// something a plain SQL client can read back; this tracks *query count* per
// shard per calendar month as a deliberately conservative stand-in, so a
// free shard rests before it ever gets close to being throttled or
// suspended by Neon rather than failing requests mid-month.

export async function ensureShardRegistry(): Promise<void> {
  for (const shard of SHARDS) {
    await sql`
      INSERT INTO tengoku_shards (shard_key, env_var)
      VALUES (${shard.key}, ${shard.envVar})
      ON CONFLICT (shard_key) DO NOTHING;
    `;
  }
}

interface ShardRow {
  shard_key: ShardKey;
  queries_this_month: number;
  monthly_query_budget: number;
  status: "active" | "resting";
}

// Which shards are safe to query right now. Called once per search request
// (fanning out only to what this returns), so a resting shard costs nothing
// beyond this one lightweight read against the master database. The reset
// itself is one conditional bulk UPDATE (comparing full dates in SQL, not
// JS-side month numbers, so it doesn't misfire across a year boundary).
export async function getActiveShardKeys(): Promise<ShardKey[]> {
  await ensureShardRegistry();
  await sql`
    UPDATE tengoku_shards
    SET queries_this_month = 0, status = 'active', month_reset_at = date_trunc('month', now()), updated_at = NOW()
    WHERE month_reset_at < date_trunc('month', now());
  `;
  const { rows } = await sql<ShardRow>`SELECT shard_key, queries_this_month, monthly_query_budget, status FROM tengoku_shards;`;
  return rows.filter((r) => r.status === "active" && r.queries_this_month < r.monthly_query_budget).map((r) => r.shard_key);
}

// Called after a fan-out with the shards actually hit. Flips a shard to
// 'resting' the moment it crosses its budget, so every subsequent request
// this month skips it instead of risking a suspended/throttled connection.
export async function recordShardQueries(shardKeys: ShardKey[]): Promise<void> {
  for (const key of shardKeys) {
    const { rows } = await sql<{ over_budget: boolean }>`
      UPDATE tengoku_shards
      SET queries_this_month = queries_this_month + 1, updated_at = NOW()
      WHERE shard_key = ${key}
      RETURNING queries_this_month >= monthly_query_budget AS over_budget;
    `;
    if (rows[0]?.over_budget) {
      await sql`UPDATE tengoku_shards SET status = 'resting' WHERE shard_key = ${key} AND status != 'resting';`;
      console.warn(`[tengoku] shard ${key} hit its monthly query budget — resting until next month`);
    }
  }
}

export async function updateShardRowStats(shardKey: ShardKey, rowCount: number, byteEstimate: number): Promise<void> {
  await sql`
    INSERT INTO tengoku_shards (shard_key, env_var, row_count, byte_estimate)
    VALUES (${shardKey}, ${SHARDS.find((s) => s.key === shardKey)?.envVar ?? ""}, ${rowCount}, ${byteEstimate})
    ON CONFLICT (shard_key) DO UPDATE
      SET row_count = ${rowCount}, byte_estimate = ${byteEstimate}, updated_at = NOW();
  `;
}

export interface ShardStatusRow {
  shardKey: ShardKey;
  rowCount: number;
  byteEstimate: number;
  queriesThisMonth: number;
  monthlyQueryBudget: number;
  status: "active" | "resting";
}

export async function getShardStatusReport(): Promise<ShardStatusRow[]> {
  await ensureShardRegistry();
  const { rows } = await sql`
    SELECT shard_key, row_count, byte_estimate, queries_this_month, monthly_query_budget, status
    FROM tengoku_shards ORDER BY shard_key;
  `;
  return rows.map((r) => ({
    shardKey: r.shard_key,
    rowCount: r.row_count,
    byteEstimate: Number(r.byte_estimate),
    queriesThisMonth: r.queries_this_month,
    monthlyQueryBudget: r.monthly_query_budget,
    status: r.status,
  }));
}

// Query-frequency tracking, used only to spot a shard whose *content* is
// disproportionately popular (a future rebalancing signal) — never used to
// duplicate theorem text onto the main database.
export async function recordPopularityHits(shardKey: ShardKey, entryIds: number[]): Promise<void> {
  if (entryIds.length === 0) return;
  for (const entryId of entryIds) {
    await sql`
      INSERT INTO tengoku_popularity (shard_key, entry_id, hits, last_hit_at)
      VALUES (${shardKey}, ${entryId}, 1, NOW())
      ON CONFLICT (shard_key, entry_id) DO UPDATE
        SET hits = tengoku_popularity.hits + 1, last_hit_at = NOW();
    `;
  }
}
