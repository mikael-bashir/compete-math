import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTreeStats } from "../../src/app/lib/data/tengoku-stats";

test("stats.json maps to the pills; staging counts as tentative", () => {
  const s = parseTreeStats({ totals: { trusted: 197362, staging: 32, tentative: 400944, all: 598338 }, library_count: 238, tree_commit: "abc" });
  assert.deepEqual({ ...s }, { total: 598338, trusted: 197362, tentative: 400976, libraryCount: 238, treeCommit: "abc", generatedAt: undefined });
});
test("a malformed stats.json throws so the page falls back", () => {
  assert.throws(() => parseTreeStats({}));
});
