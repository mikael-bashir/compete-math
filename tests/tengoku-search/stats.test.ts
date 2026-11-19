import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFullStats, parseTreeStats } from "../../src/app/lib/data/tengoku-stats";

test("stats.json maps to the pills; staging counts as tentative", () => {
  const s = parseTreeStats({ totals: { trusted: 197362, staging: 32, tentative: 400944, all: 598338 }, library_count: 238, tree_commit: "abc" });
  assert.deepEqual({ ...s }, { total: 598338, trusted: 197362, tentative: 400976, libraryCount: 238, treeCommit: "abc", generatedAt: undefined });
});
test("a malformed stats.json throws so the page falls back", () => {
  assert.throws(() => parseTreeStats({}));
});

test("trustedLibraries counts the libraries of stats.json that hold a trusted theorem", () => {
  const raw = {
    totals: { trusted: 30, staging: 0, tentative: 100, all: 130 },
    library_count: 4,
    libraries: { a: { trusted: 10, staging: 0, tentative: 5 }, b: { trusted: 20, staging: 0, tentative: 0 }, c: { trusted: 0, staging: 0, tentative: 70 }, d: { trusted: 0, staging: 0, tentative: 25 } },
  };
  const s = parseFullStats(raw);
  assert.equal(s.libraries, 4); // every library with any records
  assert.equal(s.trustedLibraries, 2); // only a and b hold trusted theorems
});
test("trustedLibraries is null when stats.json has no per-library figures", () => {
  assert.equal(parseFullStats({ totals: { trusted: 1, staging: 0, tentative: 0, all: 1 } }).trustedLibraries, null);
});
