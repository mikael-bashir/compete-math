// Loads Tengoku's harvested JSONL files (github.com/competemath/tengoku,
// data/*.jsonl) into the tengoku_entries table so /tengoku can search them.
// Idempotent-ish: re-running re-inserts everything (no upsert key — a
// harvested statement has no natural unique id across re-harvests of a
// moving library HEAD), so this is meant to be run against a fresh table or
// followed by a manual TRUNCATE, not run repeatedly against the same data.
//
// The CREATE TABLE here mirrors src/app/api/admin/migrate/route.ts exactly
// (that route is the canonical schema source) so this script is runnable on
// its own without going through an authenticated HTTP call first.
//
// Usage:
//   node --env-file=.env $(which npx) tsx scripts/import-tengoku.ts /path/to/tengoku-repo/data/*.jsonl

import { sql } from '@vercel/postgres';
import { readFileSync } from 'node:fs';

interface TengokuRecord {
  name: string;
  statement: string;
  library: string;
  source_url: string;
  toolchain: string;
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS tengoku_entries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      statement TEXT NOT NULL,
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
}

function parseJsonl(path: string): TengokuRecord[] {
  const text = readFileSync(path, 'utf-8');
  const records: TengokuRecord[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (err) {
      console.error(`[import-tengoku] skipping malformed line in ${path}: ${err}`);
    }
  }
  return records;
}

const CHUNK_SIZE = 500;

// unnest()-based bulk insert — one round trip per chunk instead of one per
// row, which matters at Tengoku's scale (thousands of rows per library).
async function insertBatch(records: TengokuRecord[]) {
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    await sql.query(
      `INSERT INTO tengoku_entries (name, statement, library, source_url, toolchain)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])`,
      [
        chunk.map((r) => r.name),
        chunk.map((r) => r.statement),
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

  await ensureTable();
  console.log('[import-tengoku] table ready');

  let total = 0;
  for (const path of paths) {
    const records = parseJsonl(path);
    await insertBatch(records);
    total += records.length;
    console.log(`[import-tengoku] imported ${records.length} from ${path}`);
  }
  console.log(`[import-tengoku] done, ${total} total records imported`);
}

main().catch((err) => {
  console.error('[import-tengoku] failed:', err);
  process.exit(1);
});
