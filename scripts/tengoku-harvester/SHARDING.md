# Tengoku's storage: 10 sharded databases, not the main app DB

Tengoku's theorem rows (statement + full proof) never touch CompeteMath's
main Postgres database. They live across 10 separate free-tier Neon
databases — `ANGEL0_DATABASE_URL` .. `ANGEL9_DATABASE_URL` in `.env`, each
its own project with its own 512MB storage cap. This exists because
Prove2Me's full harvest alone is ~870MB (its proofs are whole self-contained
files, not just a lemma body) — bigger than any single free Neon project.

The main app database keeps only the control plane (see the
`tengoku_shards`, `tengoku_stats_cache`, and `tengoku_popularity` tables
created in `src/app/api/admin/migrate/route.ts`): which shard owns which
library, per-shard monthly query counts, a cached stats snapshot, and
popularity counts. No theorem text lives there.

## Where a record goes

`src/app/lib/data/tengoku-shard-config.ts` is the single source of truth:

- `mathlib` → its own shard (`ANGEL0`) — 188k declarations but small rows
  (~700 bytes avg), comfortably under 512MB with room to grow.
- Every other small library (equational-theories, PrimeNumberTheoremAnd,
  compfiles, Carleson, FLT, formal-conjectures, batteries, pfr,
  CompeteMath's own certified problems) → one shared `misc` shard (`ANGEL1`)
  — all of them combined are ~35MB.
- `prove2me` → hash-bucketed across 8 shards (`ANGEL2`..`ANGEL9`) by a
  stable hash of the theorem's Prove2Me UUID (parsed from `source_url`), so
  rerunning the harvester lands each theorem in the same bucket every time.

## Usage governance

Neon's free tier is metered in compute-hours, which a plain SQL client
can't read back. `src/app/lib/data/tengoku-shard-usage.ts` tracks *query
count* per shard per calendar month instead, as a deliberately conservative
stand-in, and flips a shard to `resting` the moment it crosses its budget
(`tengoku_shards.monthly_query_budget`, default 20,000/month) — every
subsequent search that month just skips that shard rather than risking a
throttled or suspended connection. It resets automatically at the start of
the next month. This is a safety margin, not a real reading of Neon's own
billing meter — tune the budget if it turns out to be too conservative.

Search (`searchTengokuEntries` in `src/app/lib/data/tengoku.ts`) fans out to
every active shard, merges by rank, and degrades gracefully: a resting or
erroring shard just contributes nothing to that search rather than failing
it. `tengoku_popularity` tracks which rows actually get returned, as a
future signal for spotting a shard whose content is disproportionately
hot — it never duplicates theorem text onto the main database.

The public stats pill on `/tengoku` reads a cached snapshot
(`tengoku_stats_cache`), refreshed by the importer after each run — a page
load never fans out to 10 databases just to show a count.

## Running the importer

Unchanged from the harvester's point of view — `import-tengoku.ts` reads
the same JSONL files and routes each record to its shard automatically:

```bash
node --env-file=.env $(which npx) tsx scripts/import-tengoku.ts \
  /path/to/tengoku-repo/data/tentative/*.jsonl \
  /path/to/tengoku-repo/data/trusted/*.jsonl
```

It creates `tengoku_entries` on whichever shards it actually writes to (IF
NOT EXISTS, safe to rerun), bulk-inserts in 500-row chunks per shard, then
refreshes both the per-shard size stats and the stats cache on the main
database.
