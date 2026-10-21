import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { CHEAP_TACTICS, takeEvents, judge, negation, outcome, splitStatement, withProof, asScript } from "../../tools/leak-vet/vet-core.mjs"

const erdos = JSON.parse(readFileSync(new URL("../../src/data/leak-targets/erdos-396.json", import.meta.url), "utf8"))

test("splitStatement reads the real target and rebuilds it with another tactic and as a negation", () => {
  const p = splitStatement(erdos.statement)
  assert.equal(p.name, "erdos_396")
  assert.match(p.prefix, /^open Nat in\s*$/)
  assert.equal(p.prop, "∀ k : ℕ, ∃ n : ℕ, descFactorial n (k + 1) ∣ centralBinom n")
  assert.match(withProof(p, "decide"), /^open Nat in\s*\ntheorem erdos_396 : ∀ k : ℕ, ∃ n : ℕ, .* := by\n  decide\n$/)
  assert.match(negation(p, "simp"), /theorem erdos_396_neg : ¬ \(∀ k : ℕ, ∃ n : ℕ, .*\) := by\n  simp\n$/)
})

test("a statement with binders before the colon, or no sorry, is not a plain form", () => {
  assert.equal(splitStatement("theorem t (n : ℕ) : n = n := by\n  sorry"), null)
  assert.equal(splitStatement("theorem t : 1 = 1 := by\n  rfl"), null)
  assert.ok(splitStatement("theorem t : 1 = 1 := by\n  sorry"))
})

test("asScript adds the import header only when there is none", () => {
  assert.equal(asScript("theorem t : True := trivial"), "import Mathlib\ntheorem t : True := trivial")
  assert.equal(asScript("import Mathlib\ntheorem t : True := trivial"), "import Mathlib\ntheorem t : True := trivial")
})

test("outcome reads the verifier the way the bridge does", () => {
  assert.equal(outcome("✅ Compilation Successful! The proof is 100% verified.").ok, true)
  const sorryOnly = outcome("❌ Compilation Failed:\nLine 2 (Warning): declaration uses `sorry`")
  assert.equal(sorryOnly.ok, false)
  assert.equal(sorryOnly.onlySorry, true)
  const bad = outcome("❌ Compilation Failed:\nLine 3 (Error): unsolved goals")
  assert.deepEqual(bad.errors, ["unsolved goals"])
  assert.equal(bad.onlySorry, false)
  assert.equal(outcome("❌ Compilation Failed:\nLine 40 (Error): statement form repudiated: t states an answer slot").repudiated, true)
  // success text next to a failure header is a failure, as in the bridge
  assert.equal(outcome("Compilation Successful ... ❌ Compilation Failed").ok, false)
})

const fail = { ok: false, failed: true, errors: ["x"] }
const ok = { ok: true, failed: false, errors: [] }
const healthy = () => ({
  compile: { ok: false, failed: true, errors: [], sorry: true, onlySorry: true },
  control: { easyTrue: true, easyFalse: false },
  cheap: {
    statement: Object.fromEntries(CHEAP_TACTICS.map((t) => [t, fail])),
    negation: Object.fromEntries(CHEAP_TACTICS.map((t) => [t, fail])),
  },
  seeds: [ok],
})
const failing = (verdicts) => verdicts.filter((v) => !v.pass).map((v) => v.name)

test("a healthy open-problem target passes every check", () => {
  assert.deepEqual(failing(judge(erdos, healthy())), [])
})

test("a statement a cheap tactic closes is flagged, whichever form it closes", () => {
  const a = healthy()
  a.cheap.statement.decide = ok
  assert.deepEqual(failing(judge(erdos, a)), ["no cheap tactic closes the statement"])
  const b = healthy()
  b.cheap.negation.simp = ok
  assert.deepEqual(failing(judge(erdos, b)), ["no cheap tactic closes the negation"])
})

test("a broken tactic battery cannot vouch for a target (it closes a falsehood, or nothing at all)", () => {
  const a = healthy()
  a.control = { easyTrue: true, easyFalse: true }
  assert.equal(failing(judge(erdos, a)).length, 1)
  const b = healthy()
  b.control = { easyTrue: false, easyFalse: false }
  assert.equal(failing(judge(erdos, b)).length, 1)
})

test("a statement that does not compile, uses the repudiated slot, or has a failing seed is flagged", () => {
  const a = healthy()
  a.compile = { ok: false, failed: true, errors: ["unknown identifier"], sorry: false, onlySorry: false }
  assert.equal(failing(judge(erdos, a)).length, 1)
  const b = healthy()
  b.compile = { ok: false, failed: true, errors: ["statement form repudiated: x"], sorry: false, onlySorry: false, repudiated: true }
  assert.equal(failing(judge(erdos, b)).length, 1)
  const c = healthy()
  c.seeds = [fail]
  assert.equal(failing(judge(erdos, c)).length, 1)
  const d = healthy()
  d.seeds = []
  assert.equal(failing(judge(erdos, d)).length, 1, "a missing seed result is not a pass")
})

test("a target with no informal reading or provenance is flagged", () => {
  assert.equal(failing(judge({ ...erdos, informal: "" }, healthy())).length, 1)
  assert.equal(failing(judge({ ...erdos, provenance: {} }, healthy())).length, 1)
})

test("takeEvents splits events ended by CRLF as well as LF, and keeps a half event for the next chunk", () => {
  const a = takeEvents("event: endpoint\r\ndata: /message?sessionId=ab\r\n\r\nevent: message\r\ndata: {\"id\":1}\r\n\r\nevent: mess")
  assert.deepEqual(a.events, [{ event: "endpoint", data: "/message?sessionId=ab" }, { event: "message", data: '{"id":1}' }])
  assert.equal(a.rest, "event: mess")
  const b = takeEvents(a.rest + "age\ndata: {\"id\":2}\n\n: keep-alive\n\n")
  assert.deepEqual(b.events[0], { event: "message", data: '{"id":2}' })
  assert.deepEqual(b.events[1], { event: "", data: "" })
})
