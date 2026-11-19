// What the bridge says about itself with the theorems it saves (see src/app/lib/leak-memory/harness.ts, which judges it). The Memory class attaches
// whatever its provider gives to every frame, and the bridge's build is the manifest the signing script signs.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import test from "node:test"

import { Memory } from "../../public/leak-memory.mjs"
import { manifestId, manifestText } from "../../scripts/bridge-signing/core.mjs"

const lemma = (n) => `theorem harness_lemma_${n} (a : ℕ) (hn : ${n} < a) : ${n} + 1 ≤ a := by\n  have h := hn\n  omega`

test("every saved or updated entry carries what the run says about itself, and none does when the run says nothing", () => {
  const frames = []
  const m = new Memory({ emit: (f) => frames.push(f), harness: () => ({ ticket: "v1.a.b", receipt: { seconds: 5 } }) })
  const [e] = m.addScript(lemma(1))
  m.setQuality(e.id, { s: 4, u: 0 })
  assert.deepEqual(frames.map((f) => f.op), ["save", "update"])
  for (const f of frames) assert.deepEqual(f.entry.harness, { ticket: "v1.a.b", receipt: { seconds: 5 } })
  const silent = []
  const m2 = new Memory({ emit: (f) => silent.push(f) })
  m2.addScript(lemma(2))
  assert.ok(!("harness" in silent[0].entry), "a Memory without a provider adds nothing")
  const seeds = []
  new Memory({ emit: (f) => seeds.push(f), harness: () => ({ x: 1 }) }).addScript(lemma(3), { origin: "seed", silent: true })
  assert.deepEqual(seeds, [], "a seed is saved to no account, so it says nothing")
})

test("the provider is asked afresh for every frame (the counters move)", () => {
  let n = 0
  const frames = []
  const m = new Memory({ emit: (f) => frames.push(f), harness: () => ({ receipt: { seconds: ++n } }) })
  m.addScript(lemma(4))
  m.addScript(lemma(5))
  assert.deepEqual(frames.map((f) => f.entry.harness.receipt.seconds), [1, 2])
})

test("the bridge names its files as the signed manifest does: the same files, in the same order", () => {
  const src = readFileSync(new URL("../../public/local-claude-bridge.mjs", import.meta.url), "utf8")
  const m = /const HARNESS_FILES = \[([^\]]*)\]/.exec(src)
  assert.ok(m, "HARNESS_FILES is declared in the bridge")
  const named = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
  const signed = JSON.parse(readFileSync(new URL("../../scripts/bridge-signing/files.json", import.meta.url), "utf8")).map((f) => f.local)
  assert.deepEqual(named, signed)
})

test("the manifest the bridge builds from its own files is the one the signing script signs", () => {
  // the bridge hashes its own file under the name the setup command gives it, and its siblings by name: the same lines as manifestText of public/
  const root = new URL("../..", import.meta.url).pathname
  const text = manifestText(root)
  assert.equal(text.split("\n").length, 7, "six lines and a final break")
  assert.equal(manifestId(text), createHash("sha256").update(text).digest("hex"))
})
