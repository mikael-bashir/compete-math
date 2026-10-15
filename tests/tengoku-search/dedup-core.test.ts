import { test } from "node:test";
import assert from "node:assert/strict";
import { collectTrusted, countAlreadyTrusted, records, statementKey, type Trusted } from "../../src/app/lib/data/tengoku-dedup-core";

const enc = new TextEncoder();
async function* chunked(text: string, size: number): AsyncGenerator<Uint8Array> {
  const bytes = enc.encode(text);
  for (let i = 0; i < bytes.length; i += size) yield bytes.slice(i, i + size);
}
const jsonl = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

test("a statement's identity drops its leading attributes and collapses whitespace, like stats.py", () => {
  assert.equal(statementKey("@[simp] theorem lemma2 : True"), "theorem lemma2 : True");
  assert.equal(statementKey("theorem lemma1 (n : ℕ) :\n    n + 0 = n"), "theorem lemma1 (n : ℕ) : n + 0 = n");
  assert.equal(statementKey(""), null);
  assert.equal(statementKey(42), null);
});

test("records are read whole however the bytes are cut, including a last line with no newline and a multi-byte character on a cut", async () => {
  const text = jsonl([{ name: "a", statement: "theorem a : ℕ = ℕ" }, { name: "b" }]).slice(0, -1) + "\nnot json\n" + JSON.stringify({ name: "c" });
  for (const size of [1, 2, 3, 7, 1000]) {
    const names: unknown[] = [];
    for await (const r of records(chunked(text, size))) names.push(r.name);
    assert.deepEqual(names, ["a", "b", "c"], `chunk size ${size}`);
  }
});

test("a tentative record is already trusted by name (promoted) or by statement (bundle manifest), as in stats.py's test", async () => {
  const trusted: Trusted = { names: new Set(), keys: new Set() };
  await collectTrusted(trusted, chunked(jsonl([{ name: "lemma2", statement: "theorem lemma2 : True" }]), 5), true);
  await collectTrusted(trusted, chunked(jsonl([{ name: "Delta.lemma1", statement: "theorem lemma1 (n : ℕ) : n + 0 = n" }, { name: "Delta.extra", statement: "theorem extra : 2 = 2" }]), 5), false);
  const tentative = jsonl([
    { name: "lemma1", statement: "theorem lemma1 (n : ℕ) :\n    n + 0 = n" },
    { name: "lemma2", statement: "@[simp] theorem lemma2 : True" },
    { name: "lemma3", statement: "theorem lemma3 : 1 = 1" },
    { name: "lemma4", statement: "theorem lemma4 : 4 = 4" },
  ]);
  assert.equal(await countAlreadyTrusted(trusted, chunked(tentative, 11)), 2);
  assert.equal(await countAlreadyTrusted({ names: new Set(), keys: new Set() }, chunked(tentative, 11)), 0);
  assert.equal(trusted.names.has("Delta.lemma1"), false); // a manifest contributes statements, not names
});
