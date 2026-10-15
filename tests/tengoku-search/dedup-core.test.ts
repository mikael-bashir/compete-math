import { test } from "node:test";
import assert from "node:assert/strict";
import { collectTrusted, countAlreadyTrusted, records, statementKey, TrustedTokens } from "../../src/app/lib/data/tengoku-dedup-core";

const enc = new TextEncoder();
async function* chunked(text: string, size: number): AsyncGenerator<Uint8Array> {
  const bytes = enc.encode(text);
  for (let i = 0; i < bytes.length; i += size) yield bytes.slice(i, i + size);
}
const jsonl = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

async function tokens(trusted: object[], manifest: object[]): Promise<TrustedTokens> {
  const t = new TrustedTokens();
  await collectTrusted(t, chunked(jsonl(trusted), 5), true);
  await collectTrusted(t, chunked(jsonl(manifest), 5), false);
  return t;
}

test("a statement's identity drops its leading attributes and collapses whitespace, like stats.py", () => {
  assert.equal(statementKey("@[simp] theorem lemma2 : True"), "theorem lemma2 : True");
  assert.equal(statementKey("theorem lemma1 (n : ℕ) :\n    n + 0 = n"), "theorem lemma1 (n : ℕ) : n + 0 = n");
  assert.equal(statementKey(""), null);
  assert.equal(statementKey(42), null);
});

test("a record is a newline-terminated line, however the bytes are cut; a last line with no newline is not a record yet", async () => {
  const text = jsonl([{ name: "a" }, { name: "b" }]) + "not json\n" + JSON.stringify({ name: "no-newline" });
  for (const size of [1, 2, 3, 7, 1000]) {
    const names: unknown[] = [];
    for await (const r of records(chunked(text, size))) names.push(r.name);
    assert.deepEqual(names, ["a", "b"], `chunk size ${size}`);
  }
  const multibyte: unknown[] = [];
  for await (const r of records(chunked(jsonl([{ name: "ℕ→ℝ" }]), 1))) multibyte.push(r.name); // a character cut across chunks
  assert.deepEqual(multibyte, ["ℕ→ℝ"]);
});

test("a tentative record is already trusted by name (promoted) or by statement (bundle manifest), as in stats.py's test", async () => {
  const t = await tokens(
    [{ name: "lemma2", statement: "theorem lemma2 : True" }],
    [{ name: "Delta.lemma1", statement: "theorem lemma1 (n : ℕ) : n + 0 = n" }, { name: "Delta.extra", statement: "theorem extra : 2 = 2" }],
  );
  const tentative = jsonl([
    { name: "lemma1", statement: "theorem lemma1 (n : ℕ) :\n    n + 0 = n" },
    { name: "lemma2", statement: "@[simp] theorem lemma2 : True" },
    { name: "lemma3", statement: "theorem lemma3 : 1 = 1" },
    { name: "lemma4", statement: "theorem lemma4 : 4 = 4" },
  ]);
  assert.equal(await countAlreadyTrusted(t, chunked(tentative, 11)), 2);
  assert.equal(await countAlreadyTrusted(new TrustedTokens(), chunked(tentative, 11)), 0);
});

test("each trusted theorem accounts for one tentative record only: a repeated statement or name is not removed more often than the tree holds it", async () => {
  const t = await tokens([{ name: "dup", statement: "theorem dup : 1 = 1" }], [{ name: "A.lemma1", statement: "theorem lemma1 : True" }]);
  const tentative = jsonl([
    { name: "lemma1", statement: "theorem lemma1 : True" }, // one namespace's
    { name: "lemma1", statement: "theorem lemma1 : True" }, // another namespace's: a different theorem
    { name: "dup", statement: "theorem dup : 1 = 1" },
    { name: "dup", statement: "theorem dup : 2 = 2" }, // another theorem under the same bare name
  ]);
  assert.equal(await countAlreadyTrusted(t, chunked(tentative, 9)), 2);
  // and a theorem the tree holds twice accounts for two
  const twice = await tokens([], [{ name: "A.l", statement: "theorem l : True" }, { name: "B.l", statement: "theorem l : True" }]);
  assert.equal(await countAlreadyTrusted(twice, chunked(jsonl([{ name: "l", statement: "theorem l : True" }, { name: "l", statement: "theorem l : True" }, { name: "l", statement: "theorem l : True" }]), 7)), 2);
});

test("a last tentative line with no newline is neither counted nor subtracted: the subtraction cannot go below the count", async () => {
  const t = await tokens([], [{ name: "Z.a", statement: "theorem a : True" }, { name: "Z.b", statement: "theorem b : True" }]);
  const tentative = JSON.stringify({ name: "a", statement: "theorem a : True" }) + "\n" + JSON.stringify({ name: "b", statement: "theorem b : True" });
  assert.equal(await countAlreadyTrusted(t, chunked(tentative, 13)), 1);
});
