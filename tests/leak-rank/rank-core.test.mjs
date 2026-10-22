// The ranking rules, read from fixtures shaped like real banked entries. Nothing here touches the network.
import test from "node:test"
import assert from "node:assert/strict"
import { CONTROLS, QUIET, declaredNames, distribution, features, isGround, normalise, probeScripts, proofShape, splitClosure, splitHeader, stars, summariseReading } from "../../tools/leak-rank/rank-core.mjs"
import { KINDS, parseReading, readingPrompt } from "../../tools/leak-rank/reading.mjs"
import { reportCsv, reportHtml, reportMd, starText } from "../../tools/leak-rank/report.mjs"

const entry = (name, closure, extra = {}) => ({ key: normalise(closure), entry: { name, closure, statement: closure.split(":=")[0], origin: "verified", ...extra }, runs: [{ run: "r1" }] })
const HELPER = `theorem near_neg_mod (p s : ℕ) (hp : 2 ≤ p) : p ^ s % p = 0 ∨ True := by\n  right; trivial\n\n`
const MAIN = `open Nat in\ntheorem cb_val (p m : ℕ) (hp : p.Prime) (h : 1 ≤ m) :\n    m ≤ (centralBinom p).factorization p := by\n  have := near_neg_mod p m hp.two_le\n  omega\n`
const NUMERIC = `theorem E396_k1 : (2 : ℕ).descFactorial 2 ∣ (2 : ℕ).centralBinom := by\n  decide +kernel\n`
const KEY = `theorem erdos396_of_thing (h : Thing) : ∀ k : ℕ, ∃ n : ℕ, descFactorial n (k + 1) ∣ centralBinom n := by\n  intro k\n  exact h k\n`
const TARGET = "∀ k : ℕ, ∃ n : ℕ, descFactorial n (k + 1) ∣ centralBinom n"

test("declaredNames and splitClosure find the entry's own declaration after its helpers, with its open line", () => {
  const closure = HELPER + MAIN
  assert.deepEqual(declaredNames(closure).map((d) => d.name), ["near_neg_mod", "cb_val"])
  const p = splitClosure(closure, "cb_val")
  assert.ok(p.helpers.includes("near_neg_mod") && !p.helpers.includes("cb_val"))
  assert.match(p.header, /^open Nat in\s*\ntheorem cb_val/)
  assert.ok(p.header.endsWith("(centralBinom p).factorization p"))
  assert.match(p.proof, /^by\s+have/)
  assert.equal(splitClosure("def x := 1", "x"), null, "no theorem to rank")
})

test("splitHeader separates the binders from the proposition, however many brackets the binders hold", () => {
  const h = splitHeader("theorem t (a : {x : ℕ // x > 0}) [Fact p.Prime] (h : a.1 = 2) : a.1 + 1 = 3")
  assert.equal(h.prop, "a.1 + 1 = 3")
  assert.match(h.binders, /Fact p\.Prime/)
})

test("a numeric fact has no variable; a statement with a binder or a quantifier is not one", () => {
  assert.equal(isGround(splitClosure(NUMERIC, "E396_k1").header), true)
  assert.equal(isGround(splitClosure(MAIN, "cb_val").header), false)
  assert.equal(isGround("theorem t : ∀ n : ℕ, n = n"), false)
  assert.equal(isGround("theorem t : (6 : ℕ) ∣ Nat.centralBinom 6 ∧ ¬ (78 : ℕ) ∣ Nat.centralBinom 78"), true)
})

test("proofShape counts the proof's lines and recognises a one-line automatic proof", () => {
  assert.equal(proofShape("by\n  decide +kernel").lines, 2)
  assert.equal(proofShape("by decide").oneLiner, true)
  assert.equal(proofShape("by simp").oneLiner, true)
  assert.equal(proofShape("by\n  intro k\n  exact h k").oneLiner, false)
})

test("features: use by other entries comes from the helpers an entry's closure carries; the target-stating entry is the keystone; a repeat is a duplicate", () => {
  const entries = [entry("near_neg_mod", HELPER), entry("cb_val", HELPER + MAIN), entry("E396_k1", NUMERIC), entry("erdos396_of_thing", KEY), entry("copy_of_k1", NUMERIC.replace("E396_k1", "copy_of_k1"))]
  const f = features(entries, TARGET)
  const by = Object.fromEntries(f.map((x) => [x.name, x]))
  assert.equal(by.near_neg_mod.usedBy, 1)
  assert.equal(by.cb_val.usedBy, 0)
  assert.equal(by.E396_k1.ground, true)
  assert.equal(by.erdos396_of_thing.keystone, true)
  assert.equal(by.cb_val.keystone, false)
  assert.equal(by.copy_of_k1.duplicateOf, "E396_k1")
  assert.equal(by.E396_k1.duplicateOf, null)
})

test("probeScripts keeps the helpers and the statement and swaps the proof for a tactic", () => {
  const s = probeScripts(entry("cb_val", HELPER + MAIN).entry)
  assert.ok(s.cheap.startsWith("import Mathlib\n"))
  assert.ok(s.cheap.includes("theorem near_neg_mod") && s.cheap.includes("theorem cb_val"))
  assert.ok(s.cheap.trimEnd().endsWith("first | decide | simp | omega | norm_num | aesop | positivity"))
  assert.ok(s.cheap.includes(QUIET + "open Nat in"), "the unreachable-tactic warnings of `first` are switched off for the probed declaration, or Leak IV would call every probe a failure")
  assert.ok(s.library.includes(QUIET), "harmless for exact?, and one place builds both")
  assert.ok(s.library.trimEnd().endsWith(":= by\n  exact?"))
  assert.ok(!s.cheap.includes("have := near_neg_mod"), "the original proof is gone")
})

const f0 = (over = {}) => ({ name: "t", ground: false, usedBy: 0, keystone: false, duplicateOf: null, ...over })
const rd = (over = {}) => ({ draws: 2, depth: 3, generality: 3, role: 2, kind: "general-lemma", inMathlib: "no", vacuous: "no", spread: 0, ...over })

test("stars: a duplicate is one star, a cheap tactic caps at one, one library lemma and a numeric fact cap at two", () => {
  assert.equal(stars(f0({ duplicateOf: "x" }), null, rd()).stars, 1)
  assert.equal(stars(f0(), { cheap: true, library: false }, rd({ depth: 5, generality: 5, role: 3 })).stars, 1)
  assert.equal(stars(f0(), { cheap: false, library: true }, rd({ depth: 5, generality: 5, role: 3 })).stars, 2)
  assert.equal(stars(f0({ ground: true }), { cheap: false, library: false }, rd({ depth: 5, generality: 5, role: 3 })).stars, 2)
  assert.equal(stars(f0(), { cheap: false, library: false }, rd({ inMathlib: "yes", depth: 5, generality: 5, role: 3 })).stars, 2)
  assert.equal(stars(f0(), { cheap: false, library: false }, rd({ vacuous: "likely", depth: 5, generality: 5, role: 3 })).stars, 1)
})

test("stars: the weighted score runs from one to five, a routine lemma lands at three, reuse and worth to the target lift it", () => {
  const p = { cheap: false, library: false }
  assert.equal(stars(f0(), p, rd({ depth: 1, generality: 1, role: 0 })).stars, 1)
  assert.equal(stars(f0(), p, rd()).stars, 3)
  assert.equal(stars(f0({ usedBy: 6 }), p, rd({ depth: 4, generality: 4, role: 3 })).stars, 4, "4.40 rounds down: five stars are rare on purpose")
  assert.equal(stars(f0({ usedBy: 6 }), p, rd({ depth: 5, generality: 4, role: 3 })).stars, 5)
  assert.ok(stars(f0({ usedBy: 6 }), p, rd({ depth: 4, generality: 4, role: 3 })).reasons.join(" ").includes("used by 6"))
})

test("stars: a keystone with real worth to the target is raised to four, and four other entries resting on a lemma raise it to three", () => {
  const p = { cheap: false, library: false }
  assert.equal(stars(f0({ keystone: true }), p, rd({ depth: 2, generality: 2, role: 3 })).stars, 4)
  assert.equal(stars(f0({ keystone: true }), { cheap: false, library: true }, rd({ role: 3 })).stars, 2, "a caps beats the raise")
  assert.equal(stars(f0({ usedBy: 4 }), p, rd({ depth: 1, generality: 2, role: 1 })).stars, 3)
})

test("stars: without a reading the entry is unrated but a mechanical cap still shows", () => {
  const r = stars(f0(), { cheap: true, library: false }, null)
  assert.equal(r.stars, null)
  assert.ok(r.reasons.join(" ").includes("one-line automatic tactic"))
})

test("summariseReading averages the scales, takes the commonest label, and reports how far the draws spread", () => {
  const s = summariseReading([{ depth: 2, generality: 3, role: 1, kind: "general-lemma", inMathlib: "no", vacuous: "no", says: "a" }, { depth: 4, generality: 3, role: 1, kind: "general-lemma", inMathlib: "likely", vacuous: "no", says: "b" }, { depth: 3, generality: 3, role: 2, kind: "structural", inMathlib: "no", vacuous: "no", says: "c" }])
  assert.equal(s.depth, 3)
  assert.equal(s.kind, "general-lemma")
  assert.equal(s.inMathlib, "no")
  assert.equal(s.spread, 2)
  assert.equal(summariseReading([]), null)
})

test("parseReading reads a fenced block, clamps the scales, and drops entries it cannot use", () => {
  const text = 'Here:\n```json\n[{"id":"a#1","says":"s","kind":"reduction","depth":9,"generality":0,"role":3,"inMathlib":"maybe","vacuous":"no"},{"id":"b#2","depth":"x"},{"depth":3,"generality":3,"role":1}]\n```'
  const got = parseReading(text)
  assert.equal(got.length, 1)
  assert.deepEqual([got[0].depth, got[0].generality, got[0].role, got[0].inMathlib, got[0].kind], [5, 1, 3, "no", "reduction"])
  assert.deepEqual(parseReading("no json"), [])
  assert.deepEqual(parseReading("```json\nnot json\n```"), [])
  assert.ok(KINDS.includes("numeric-instance"))
})

test("the reading prompt gives the target, every scale, and each entry with its id; it does not ask about correctness", () => {
  const e = entry("cb_val", HELPER + MAIN)
  const p = readingPrompt([{ id: "cb_val#3", entry: e.entry, features: { helpers: 1 } }], { target: "theorem erdos_396 : P", informal: "for every k" })
  assert.ok(p.includes("### cb_val#3") && p.includes("theorem erdos_396 : P") && p.includes("for every k"))
  for (const k of ["depth", "generality", "role", "inMathlib", "vacuous"]) assert.ok(p.includes(`"${k}"`), k)
  assert.match(p, /DO NOT judge correctness/)
  assert.ok(p.includes("resting on 1 helper declarations"))
})

test("the report sorts by stars, says why, and the CSV quotes what needs quoting", () => {
  const rows = [
    { id: "a", name: "weak", statement: "", features: { origin: "verified", usedBy: 0, ground: true, proofLines: 1, keystone: false, duplicateOf: null }, probes: { cheap: true, library: false }, reading: null, stars: 1, reasons: ["capped at 1: a one-line automatic tactic proves it"], runs: ["r1"] },
    { id: "b", name: "strong, with comma", statement: "", features: { origin: "verified", usedBy: 5, ground: false, proofLines: 20, keystone: true, duplicateOf: null }, probes: { cheap: false, library: false }, reading: { depth: 4, generality: 4, role: 3, kind: "reduction", inMathlib: "no", vacuous: "no", spread: 0, says: 'says "x"' }, stars: 5, reasons: ["score 4.40"], runs: ["r1", "r2"] },
  ]
  const csv = reportCsv(rows).split("\n")
  assert.ok(csv[1].startsWith("5,\"strong, with comma\""))
  assert.ok(csv[1].includes('"says ""x"""'))
  assert.equal(starText(3), "★★★☆☆")
  const md = reportMd(rows, { target: "t", distribution: distribution(rows) })
  assert.ok(md.includes("| ★★★★★ | 1 |") && md.includes("| ★☆☆☆☆ | 1 |"))
  const html = reportHtml(rows, { target: "t", title: "T <b>" })
  assert.ok(html.indexOf("strong, with comma") < html.indexOf("weak") && html.includes("T &lt;b&gt;"))
})

test("the controls the runner checks before it trusts the battery: a truth and a falsehood for each of the two tactics", () => {
  assert.deepEqual(CONTROLS.map((c) => c.expect), [true, false, true, false])
  assert.ok(CONTROLS[0].script.includes(QUIET) && CONTROLS[0].script.includes("first | decide"))
  assert.ok(CONTROLS[3].script.includes("exact?"))
})

import { exportQuality } from "../../tools/leak-rank/report.mjs"
test("exportQuality keeps numbers and flags keyed by the entry id, and leaves out names, statements and prose", () => {
  const row = (entryId, stars, over = {}) => ({ entryId, name: "secret_name", statement: "theorem secret : P", stars, features: { usedBy: 2, ground: false, duplicateOf: null, keystone: false }, probes: { cheap: false, library: false }, reading: { depth: 3.04, generality: 2.96, role: 2, kind: "general-lemma", inMathlib: "no", vacuous: "no", says: "a sentence about the lemma" }, ...over })
  const out = exportQuality([row("a".repeat(40), 3), row("b".repeat(40), 1, { probes: { cheap: true, library: false }, features: { usedBy: 0, ground: true, duplicateOf: null, keystone: false } }), row("c".repeat(40), null), { ...row("d", 2), entryId: "" }], { targetId: "t", rankedAt: "2026-10-22" })
  assert.equal(out.count, 2, "an unrated entry and one without an id are left out")
  assert.deepEqual(out.entries["a".repeat(40)], { s: 3, u: 2, d: 3, g: 3, w: 2, k: "general-lemma" })
  assert.deepEqual(out.entries["b".repeat(40)], { s: 1, u: 0, d: 3, g: 3, w: 2, k: "general-lemma", c: 1, n: 1 })
  const text = JSON.stringify(out)
  for (const w of ["secret", "sentence", "theorem"]) assert.ok(!text.includes(w), w)
})
