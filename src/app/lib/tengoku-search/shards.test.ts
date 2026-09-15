import { test } from "node:test";
import assert from "node:assert/strict";
import { fnv1a, shardIndexFor, declName, DEFAULT_DATA_SHARDS } from "./shards";

test("the name hash is stable and spreads", () => {
  assert.equal(fnv1a("Nat.add_comm"), fnv1a("Nat.add_comm"));
  const buckets = new Set(["Nat.add_comm", "add_comm", "List.reverse_reverse", "Real.sqrt_nonneg", "Finset.sum_range_succ", "abs_nonneg", "mul_comm", "Nat.Prime"].map((n) => shardIndexFor(n, 7)));
  assert.ok(buckets.size >= 4, `only ${buckets.size} buckets used`);
  assert.ok(DEFAULT_DATA_SHARDS.every((k) => shardIndexFor("x", DEFAULT_DATA_SHARDS.length) < DEFAULT_DATA_SHARDS.length && k.endsWith("_DATABASE_URL")));
});
test("ids carry the library prefix and the name after it", () => {
  assert.equal(declName("mathlib/Nat.add_comm"), "Nat.add_comm");
  assert.equal(declName("equational-theories/Equation1_implies_Equation2"), "Equation1_implies_Equation2");
});
