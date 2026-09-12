// Tengoku's theorem rows live across 20 separate free-tier Neon databases
// ("angel" services — ANGEL0_DATABASE_URL..ANGEL19_DATABASE_URL), not the
// main app database. Each free Neon project caps out at 512MB; Prove2Me
// alone (~870MB at full harvest, proofs are whole self-contained files) is
// bigger than any single one of them, so it's spread across several shards
// by a stable hash — and Mathlib (~188k rows, ~485MB once search metadata
// is counted) is spread the same way across MATHLIB_TARGETS.
//
// This module only decides *where a record goes*. It has no I/O.

export type ShardKey =
  | "mathlib"
  | "mathlib-0"
  | "mathlib-1"
  | "mathlib-2"
  | "misc"
  | "prove2me-0"
  | "prove2me-1"
  | "prove2me-2"
  | "prove2me-3"
  | "prove2me-4"
  | "prove2me-5"
  | "prove2me-6"
  | "prove2me-7"
  | "migrated-0"
  | "migrated-1"
  | "migrated-2"
  | "migrated-3"
  | "migrated-4"
  | "migrated-5"
  | "migrated-6";

export const PROVE2ME_BUCKET_COUNT = 8;

// Mathlib's own bucket set — ANGEL17-19. Mathlib originally had one shard
// to itself ("mathlib" = ANGEL0), which filled to Neon's cap partway
// through the search-metadata backfill and then could not accept a single
// write of any kind — not even the status flip to 'trusted'. On 2026-09-12
// every Mathlib row was moved off ANGEL0 (ids, embeddings and glosses
// preserved) onto these three shards, hashed by declaration NAME: a Mathlib
// name is the stable identity of a declaration across re-harvests, whereas
// its source_url carries the commit sha and line number and changes every
// time. Same rule as every other bucket set: never change this count once
// rows exist under it.
export const MATHLIB_BUCKET_COUNT = 3;

export const MATHLIB_TARGETS: ShardKey[] = ["mathlib-0", "mathlib-1", "mathlib-2"];

// Dedicated write target for the toolchain-migration pipeline's OUTPUT
// (Emissary-Archangel-translated entries) — ANGEL10-16, provisioned fresh
// and empty specifically for this, kept entirely separate from the
// mathlib/prove2me-N/misc hash space above. Deliberately NOT folded into
// PROVE2ME_BUCKET_COUNT or MISC_OVERFLOW_TARGETS: changing either of those
// reshuffles which bucket EVERY EXISTING row hashes to (the bucket count is
// baked into `hash % N`), which would desync already-written rows from
// where the code would look for them. A brand new, independent bucket set
// has no such risk. (Was 10 = ANGEL10-19 until 2026-09-12; ANGEL17-19 were
// reassigned to MATHLIB_TARGETS while every migrated-N shard was still
// empty, so no existing row was desynced.)
export const MIGRATION_BUCKET_COUNT = 7;

export const MIGRATION_TARGETS: ShardKey[] = [
  "migrated-0",
  "migrated-1",
  "migrated-2",
  "migrated-3",
  "migrated-4",
  "migrated-5",
  "migrated-6",
];

export const SHARDS: { key: ShardKey; envVar: string }[] = [
  // ANGEL0 no longer holds any Mathlib rows (see MATHLIB_TARGETS). It stays
  // registered because ~4k rows of small libraries landed on it before
  // per-record hashing existed and are still served from it by the search
  // fan-out. It is full: nothing routes writes to it any more.
  { key: "mathlib", envVar: "ANGEL0_DATABASE_URL" },
  { key: "mathlib-0", envVar: "ANGEL17_DATABASE_URL" },
  { key: "mathlib-1", envVar: "ANGEL18_DATABASE_URL" },
  { key: "mathlib-2", envVar: "ANGEL19_DATABASE_URL" },
  { key: "misc", envVar: "ANGEL1_DATABASE_URL" },
  { key: "prove2me-0", envVar: "ANGEL2_DATABASE_URL" },
  { key: "prove2me-1", envVar: "ANGEL3_DATABASE_URL" },
  { key: "prove2me-2", envVar: "ANGEL4_DATABASE_URL" },
  { key: "prove2me-3", envVar: "ANGEL5_DATABASE_URL" },
  { key: "prove2me-4", envVar: "ANGEL6_DATABASE_URL" },
  { key: "prove2me-5", envVar: "ANGEL7_DATABASE_URL" },
  { key: "prove2me-6", envVar: "ANGEL8_DATABASE_URL" },
  { key: "prove2me-7", envVar: "ANGEL9_DATABASE_URL" },
  { key: "migrated-0", envVar: "ANGEL10_DATABASE_URL" },
  { key: "migrated-1", envVar: "ANGEL11_DATABASE_URL" },
  { key: "migrated-2", envVar: "ANGEL12_DATABASE_URL" },
  { key: "migrated-3", envVar: "ANGEL13_DATABASE_URL" },
  { key: "migrated-4", envVar: "ANGEL14_DATABASE_URL" },
  { key: "migrated-5", envVar: "ANGEL15_DATABASE_URL" },
  { key: "migrated-6", envVar: "ANGEL16_DATABASE_URL" },
];

// FNV-1a — small, dependency-free, stable across Node versions (unlike
// String.prototype hash tricks that depend on engine internals).
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// A Prove2Me record's source_url is https://prove2.me/theorems/<uuid> — that
// uuid is stable across re-harvests, so hashing it (rather than the row's
// own future serial id) means rerunning the harvester lands each theorem in
// the same bucket every time.
function prove2meBucketKey(sourceUrl: string, name: string): string {
  const match = sourceUrl.match(/theorems\/([0-9a-f-]{8,})/i);
  return match ? match[1] : name;
}

// "misc" (ANGEL1) filled its 512MB free-tier cap — some harvested repos
// turned out to carry individually enormous proofs (LeanBridge's LMFDB
// q-expansion certificates run 400KB+ each). It still holds everything
// already imported there and stays fully searchable; it just can't safely
// accept more writes.
//
// "mathlib" (ANGEL0) filled up too, but for a different reason: adding
// per-row search metadata (embeddings + an HNSW index) turned out to cost
// ~4.4KB/row all-in — cheap per row, but mathlib alone held ~188k rows, so
// its *existing* content pushed it over 512MB partway through backfilling
// search metadata, even though the raw theorem text itself always fit
// comfortably. Its Mathlib rows have since moved to MATHLIB_TARGETS (see
// above); the ~124k of them whose metadata had already overflowed keep
// that metadata where it is, on the Prove2Me companion tables, keyed by
// the same preserved row ids.
//
// New small-library overflow (for brand new harvested content) and search
// metadata for existing full-shard rows are both hashed instead across the
// 8 Prove2Me shards, which each still have hundreds of MB of spare room
// (Prove2Me's own per-theorem hashing leaves real headroom in every
// bucket) — comfortably more combined capacity than either full shard
// needs to offload.
export const MISC_OVERFLOW_TARGETS: ShardKey[] = [
  "prove2me-0",
  "prove2me-1",
  "prove2me-2",
  "prove2me-3",
  "prove2me-4",
  "prove2me-5",
  "prove2me-6",
  "prove2me-7",
];

// Search metadata (embeddings, concept glosses, compatible-toolchain tags)
// for a row that lives on a shard with no room for it (misc, or mathlib
// once it filled up mid-backfill) goes to a companion table
// (`tengoku_search_meta_overflow`) on one of the 8 Prove2Me targets,
// bucketed by the row's own (source_url, name) — the same inputs
// `resolveShardKey` already hashes for new writes — so a row's metadata
// always lands on exactly the shard a fresh copy of that row would be
// routed to today, regardless of which now-full shard it actually lives
// on. One hashing scheme, reused for every "this shard is full" case.
export function resolveMiscOverflowMetaShard(sourceUrl: string, name: string): ShardKey {
  const bucket = fnv1a(sourceUrl || name) % MISC_OVERFLOW_TARGETS.length;
  return MISC_OVERFLOW_TARGETS[bucket];
}

export function resolveShardKey(library: string, sourceUrl: string, name: string): ShardKey {
  if (library === "mathlib") return MATHLIB_TARGETS[fnv1a(name) % MATHLIB_BUCKET_COUNT];
  if (library === "prove2me") {
    const bucket = fnv1a(prove2meBucketKey(sourceUrl, name)) % PROVE2ME_BUCKET_COUNT;
    return `prove2me-${bucket}` as ShardKey;
  }
  // Hashed per record (source_url, stable across reharvests), not per
  // library — a library-level hash puts an entire library in one target,
  // and some overflow libraries turn out to be individually huge (Lean
  // Bridge's LMFDB certificates alone ran ~450MB+), which just reproduces
  // the original "misc" overflow problem one shard later. Per-record
  // hashing spreads any single library's rows evenly across all 9 targets
  // regardless of its size.
  const bucket = fnv1a(sourceUrl || name) % MISC_OVERFLOW_TARGETS.length;
  return MISC_OVERFLOW_TARGETS[bucket];
}

// Where a toolchain-migration pipeline's OUTPUT row lands. `stableKey` should
// identify the SAME source theorem identically across reruns — the original
// row's source_url (Prove2Me's UUID) or, for CompeteMath's own 232, its
// numeric id — so re-running the migration on an already-processed theorem
// always lands back on the same shard instead of spreading duplicates. Never
// touches MISC_OVERFLOW_TARGETS or PROVE2ME_BUCKET_COUNT — see
// MIGRATION_BUCKET_COUNT's comment above for why migration output gets its
// own independent bucket set rather than sharing either existing one.
export function resolveMigrationShardKey(stableKey: string): ShardKey {
  const bucket = fnv1a(stableKey) % MIGRATION_BUCKET_COUNT;
  return MIGRATION_TARGETS[bucket];
}
