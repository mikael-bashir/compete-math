import { sql } from "@vercel/postgres";
import { SHARDS, type ShardKey } from "./tengoku-shard-config";

// Usage governance lives on the main app database, not the shards
// themselves — it's bookkeeping ("important stuff for tengoku"), never
// theorem text. Neon's free tier is metered in compute-hours, which isn't
// something a plain SQL client can read back; this tracks *query count* per
// shard per calendar month as a deliberately conservative stand-in, so a
// free shard rests before it ever gets close to being throttled or
// suspended by Neon rather than failing requests mid-month.
//
// Every function here does exactly one round trip to master regardless of
// shard count (unnest()-based batch writes, ANY($1) batch updates) — this
// used to be a per-shard loop, which alone added ~1.5s to every search
// once there were 10 shards to register/update sequentially.

export async function ensureShardRegistry(): Promise<void> {
  await sql.query(
    `INSERT INTO tengoku_shards (shard_key, env_var)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (shard_key) DO NOTHING`,
    [SHARDS.map((s) => s.key), SHARDS.map((s) => s.envVar)],
  );
}

interface ShardRow {
  shard_key: ShardKey;
  queries_this_month: number;
  monthly_query_budget: number;
  status: "active" | "resting";
}

// Which shards are safe to query right now. Called once per search request
// (fanning out only to what this returns). One round trip total — the month
// rollover (comparing full dates in SQL, not JS-side month numbers, so it
// doesn't misfire across a year boundary) and the read are one statement via
// a CTE, not two sequential queries. Does NOT call ensureShardRegistry —
// that's a one-time setup step (run from the importer), not a per-request one.
export async function getActiveShardKeys(): Promise<ShardKey[]> {
  const { rows } = await sql<ShardRow>`
    WITH rollover AS (
      UPDATE tengoku_shards
      SET queries_this_month = 0, status = 'active', month_reset_at = date_trunc('month', now()), updated_at = NOW()
      WHERE month_reset_at < date_trunc('month', now())
    )
    SELECT shard_key, queries_this_month, monthly_query_budget, status FROM tengoku_shards;
  `;
  return rows.filter((r) => r.status === "active" && r.queries_this_month < r.monthly_query_budget).map((r) => r.shard_key);
}

// Called after a fan-out with the shards actually hit. Flips a shard to
// 'resting' the moment it crosses its budget, so every subsequent request
// this month skips it instead of risking a suspended/throttled connection.
export async function recordShardQueries(shardKeys: ShardKey[]): Promise<void> {
  if (shardKeys.length === 0) return;
  const { rows } = await sql.query<{ shard_key: ShardKey; over_budget: boolean }>(
    `UPDATE tengoku_shards
     SET queries_this_month = queries_this_month + 1, updated_at = NOW()
     WHERE shard_key = ANY($1::text[])
     RETURNING shard_key, queries_this_month >= monthly_query_budget AS over_budget`,
    [shardKeys],
  );
  const overBudget = rows.filter((r) => r.over_budget).map((r) => r.shard_key);
  if (overBudget.length === 0) return;

  await sql.query(`UPDATE tengoku_shards SET status = 'resting' WHERE shard_key = ANY($1::text[]) AND status != 'resting'`, [
    overBudget,
  ]);
  for (const key of overBudget) {
    console.warn(`[tengoku] shard ${key} hit its monthly query budget — resting until next month`);
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
  await sql.query(
    `INSERT INTO tengoku_popularity (shard_key, entry_id, hits, last_hit_at)
     SELECT $1, e, 1, NOW() FROM unnest($2::int[]) AS e
     ON CONFLICT (shard_key, entry_id) DO UPDATE
       SET hits = tengoku_popularity.hits + 1, last_hit_at = NOW()`,
    [shardKey, entryIds],
  );
}
