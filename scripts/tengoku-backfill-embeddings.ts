// Computes concept_gloss + embedding for every Tengoku row that doesn't have
// one yet, writing to tengoku_entries directly where there's room, or to the
// search-meta overflow companion table (bucketed by
// resolveMiscOverflowMetaShard) once a shard fills up. Resumable: direct
// shards are paged via `WHERE embedding IS NULL`; overflow shards are paged
// by id with an existence check against the overflow table, since the
// source row itself never changes. Run with:
//   node --env-file=.env $(which npx) tsx scripts/tengoku-backfill-embeddings.ts
import {
  allShardKeys,
  getShardSql,
  type ShardSql,
} from "../src/app/lib/data/tengoku-shard-clients";
import { resolveMiscOverflowMetaShard, type ShardKey } from "../src/app/lib/data/tengoku-shard-config";
import { buildConceptGloss } from "../src/app/lib/data/tengoku-gloss";
import { embedTexts, toPgVector } from "../src/app/lib/data/tengoku-embeddings";

const BATCH_SIZE = 64;
const NEON_SIZE_LIMIT_CODE = "53100"; // "could not extend file because project size limit has been exceeded"

interface Row {
  id: number;
  name: string;
  statement: string;
  library: string;
  source_url: string;
}

function isSizeLimitError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === NEON_SIZE_LIMIT_CODE;
}

async function embedBatch(rows: Row[]): Promise<{ ids: number[]; glosses: string[]; vectors: string[] }> {
  const glosses = rows.map((r) => buildConceptGloss(r));
  const vecs = await embedTexts(glosses);
  return {
    ids: rows.map((r) => r.id),
    glosses,
    vectors: vecs.map(toPgVector),
  };
}

const overflowSqlCache = new Map<ShardKey, ShardSql>();
function getOverflowSql(key: ShardKey): ShardSql {
  let s = overflowSqlCache.get(key);
  if (!s) {
    s = getShardSql(key);
    overflowSqlCache.set(key, s);
  }
  return s;
}

// Pages through `sourceKey`'s own rows (whether or not it has room for its
// own embedding column) and writes their search metadata to whichever
// overflow shard each row's (source_url, name) hashes to. Used for misc
// from the start, and for any other shard once its direct path hits the
// project size limit.
async function backfillViaOverflow(sourceKey: ShardKey, startOffset = 0): Promise<number> {
  const source = getShardSql(sourceKey);
  let offset = startOffset;
  let totalDone = 0;
  for (;;) {
    const rows = (await source`
      SELECT id, name, statement, library, source_url
      FROM tengoku_entries
      ORDER BY id
      LIMIT ${BATCH_SIZE}
      OFFSET ${offset};
    `) as Row[];
    if (rows.length === 0) break;

    const byTarget = new Map<ShardKey, Row[]>();
    for (const r of rows) {
      const target = resolveMiscOverflowMetaShard(r.source_url, r.name);
      const list = byTarget.get(target) ?? [];
      list.push(r);
      byTarget.set(target, list);
    }

    for (const [target, targetRows] of byTarget) {
      const targetSql = getOverflowSql(target);
      const ids = targetRows.map((r) => r.id);
      const existing = await targetSql`
        SELECT entry_id FROM tengoku_search_meta_overflow WHERE entry_id = ANY(${ids}::int[]);
      `;
      const existingIds = new Set((existing as { entry_id: number }[]).map((e) => e.entry_id));
      const pending = targetRows.filter((r) => !existingIds.has(r.id));
      if (pending.length === 0) continue;

      const { ids: pendingIds, glosses, vectors } = await embedBatch(pending);
      await targetSql`
        INSERT INTO tengoku_search_meta_overflow (entry_id, concept_gloss, embedding)
        SELECT unnest(${pendingIds}::int[]), unnest(${glosses}::text[]), unnest(${vectors}::text[])::vector
        ON CONFLICT (entry_id) DO UPDATE SET
          concept_gloss = EXCLUDED.concept_gloss,
          embedding = EXCLUDED.embedding,
          updated_at = NOW();
      `;
      console.log(`[${sourceKey} -> ${target}] +${pending.length}`);
    }
    offset += rows.length;
    totalDone += rows.length;
    console.log(`[${sourceKey}] paged ${offset}`);
  }
  return totalDone;
}

// Tries to embed `key`'s own rows inline (its own embedding column). If the
// shard fills up mid-run (Neon's 512MB project cap), falls back to routing
// its *remaining* rows through the overflow mechanism instead of crashing
// the whole backfill — this is exactly how mathlib was discovered to need
// it: it had room for its base content but not for ~188k rows' worth of
// embeddings + HNSW index on top.
async function backfillDirectShard(key: ShardKey): Promise<number> {
  const sql = getShardSql(key);
  let totalDone = 0;
  for (;;) {
    const rows = (await sql`
      SELECT id, name, statement, library, source_url
      FROM tengoku_entries
      WHERE embedding IS NULL
      ORDER BY id
      LIMIT ${BATCH_SIZE};
    `) as Row[];
    if (rows.length === 0) break;

    const { ids, glosses, vectors } = await embedBatch(rows);
    try {
      await sql`
        UPDATE tengoku_entries AS t
        SET concept_gloss = v.gloss, embedding = v.embedding::vector
        FROM (
          SELECT unnest(${ids}::int[]) AS id,
                 unnest(${glosses}::text[]) AS gloss,
                 unnest(${vectors}::text[]) AS embedding
        ) AS v
        WHERE t.id = v.id;
      `;
      totalDone += rows.length;
      console.log(`[${key}] +${rows.length} (total ${totalDone})`);
    } catch (e) {
      if (!isSizeLimitError(e)) throw e;
      // `totalDone` only counts rows committed in *this* invocation — on a
      // resumed run it starts back at 0 even though earlier rows already
      // have inline embeddings from a previous run. The overflow pass pages
      // by raw offset over every row (not `embedding IS NULL`), so it needs
      // the *actual* already-embedded count, queried fresh, or it would
      // needlessly re-embed and duplicate-write rows that already have a
      // perfectly good inline embedding.
      const [{ n: alreadyEmbedded }] = (await sql`
        SELECT count(*)::int AS n FROM tengoku_entries WHERE embedding IS NOT NULL;
      `) as { n: number }[];
      console.warn(
        `[${key}] hit the project size limit (${alreadyEmbedded} rows already embedded inline) — switching remaining rows to overflow routing`,
      );
      totalDone = alreadyEmbedded + (await backfillViaOverflow(key, alreadyEmbedded));
      break;
    }
  }
  return totalDone;
}

async function main() {
  const start = Date.now();
  const nonMisc = allShardKeys().filter((k) => k !== "misc");
  let grandTotal = 0;
  for (const key of nonMisc) {
    grandTotal += await backfillDirectShard(key);
  }
  grandTotal += await backfillViaOverflow("misc");
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone. ${grandTotal} rows embedded in ${elapsed}s.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
