import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommit, byLibrary, needsDirectCount, totalOf, type CommitFile } from "../../src/app/lib/data/tengoku-tentative-core";

const f = (filename: string, status: string, additions = 0, deletions = 0, previous_filename?: string): CommitFile => ({ filename, status, additions, deletions, previous_filename });

test("only data/tentative/<library>.jsonl counts; a subfolder does not (stats.py globs one level)", () => {
  const s = applyCommit({}, [f("data/tentative/a.jsonl", "added", 10), f("data/tentative/openai-math/001.jsonl", "added", 99), f("data/trusted/a.jsonl", "added", 5)]);
  assert.deepEqual(s, { "data/tentative/a.jsonl": 10 });
});

test("a modification adds additions and takes away deletions", () => {
  const s = applyCommit({ "data/tentative/a.jsonl": 10 }, [f("data/tentative/a.jsonl", "modified", 7, 3)]);
  assert.equal(totalOf(s), 14);
});

test("a rename carries the count, with or without edits, and a move out of the folder drops it", () => {
  const start = { "data/tentative/a.jsonl": 10 };
  assert.deepEqual(applyCommit(start, [f("data/tentative/b.jsonl", "renamed", 0, 0, "data/tentative/a.jsonl")]), { "data/tentative/b.jsonl": 10 });
  assert.deepEqual(applyCommit(start, [f("data/tentative/b.jsonl", "renamed", 4, 1, "data/tentative/a.jsonl")]), { "data/tentative/b.jsonl": 13 });
  assert.deepEqual(applyCommit(start, [f("data/tentative/sub/a.jsonl", "renamed", 0, 0, "data/tentative/a.jsonl")]), {});
});

test("a removed file takes its lines with it", () => {
  assert.deepEqual(applyCommit({ "data/tentative/a.jsonl": 10 }, [f("data/tentative/a.jsonl", "removed", 0, 10)]), {});
});

test("a file GitHub gave no counts for must be counted directly, and the replay refuses to guess", () => {
  const added = f("data/tentative/a.jsonl", "added");
  assert.ok(needsDirectCount(added));
  assert.throws(() => applyCommit({}, [added]), /no direct count/);
  assert.deepEqual(applyCommit({}, [added], { "data/tentative/a.jsonl": 42 }), { "data/tentative/a.jsonl": 42 });
  assert.ok(!needsDirectCount(f("data/tentative/a.jsonl", "renamed")));
  assert.throws(() => applyCommit({}, [f("data/tentative/a.jsonl", "weird", 1)]), /unknown file status/);
});

test("the library of a file is its name without the extension", () => {
  assert.deepEqual(byLibrary({ "data/tentative/aintlib.jsonl": 3, "data/tentative/zero.jsonl": 0 }), { aintlib: 3 });
});
