// Tengoku's theorem rows live across 10 separate free-tier Neon databases
// ("angel" services — ANGEL0_DATABASE_URL..ANGEL9_DATABASE_URL), not the
// main app database. Each free Neon project caps out at 512MB; Prove2Me
// alone (~870MB at full harvest, proofs are whole self-contained files) is
// bigger than any single one of them, so it's spread across several shards
// by a stable hash. Mathlib and every small library get one shard each,
// since they comfortably fit with room to grow.
//
// This module only decides *where a record goes*. It has no I/O.

export type ShardKey =
  | "mathlib"
  | "misc"
  | "prove2me-0"
  | "prove2me-1"
  | "prove2me-2"
  | "prove2me-3"
  | "prove2me-4"
  | "prove2me-5"
  | "prove2me-6"
  | "prove2me-7";

export const PROVE2ME_BUCKET_COUNT = 8;

export const SHARDS: { key: ShardKey; envVar: string }[] = [
  { key: "mathlib", envVar: "ANGEL0_DATABASE_URL" },
  { key: "misc", envVar: "ANGEL1_DATABASE_URL" },
  { key: "prove2me-0", envVar: "ANGEL2_DATABASE_URL" },
  { key: "prove2me-1", envVar: "ANGEL3_DATABASE_URL" },
  { key: "prove2me-2", envVar: "ANGEL4_DATABASE_URL" },
  { key: "prove2me-3", envVar: "ANGEL5_DATABASE_URL" },
  { key: "prove2me-4", envVar: "ANGEL6_DATABASE_URL" },
  { key: "prove2me-5", envVar: "ANGEL7_DATABASE_URL" },
  { key: "prove2me-6", envVar: "ANGEL8_DATABASE_URL" },
  { key: "prove2me-7", envVar: "ANGEL9_DATABASE_URL" },
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
// accept more writes. New small-library overflow is hashed instead across
// mathlib's shard and all 8 Prove2Me shards, which each still have
// hundreds of MB of spare room (mathlib is a fixed one-time import that
// doesn't grow, and Prove2Me's per-theorem hashing leaves real headroom in
// every bucket) — far more combined capacity than provisioning one more
// shard for "misc" alone would give.
const MISC_OVERFLOW_TARGETS: ShardKey[] = [
  "mathlib",
  "prove2me-0",
  "prove2me-1",
  "prove2me-2",
  "prove2me-3",
  "prove2me-4",
  "prove2me-5",
  "prove2me-6",
  "prove2me-7",
];

export function resolveShardKey(library: string, sourceUrl: string, name: string): ShardKey {
  if (library === "mathlib") return "mathlib";
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
