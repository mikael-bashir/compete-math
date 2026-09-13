// Loads Tengoku's JSONL files (github.com/competemath/tengoku,
// data/{tentative,trusted}/*.jsonl) into whichever sharded angel database
// owns each record's library (see tengoku-shard-config.ts) — theorem rows
// never touch the main app database. Every record carries a full proof and
// a status ('tentative' or 'trusted', read from the record itself — not
// inferred from which file it came from, so a mixed/malformed input fails
// loudly instead of silently mislabeling a proof's trust level).
//
// Idempotent-ish: re-running re-inserts everything (no upsert key — a
// harvested statement has no natural unique id across re-harvests of a
// moving library HEAD), so this is meant to be run against fresh shard
// tables, not run repeatedly against the same data.
//
// Usage:
//   node --env-file=.env $(which npx) tsx scripts/import-tengoku.ts /path/to/tengoku-repo/data/**/*.jsonl

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolveShardKey, type ShardKey } from '../src/app/lib/data/tengoku-shard-config';
import { getShardSql, ensureShardEntriesTable, allShardKeys } from '../src/app/lib/data/tengoku-shard-clients';
import { ensureShardRegistry, updateShardRowStats } from '../src/app/lib/data/tengoku-shard-usage';
import { refreshTengokuStatsCache } from '../src/app/lib/data/tengoku';

type TengokuStatus = 'tentative' | 'trusted';

interface TengokuRecord {
  name: string;
  statement: string;
  proof: string;
  status: TengokuStatus;
  library: string;
  source_url: string;
  toolchain: string;
}

// Streamed line-by-line rather than a single readFileSync + split('\n') —
// some harvested proofs are individually enormous (LeanBridge's LMFDB
// q-expansion coefficient certificates run 400KB+ per proof), and a big
// enough file pushes readFileSync past Node's ~536MB max string length.
// Reading line-by-line has no such ceiling regardless of file size.
async function parseJsonl(path: string): Promise<TengokuRecord[]> {
  const records: TengokuRecord[] = [];
  const rl = createInterface({ input: createReadStream(path, 'utf-8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let record: TengokuRecord;
    try {
      record = JSON.parse(line);
    } catch (err) {
      console.error(`[import-tengoku] skipping malformed line in ${path}: ${err}`);
      continue;
    }
    if (record.status !== 'tentative' && record.status !== 'trusted') {
      console.error(
        `[import-tengoku] skipping record with invalid status=${String(record.status)} in ${path} (name=${record.name})`,
      );
      continue;
    }
    if (!record.proof) {
      console.error(`[import-tengoku] skipping record with no proof in ${path} (name=${record.name})`);
      continue;
    }
    records.push(record);
  }
  return records;
}

const CHUNK_SIZE = 500;

// unnest()-based bulk insert — one round trip per chunk instead of one per
// row, which matters at Tengoku's scale (thousands of rows per shard).
async function insertBatch(shardKey: ShardKey, records: TengokuRecord[]) {
  const sql = getShardSql(shardKey);
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    await sql(
      `INSERT INTO tengoku_entries (name, statement, proof, status, library, source_url, toolchain)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])`,
      [
        chunk.map((r) => r.name),
        chunk.map((r) => r.statement),
        chunk.map((r) => r.proof),
        chunk.map((r) => r.status),
        chunk.map((r) => r.library),
        chunk.map((r) => r.source_url),
        chunk.map((r) => r.toolchain),
      ],
    );
  }
}

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('Usage: import-tengoku.ts <file.jsonl> [more files...]');
    process.exit(1);
  }

  await ensureShardRegistry();

  // Processed one input file at a time (not all files loaded into memory
  // together) — some shard files run ~40MB and Prove2Me's proofs alone
  // average ~15KB/row, so holding the whole corpus in memory at once isn't
  // worth the risk when nothing about the shard routing requires it.
  const shardTablesReady = new Set<ShardKey>();
  const rowsPerShard = new Map<ShardKey, number>();
  let total = 0;
  const byStatus: Record<string, number> = { tentative: 0, trusted: 0 };

  for (const path of paths) {
    const records = await parseJsonl(path);
    const grouped = new Map<ShardKey, TengokuRecord[]>();
    for (const record of records) {
      const shardKey = resolveShardKey(record.library, record.source_url, record.name);
      const list = grouped.get(shardKey) ?? [];
      list.push(record);
      grouped.set(shardKey, list);
    }
    for (const [shardKey, group] of grouped) {
      if (!shardTablesReady.has(shardKey)) {
        await ensureShardEntriesTable(getShardSql(shardKey));
        shardTablesReady.add(shardKey);
      }
      await insertBatch(shardKey, group);
      rowsPerShard.set(shardKey, (rowsPerShard.get(shardKey) ?? 0) + group.length);
    }
    total += records.length;
    for (const r of records) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    console.log(`[import-tengoku] imported ${records.length} from ${path}`);
  }
  for (const [shardKey, n] of rowsPerShard) {
    console.log(`[import-tengoku] shard ${shardKey}: ${n} rows this run`);
  }

  console.log('[import-tengoku] refreshing per-shard size stats...');
  for (const shardKey of allShardKeys()) {
    const sql = getShardSql(shardKey);
    const rows = await sql`SELECT count(*)::int AS n, pg_database_size(current_database())::bigint AS bytes FROM tengoku_entries;`;
    await updateShardRowStats(shardKey, rows[0]?.n ?? 0, Number(rows[0]?.bytes ?? 0));
  }

  console.log('[import-tengoku] refreshing stats cache...');
  const stats = await refreshTengokuStatsCache();

  console.log(
    `[import-tengoku] done, ${total} records imported across ${rowsPerShard.size} shard(s) this run ` +
      `(tentative=${byStatus.tentative}, trusted=${byStatus.trusted}); ` +
      `grand total now ${stats.total} (trusted=${stats.trusted}, tentative=${stats.tentative}, libraries=${stats.libraryCount})`,
  );
}

main().catch((err) => {
  console.error('[import-tengoku] failed:', err);
  process.exit(1);
});
