import { test } from "node:test";
import assert from "node:assert/strict";
import { countNewlines, selectCounted } from "../../src/app/lib/data/tengoku-live-count-core";

const f = (path: string) => ({ path, sha: "x" });

test("only the top-level trusted and staging files and each intake manifest are counted", () => {
  const sel = selectCounted([
    f("data/trusted/mathlib.jsonl"),
    f("data/trusted/nested/inner.jsonl"),
    f("data/trusted/readme.md"),
    f("data/staging/foo.jsonl"),
    f("data/staging/dir/bar.jsonl"),
    f("data/tentative/huge.jsonl"),
    f("data/intake/add-combi/manifest.jsonl"),
    f("data/intake/add-combi/other.jsonl"),
    f("data/intake/manifest.jsonl"),
    f("data/stats.json"),
  ]);
  assert.deepEqual(sel.trusted.map((x) => x.path), ["data/trusted/mathlib.jsonl"]);
  assert.deepEqual(sel.staging.map((x) => x.path), ["data/staging/foo.jsonl"]);
  assert.deepEqual(sel.intake.map((x) => x.path), ["data/intake/add-combi/manifest.jsonl"]);
});

test("a record is a newline, whichever way the bytes are cut into chunks", () => {
  const text = new TextEncoder().encode('{"a":1}\n{"b":2}\n\n{"c":3}\n');
  assert.equal(countNewlines([text]), 4);
  for (let cut = 0; cut <= text.length; cut++) assert.equal(countNewlines([text.slice(0, cut), text.slice(cut)]), 4, `cut at ${cut}`);
  assert.equal(countNewlines([]), 0);
  assert.equal(countNewlines([new Uint8Array([])]), 0);
  assert.equal(countNewlines([new TextEncoder().encode("no newline at the end")]), 0);
});
