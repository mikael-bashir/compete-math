// node --test tests/leak-memory/memory.test.mjs
//
// public/leak-memory.mjs: reading verified scripts into memory, recalling them, and the text and tools the four variants give the driver.
// No network and no model: every script below is plain text.
import test from "node:test"
import assert from "node:assert/strict"
import {
  VARIANTS,
  isMemoryVariant,
  splitDeclarations,
  blockHead,
  blockName,
  statementOf,
  proofOf,
  isTrivial,
  tokens,
  Memory,
  renderRecall,
  episodicBlock,
  augmentSearchText,
  makeHandlers,
  memoryRules,
  sleepDue,
  sleepPrompt,
  parseSleep,
  resolveSubsumes,
  MAX_NOMINATED,
} from "../../public/leak-memory.mjs"

const SCRIPT = `open Nat in
/-- the central binomial coefficient is positive -/
theorem cb_pos_aux (n : ℕ) : 0 < n.centralBinom := Nat.centralBinom_pos n

def twice (n : ℕ) : ℕ := 2 * n

/-- A real lemma: twice n divides twice (n * m). It uses a local definition. -/
theorem twice_mul_dvd (n m : ℕ) (hm : 0 < m) : twice n ∣ twice (n * m) := by
  unfold twice
  exact Nat.mul_dvd_mul_left 2 (Dvd.intro m rfl)

theorem tiny : 1 = 1 := rfl

theorem still_open (n : ℕ) : n = n + 0 := by
  sorry
`

test("variants: four designs, each with a Leak II twin, each with a name, and only the memory ones are memory variants", () => {
  assert.deepEqual(Object.keys(VARIANTS).sort(), ["control-flint", "control-flint-iv", "control-honoured", "control-honoured-iv", "control-lucid", "control-lucid-iv", "control-paragon", "control-paragon-iv"])
  for (const [k, v] of Object.entries(VARIANTS)) assert.ok(v.name.startsWith(k.endsWith("-iv") ? "Control IV " : "Control II "))
  // the agent manages its own context: no variant ends a session on a timer of its own
  for (const v of Object.values(VARIANTS)) assert.ok(!("attemptMs" in v), `${v.name} has a timer of its own on a session`)
  assert.ok(isMemoryVariant("control-lucid"))
  assert.ok(!isMemoryVariant("control-oneshot-2"))
  assert.ok(!isMemoryVariant("toString")) // not inherited keys
})

test("splitDeclarations keeps a docstring and an attribute with the declaration after it", () => {
  const blocks = splitDeclarations(SCRIPT)
  assert.deepEqual(blocks.map(blockHead), ["theorem", "def", "theorem", "theorem", "theorem"])
  assert.deepEqual(blocks.map(blockName), ["cb_pos_aux", "twice", "twice_mul_dvd", "tiny", "still_open"])
  assert.match(blocks[0], /^open Nat in/)
  assert.match(blocks[2], /A real lemma/)
})

test("statementOf stops at the first := outside brackets and proofOf returns the rest", () => {
  const b = `theorem t (f : ℕ → ℕ := fun x => x) (h : ∀ x, f x = x) : f 3 = 3 := by\n  exact h 3`
  assert.equal(statementOf(b), "theorem t (f : ℕ → ℕ := fun x => x) (h : ∀ x, f x = x) : f 3 = 3")
  assert.match(proofOf(b), /^:= by\s+exact h 3$/)
})

test("trivial statements and one-line proofs are not kept", () => {
  assert.ok(isTrivial("theorem tiny : 1 = 1", ":= rfl"))
  assert.ok(isTrivial("theorem a (n : ℕ) : n + 0 = n", ":= by simp"))
  assert.ok(!isTrivial("theorem twice_mul_dvd (n m : ℕ) (hm : 0 < m) : twice n ∣ twice (n * m)", ":= by\n  unfold twice\n  exact Nat.mul_dvd_mul_left 2 (Dvd.intro m rfl)"))
})

test("addScript saves the real lemma with the definition it needs, skips the trivial and the sorried one", () => {
  const events = []
  const m = new Memory({ targetId: "erdos-396", variant: "control-honoured", emit: (f) => events.push(f), now: () => Date.UTC(2026, 9, 18) })
  const added = m.addScript(SCRIPT, { attempt: 2 })
  const names = added.map((e) => e.name).sort()
  assert.deepEqual(names, ["cb_pos_aux", "twice_mul_dvd"].sort())
  const lem = added.find((e) => e.name === "twice_mul_dvd")
  assert.match(lem.closure, /def twice/) // the definition it uses is in the closure
  assert.match(lem.closure, /theorem twice_mul_dvd/)
  assert.ok(!/still_open|theorem tiny/.test(lem.closure))
  assert.equal(lem.attempt, 2)
  assert.equal(events.length, 2)
  assert.equal(events[0].type, "memory")
  assert.equal(events[0].op, "save")
  assert.equal(events[0].entry.targetId, "erdos-396")
})

test("the same statement is not saved twice; a shorter proof replaces a longer one", () => {
  const m = new Memory({})
  const long = `theorem foo_lemma (a b : ℕ) (h : a ≤ b) : a ∣ b * a := by\n  have h1 : a ∣ a := dvd_refl a\n  exact Dvd.dvd.mul_left h1 b`
  const short = `theorem renamed_lemma (a b : ℕ) (h : a ≤ b) : a ∣ b * a := Dvd.intro_left b rfl`
  assert.equal(m.addScript(long).length, 1)
  assert.equal(m.size, 1)
  const again = m.addScript(short)
  assert.equal(again.length, 1) // updated
  assert.equal(m.size, 1)
  assert.match([...m.entries.values()][0].closure, /renamed_lemma/)
  assert.equal(m.addScript(long).length, 0) // longer than stored: ignored
})

test("native_decide counts like sorry: not saved", () => {
  const m = new Memory({})
  assert.equal(m.addScript(`theorem big_fact (n : ℕ) (h : n < 10) : n * n < 100 := by\n  interval_cases n <;> native_decide`).length, 0)
})

test("namespaces are re-opened in the closure", () => {
  const m = new Memory({})
  const e = m.addScript(`namespace Foo\n\ntheorem inner_lemma (a b : ℕ) (hab : a < b) : a + 1 ≤ b := by\n  have h := hab\n  omega\n\nend Foo`)
  assert.equal(e.length, 1)
  assert.match(e[0].closure, /^namespace Foo/)
  assert.match(e[0].closure, /end Foo$/)
})

test("recall ranks by shared names and symbols, and prefers the abstract lemma over what it subsumes", () => {
  const m = new Memory({})
  m.addScript(`theorem centralBinom_dvd_example (n : ℕ) (h : 2 < n) : n ∣ n.centralBinom * n := Dvd.intro_left _ rfl`)
  m.addScript(`theorem sum_range_odd_example (n : ℕ) (h : 1 < n) : ∑ i ∈ Finset.range n, (2 * i + 1) = n ^ 2 := by\n  induction n with\n  | zero => simp\n  | succ k ih => rw [Finset.sum_range_succ, ih]; ring`)
  const top = m.recall("central binomial coefficient divisibility centralBinom", { limit: 2 })
  assert.equal(top[0].name, "centralBinom_dvd_example")
  const top2 = m.recall("sum of odd numbers equals n^2", { limit: 1 })
  assert.equal(top2[0].name, "sum_range_odd_example")
  assert.equal(m.stats.recalls, 2)
  assert.equal(m.recall("zzzzqq nothing", { limit: 3 }).length, 0)
  const rec = renderRecall(top, m)
  assert.match(rec, /compile-ready/)
  assert.match(rec, /theorem centralBinom_dvd_example/)
})

test("abstract lemmas mark what they subsume", () => {
  const m = new Memory({})
  const [a] = m.addScript(`theorem special_case_two (n : ℕ) (hn : 0 < n) : 2 ∣ 2 * n := Dvd.intro n rfl`)
  const added = m.addAbstract(`theorem general_case (c n : ℕ) (hn : 0 < n) : c ∣ c * n := Dvd.intro n rfl`, [a.id])
  assert.equal(added.length, 1)
  assert.equal(added[0].origin, "abstracted")
  assert.equal(m.find(a.id).subsumedBy, added[0].id)
  assert.equal(m.stats.abstracted, 1)
  assert.deepEqual(resolveSubsumes(m, [a.id.slice(0, 8), "nope"]), [a.id])
})

test("nomination is capped at the most Jinshi takes", () => {
  const m = new Memory({})
  for (let i = 0; i < MAX_NOMINATED + 2; i++)
    m.addScript(`theorem lemma_number_${i} (n : ℕ) (hn : ${i} < n) : ${i} + 1 ≤ n := by\n  have h := hn\n  omega`)
  let ok = 0
  for (const e of [...m.entries.values()]) if (m.nominate(e.id).ok) ok++
  assert.equal(ok, MAX_NOMINATED)
  const extra = [...m.entries.values()].find((e) => !e.nominated)
  assert.equal(m.nominate(extra.id).ok, false)
  const first = [...m.entries.values()].find((e) => e.nominated)
  assert.equal(m.nominate(first.id, false).ok, true)
  assert.equal(m.nominate(extra.id).ok, true)
})

test("load() takes what the browser sends and ignores malformed rows", () => {
  const m = new Memory({ targetId: "t" })
  const n = m.load([{ id: "abc123", name: "x", statement: "theorem x : 1 = 1", closure: "theorem x : 1 = 1 := rfl", nominated: true }, { id: "bad" }, null])
  assert.equal(n, 1)
  assert.equal(m.nominated().length, 1)
  assert.equal(m.addScript("theorem unrelated_one (a b : ℕ) (hab : a < b) : a + 1 ≤ b := by\n  have h := hab\n  omega").length, 1)
})

test("Flint's block and Paragon's search addition", () => {
  const m = new Memory({})
  assert.equal(episodicBlock(m, 5), "")
  m.addScript(`theorem seen_before (n : ℕ) (hn : 3 < n) : 4 ≤ n := by\n  have h := hn\n  omega`)
  const block = episodicBlock(m, 5)
  assert.match(block, /EARLIER ATTEMPTS/)
  assert.match(block, /theorem seen_before/)
  assert.equal(m.stats.injected, 1)
  const out = augmentSearchText(m, "seen before 4 ≤ n", "LIBRARY RESULT TEXT")
  assert.match(out, /^LIBRARY RESULT TEXT/)
  assert.match(out, /MEMORY/)
  assert.equal(augmentSearchText(m, "qqqq", "LIBRARY RESULT TEXT"), "LIBRARY RESULT TEXT")
})

test("handlers: only the tools a variant has, and they work", async () => {
  const m = new Memory({})
  m.addScript(`theorem handler_lemma (n : ℕ) (hn : 5 < n) : 6 ≤ n := by\n  have h := hn\n  omega`)
  assert.equal(makeHandlers(m, "control-flint").size, 0)
  const h = makeHandlers(m, "control-honoured")
  assert.deepEqual([...h.keys()].sort(), ["memory_list", "memory_nominate", "memory_recall"])
  const r = await h.get("memory_recall").run({ query: "handler lemma 6 ≤ n" })
  assert.match(r, /handler_lemma/)
  assert.match(await h.get("memory_list").run({}), /handler_lemma/)
  const nom = await h.get("memory_nominate").run({ names: ["handler_lemma", "missing"] })
  assert.match(nom, /handler_lemma: nominated/)
  assert.match(nom, /missing: no saved theorem/)
  assert.equal(m.nominated().length, 1)
})

test("rules: memory variants allow helper lemmas; only the ones with a tool talk about memory_recall", () => {
  assert.match(memoryRules("control-flint"), /MAY prove helper/)
  assert.ok(!/memory_recall/.test(memoryRules("control-flint")))
  assert.match(memoryRules("control-honoured"), /memory_recall/)
  assert.match(memoryRules("control-paragon"), /MEMORY heading/)
  assert.match(memoryRules("control-lucid"), /consolidates/)
})

test("sleep: due only after enough new entries and enough time; the prompt asks for json; parsing is strict", () => {
  const m = new Memory({ now: () => Date.parse("2026-10-18T10:00:00Z") })
  const cfg = VARIANTS["control-lucid"].sleep
  for (let i = 0; i < cfg.minNew; i++) m.addScript(`theorem sleep_lemma_${i} (n : ℕ) (hn : ${i} < n) : ${i} + 1 ≤ n := by\n  have h := hn\n  omega`)
  assert.ok(sleepDue(m, { lastSleepAt: 0 }, cfg, Date.now()))
  assert.ok(!sleepDue(m, { lastSleepAt: Date.now() - 1000 }, cfg, Date.now()))
  assert.ok(!sleepDue(new Memory({}), { lastSleepAt: 0 }, cfg))
  const p = sleepPrompt(m, "theorem target : True")
  assert.match(p, /sleep/)
  assert.match(p, /sleep_lemma_0/)
  const good = "thinking...\n```json\n[{\"name\":\"g\",\"script\":\"theorem g (a b : ℕ) (h : a < b) : a + 1 ≤ b := by omega\",\"subsumes\":[\"aaaa\"],\"why\":\"all of them\"}]\n```"
  assert.equal(parseSleep(good).length, 1)
  assert.equal(parseSleep("no block here").length, 0)
  assert.equal(parseSleep("```json\n[{\"script\":\"theorem x : 1 = 1 := by sorry\"}]\n```").length, 0)
  assert.equal(parseSleep("```json\nnot json\n```").length, 0)
})

test("tokens split names, keep symbols and numbers", () => {
  const t = tokens("theorem centralBinom_dvd (n : ℕ) : n ∣ 2480")
  for (const w of ["central", "binom", "centralbinom", "dvd", "∣", "ℕ", "#2480"]) assert.ok(t.includes(w), w)
})

// ---- what the 2026-10-18 overnight run showed (tests/leak-memory/overnight-fixture.mjs) -------------------------------------------------
import { OLD, SLEEP_SCRIPT } from "./overnight-fixture.mjs"
import { HOUSEKEEPING_CHANCE, HOUSEKEEPING_LINE, continuePrompt, environmentHint, nudgePrompt, renderList } from "../../public/leak-memory.mjs"

const loaded = () => {
  const frames = []
  const m = new Memory({ targetId: "erdos-396", variant: "control-lucid", emit: (f) => frames.push(f) })
  for (const s of OLD) m.addScript(s, { attempt: 1 })
  return { m, frames }
}

test("a sleep script of four theorems updates each merged entry once, not once per theorem", () => {
  const { m, frames } = loaded()
  assert.equal(m.size, 4)
  const oldIds = [...m.entries.keys()]
  frames.length = 0
  const added = m.addAbstract(SLEEP_SCRIPT, oldIds)
  assert.equal(added.length, 4)
  const updates = frames.filter((f) => f.op === "update" && oldIds.includes(f.entry.id))
  assert.equal(updates.length, 4, `expected one update per merged entry, got ${updates.length}`)
  for (const id of oldIds) {
    assert.ok(m.entries.get(id).subsumedBy, "a merged entry points at what replaced it")
    assert.ok(added.some((a) => a.id === m.entries.get(id).subsumedBy), "and it points at one of the new lemmas")
  }
})

test("merged entries are hidden from memory_list and recall, unless the account nominated them", () => {
  const { m } = loaded()
  const ids = [...m.entries.keys()]
  m.nominate(ids[0])
  m.addAbstract(SLEEP_SCRIPT, ids)
  const listed = m.list({ limit: 50 }).map((e) => e.id)
  for (const id of ids.slice(1)) assert.ok(!listed.includes(id), "a merged, un-nominated entry is not listed")
  assert.ok(listed.includes(ids[0]), "a merged but nominated entry stays visible")
  const recalled = m.recall("centralBinom factorization sq", { limit: 8, markHit: false }).map((e) => e.id)
  for (const id of ids.slice(1)) assert.ok(!recalled.includes(id), "nor is it recalled")
  assert.match(renderList(m.list({ limit: 50 }), m), /3 more merged into the general lemmas above are hidden/)
})

test("recall shows a declaration that several results share once", () => {
  const { m } = loaded()
  m.addAbstract(SLEEP_SCRIPT, [...m.entries.keys()])
  const hits = m.recall("one_le_factorization_centralBinom_of_pow_le le_factorization forall_pow_le", { limit: 4, markHit: false })
  assert.ok(hits.length >= 2)
  const text = renderRecall(hits, m)
  const masters = text.match(/theorem factorization_centralBinom_eq_card \(p n : ℕ\)/g) || []
  assert.equal(masters.length, 1, "the master identity is printed once")
  assert.match(text, /needs `factorization_centralBinom_eq_card`/)
})

test("seed entries stay out of the account's memory: silent, never trivial-filtered, never nominated", () => {
  const frames = []
  const m = new Memory({ targetId: "t", emit: (f) => frames.push(f) })
  const added = m.addScript("theorem E_k1 : (2 : ℕ).descFactorial 2 ∣ (2 : ℕ).centralBinom := by\n  decide +kernel", { origin: "seed", silent: true })
  assert.equal(added.length, 1)
  assert.equal(added[0].origin, "seed")
  assert.equal(frames.length, 0, "no save frame, so nothing reaches the account's table")
  assert.equal(m.stats.saves, 0)
  assert.equal(m.nominate("E_k1").ok, false)
  assert.equal(m.nominated().length, 0)
})

test("the environment hint names only what is missing", () => {
  const none = environmentHint({ platform: "darwin", timeout: false, python3: true, modules: { sympy: false, numpy: false }, gcc: true })
  assert.match(none, /`timeout` is not installed/)
  assert.match(none, /sympy/)
  assert.match(none, /numpy/)
  assert.match(none, /background/)
  const full = environmentHint({ platform: "linux", timeout: true, python3: true, modules: { sympy: true, numpy: true }, gcc: true })
  assert.doesNotMatch(full, /not installed/)
  assert.match(environmentHint({ platform: "linux", timeout: true, python3: false, modules: {}, gcc: false }), /python3 is not installed/)
})

test("the nudge says how long the agent ran, what to do next, and never offers 'open' as a reason to stop", () => {
  const t = nudgePrompt({ elapsedMs: 130000, libraryCount: 5, nudge: 1, of: 2 })
  assert.match(t, /2 minutes/)
  assert.match(t, /verify_full_script/)
  assert.match(t, /5 verified theorem/)
  assert.doesNotMatch(t, /you may stop/i)
})

test("memoryRules carries the verify-early rule for every variant", () => {
  for (const k of Object.keys(VARIANTS)) assert.match(memoryRules(k), /Verify early and often/)
})

test("the continue prompt resumes the same session: what changed, how to reload a tool, no rules repeated", () => {
  const t = continuePrompt({ attempt: 3, elapsedMs: 5 * 60000, libraryCount: 12, abstracted: ["gen_lemma"], toolIds: ["mcp__Leak_IV__verify_full_script"] })
  assert.match(t, /attempt 3 of the SAME session/)
  assert.match(t, /after 5 minutes/)
  assert.match(t, /12 verified theorem/)
  assert.match(t, /gen_lemma/)
  assert.match(t, /select:mcp__Leak_IV__verify_full_script/)
  assert.doesNotMatch(t, /THE LOOP/)
  assert.doesNotMatch(continuePrompt({ attempt: 2 }), /consolidated|ToolSearch/, "nothing to say about lemmas or tools when there is none")
  assert.match(continuePrompt({ attempt: 2, episodic: "\nEPISODE\n" }), /EPISODE/)
})

test("one new attempt in five is quietly reminded to check for runaway processes", () => {
  assert.equal(HOUSEKEEPING_CHANCE, 0.2)
  assert.ok(continuePrompt({ attempt: 2, rng: () => 0.19 }).includes(HOUSEKEEPING_LINE))
  assert.ok(!continuePrompt({ attempt: 2, rng: () => 0.2 }).includes(HOUSEKEEPING_LINE))
  assert.ok(!continuePrompt({ attempt: 2, rng: () => 0.9 }).includes(HOUSEKEEPING_LINE))
  assert.ok(!/must|never|always/i.test(HOUSEKEEPING_LINE), "it is a suggestion, not a rule")
  let hits = 0
  for (let i = 0; i < 2000; i++) if (continuePrompt({ attempt: 2 }).includes(HOUSEKEEPING_LINE)) hits++
  assert.ok(hits > 300 && hits < 500, `about 20% of 2000, got ${hits}`)
})

// ---- the Leak II variants and the harness's voice ---------------------------------------------------------------
import fs from "node:fs"
import { GOAL, MANDATE, SYSTEM_RULE, WORK_MODES, baseVariant, persistBlock, strategyBlock, usesPantograph } from "../../public/leak-memory.mjs"
import { MEMORY_VARIANTS } from "../../src/lib/prover/memory-client.ts"

test("every memory variant has a Leak II twin that differs in nothing but Leak II", () => {
  const bases = Object.keys(VARIANTS).filter((k) => !k.endsWith("-iv"))
  assert.equal(bases.length, 4)
  for (const k of bases) {
    const base = VARIANTS[k]
    const iv = VARIANTS[`${k}-iv`]
    assert.ok(iv, `${k}-iv is missing`)
    assert.equal(base.pantograph, undefined)
    assert.equal(iv.pantograph, true)
    for (const f of ["tools", "episodic", "augmentSearch", "sleep"]) assert.deepEqual(iv[f], base[f], `${k}-iv differs in ${f}`)
    assert.equal(iv.name, base.name.replace("Control II", "Control IV"))
    assert.ok(isMemoryVariant(`${k}-iv`))
    assert.equal(usesPantograph(`${k}-iv`), true)
    assert.equal(usesPantograph(k), false)
    assert.equal(baseVariant(`${k}-iv`), k)
    assert.equal(baseVariant(k), k)
  }
})

test("the page's list of variants, the module's and the bridge's registry name the same eight", () => {
  const bridge = fs.readFileSync(new URL("../../public/local-claude-bridge.mjs", import.meta.url), "utf8")
  assert.deepEqual(MEMORY_VARIANTS.map((v) => v.key).sort(), Object.keys(VARIANTS).sort())
  for (const k of Object.keys(VARIANTS)) assert.match(bridge, new RegExp(`\\n  "${k}": \\{[\\s\\S]*?style: "memory"`), `${k} is not a memory strategy in the bridge`)
})

test("memoryRules mentions Leak II only for the -iv variants, and not when the bridge says it is not connected", () => {
  for (const k of Object.keys(VARIANTS)) {
    const has = /init_proof/.test(memoryRules(k))
    assert.equal(has, k.endsWith("-iv"), k)
  }
  assert.doesNotMatch(memoryRules("control-honoured-iv", { pantograph: false }), /init_proof/)
  assert.match(memoryRules("control-honoured", { pantograph: true }), /init_proof/)
  assert.match(memoryRules("control-lucid-iv"), /consolidates/, "the twin keeps the base variant's own rules")
})

test("the standing order is firm about persistence, not about cheating", () => {
  assert.match(MANDATE, /STANDING ORDER/)
  assert.match(MANDATE, /not a suggestion/i)
  assert.match(MANDATE, /do not conclude that the problem is open, hard, or out of reach/)
  assert.match(MANDATE, /never to stop doing it/)
  const b = strategyBlock()
  assert.match(b, /WHEN YOU ARE STUCK/)
  assert.match(b, /inventive/)
  for (const move of [/contrapositive/, /special case/, /counterexample/, /invariant/, /loogle/, /moogle/, /yes-or-no question/]) assert.match(b, move)
  assert.doesNotMatch(b, /answer slot/, "the free answer slot is repudiated and no longer offered")
  assert.match(b, /USE THE TOOLS YOU HAVE/)
  assert.match(b, /No sorry, no new axioms/)
  assert.match(b, /only thing that counts is verify_full_script/)
})

test("the playbook names Leak II and the memory tools only where the agent has them", () => {
  assert.doesNotMatch(strategyBlock({ pantograph: false, memoryTools: false }), /Leak II|memory_recall/)
  assert.match(strategyBlock({ pantograph: true, memoryTools: false }), /Leak II \(init_proof/)
  assert.doesNotMatch(strategyBlock({ pantograph: true, memoryTools: false }), /memory_recall/)
  assert.match(strategyBlock({ memoryTools: true }), /memory_recall/)
  assert.doesNotMatch(persistBlock(), /Leak II/)
  assert.match(persistBlock({ pantograph: true }), /Leak II \(init_proof/)
})

test("a resumed session and a reminder both give an order, say what to change, and forbid brute force", () => {
  const c = continuePrompt({ attempt: 4, elapsedMs: 3 * 60000, libraryCount: 2, rng: () => 1 })
  assert.match(c, /^ORDER: KEEP GOING/)
  assert.match(c, /not accepted/)
  assert.match(c, /neither is a feeling that it is impossible/)
  assert.match(c, /change the approach instead of repeating it/)
  assert.match(c, /No brute force/)
  const n = nudgePrompt({ elapsedMs: 60000, libraryCount: 2, nudge: 2, of: 2 })
  assert.match(n, /^ORDER: DO NOT STOP/)
  assert.match(n, /reminder 2 of 2/)
  assert.match(n, /change the approach instead of repeating it/)
  assert.doesNotMatch(c + n, /Leak II/)
  assert.match(continuePrompt({ attempt: 2, pantograph: true, rng: () => 1 }), /Leak II \(init_proof/)
  assert.match(nudgePrompt({ elapsedMs: 1, pantograph: true }), /Leak II \(init_proof/)
})

test("the agent may build foundations or lift the target with a bridge, and is told this is a long project", () => {
  assert.match(WORK_MODES, /THREE KINDS OF WORK/)
  assert.match(WORK_MODES, /Prove the target directly/)
  assert.match(WORK_MODES, /Build the foundations/)
  assert.match(WORK_MODES, /hunch/)
  assert.match(WORK_MODES, /Change the question/)
  assert.match(WORK_MODES, /suitable bridge/)
  assert.match(WORK_MODES, /verified Lean theorem that carries the result back/)
  assert.match(WORK_MODES, /target's own statement stays exactly as it is/, "a lift is a route; the statement is not changed")
  assert.match(WORK_MODES, /LONG-LASTING PROCESS/)
  assert.match(WORK_MODES, /months/)
  assert.match(WORK_MODES, /Do not think in the short term/)
  assert.match(WORK_MODES, /best interest/)
})

test("brute force is forbidden outright: nothing over 5 minutes, and why", () => {
  const b = strategyBlock()
  assert.match(b, /NO BRUTE FORCE\. THIS IS A PROHIBITION, NOT ADVICE/)
  assert.match(b, /no scanning a range of integers for a witness or a counterexample/)
  assert.match(b, /may run for more than 5 minutes/)
  assert.match(b, /someone has already run the same check and got nothing to show for it/)
  assert.match(b, /polling it with sleep/)
  assert.match(SYSTEM_RULE, /NO BRUTE FORCE/)
  assert.match(SYSTEM_RULE, /more than 5 minutes/)
  assert.match(SYSTEM_RULE, /overrides anything below that calls numeric experiments unrestricted/)
  for (const t of [persistBlock(), continuePrompt({ attempt: 2, rng: () => 1 }), nudgePrompt({ elapsedMs: 1 })]) {
    assert.match(t, /No brute force/)
    assert.match(t, /more than 5 minutes/)
  }
  assert.match(environmentHint({ platform: "linux", timeout: true, python3: true, modules: {}, gcc: true }), /more than 5 minutes/)
})

test("the goal is a proof ecosystem built from the ground up", () => {
  assert.match(GOAL, /THE GOAL OF THIS RUN/)
  assert.match(GOAL, /build a proof ecosystem from the ground up/)
  assert.match(GOAL, /destination, not the unit of work/)
  assert.match(GOAL, /brick/)
  assert.match(GOAL, /witness for one instance/)
  assert.doesNotMatch(GOAL, /Mathlib/, "Tengoku is not framed around Mathlib")
})

test("the tools are explained as Tengoku with Leak, each one as it is, and Leak II only when the agent has it", () => {
  const b = strategyBlock({ pantograph: true, memoryTools: true })
  assert.match(b, /Tengoku is a large, self-contained and ever-growing tree of formally verified Lean 4 mathematics/)
  assert.match(b, /Leak I \(loogle_search, moogle_search\) searches all of Tengoku/)
  assert.match(b, /loogle takes a type pattern/)
  assert.match(b, /moogle takes a concept in words/)
  assert.match(b, /Leak IV \(verify_full_script\) is the compiler and the judge/)
  assert.match(b, /entire Tengoku tree/)
  assert.match(b, /Leak II \(init_proof, apply_tactic, get_current_proof_state, snapshot_state, branch_tactics\)/)
  assert.match(b, /memory_recall, memory_list, memory_nominate/)
  assert.match(b, /search to find what exists, verify to add what does not, step to understand what is stuck, remember/)
  const plain = strategyBlock({ pantograph: false, memoryTools: false })
  assert.doesNotMatch(plain, /snapshot_state|memory_recall/)
  assert.match(plain, /Leak IV \(verify_full_script\)/)
  assert.doesNotMatch(b, /Mathlib/, "Tengoku is not framed around Mathlib")
})

test("a resumed session and a reminder offer foundations and bridges, and remind of the long horizon", () => {
  for (const t of [continuePrompt({ attempt: 3, elapsedMs: 1, rng: () => 1 }), nudgePrompt({ elapsedMs: 1 })]) {
    assert.match(t, /long-lasting process/)
    assert.match(t, /foundational material/)
    assert.match(t, /bridge/)
  }
})

// ---- the two voices ---------------------------------------------------------------------------------------------
import { CURIOSITY_PROMPTS, DEFAULT_VOICE, VOICES, curiosityPrompt, extractNote, voiceFor } from "../../public/leak-memory.mjs"

test("the default voice is the curious mathematician; the order voice stays available by name", () => {
  assert.equal(DEFAULT_VOICE, "curious")
  assert.deepEqual(Object.keys(VOICES).sort(), ["curious", "order"])
  assert.equal(voiceFor("order").key, "order")
  assert.equal(voiceFor("curious").key, "curious")
  assert.equal(voiceFor("").key, "curious")
  assert.equal(voiceFor("nonsense").key, "curious")
  for (const v of Object.values(VOICES)) for (const f of ["opening", "strategy", "sessionRules", "continue", "nudge"]) assert.equal(typeof v[f], "function", `${v.key}.${f}`)
})

test("the curious voice never calls the problem open, hard or unsolved, gives no orders, and asks for lab notes", () => {
  const V = VOICES.curious
  const all = [V.opening({ pantograph: true, memoryTools: true }), V.sessionRules(1), V.systemRule, V.continue({ attempt: 2, rng: () => 1 }), V.nudge({ elapsedMs: 1 })].join("\n")
  assert.doesNotMatch(all, /open problem|is open|unsolved|too hard|impossible|STANDING ORDER|ORDER:|not accepted|you must\b/i)
  assert.match(V.opening(), /WHO YOU ARE HERE/)
  assert.match(V.opening(), /THE QUESTION IS YOURS NOW/)
  assert.match(V.opening(), /do not look it up/)
  assert.match(V.opening(), /name the obstruction precisely/)
  assert.match(V.opening(), /"I see no route" is where the work starts/)
  assert.match(V.opening(), /WHAT CURIOSITY LOOKS LIKE HERE/)
  assert.match(V.opening(), /OUR INSTRUMENT IS PROOF, NOT SEARCH/)
  assert.match(V.opening(), /more than 5 minutes/)
  assert.match(V.opening(), /THE INSTRUMENTS, AND HOW STRONG THEY ARE/)
  assert.match(V.opening(), /YOUR LAB NOTES[\s\S]*NOTE: <[\s\S]*NEXT: </)
  assert.match(V.opening(), /HONESTY/)
  assert.doesNotMatch(V.opening(), /Mathlib/, "Tengoku is not framed around Mathlib")
  assert.match(V.opening({ pantograph: true }), /Leak II \(init_proof/)
  assert.doesNotMatch(V.opening({ pantograph: false, memoryTools: false }), /Leak II|memory_recall/)
  assert.match(V.systemRule, /NO NETWORK/)
  assert.match(V.sessionRules(1), /reputation is not an input/)
  assert.match(V.sessionRules(3), /earlier conversation could not be resumed/)
  assert.doesNotMatch(V.sessionRules(1), /could not be resumed/)
})

test("the curious continue prompt hands the agent its own note back, and offers a different question each time", () => {
  const V = VOICES.curious
  const withNote = V.continue({ attempt: 2, elapsedMs: 3 * 60000, libraryCount: 7, note: { note: "carries are the point", next: "prove the carry lemma for p = 2" }, rng: () => 1 })
  assert.match(withNote, /Welcome back/)
  assert.match(withNote, /3 minutes/)
  assert.match(withNote, /7 verified theorem/)
  assert.match(withNote, /NOTE: carries are the point\nNEXT: prove the carry lemma for p = 2\n\nTake up NEXT\./)
  assert.match(withNote, /close the stretch, as always, with NOTE: and NEXT:/)
  const without = V.continue({ attempt: 2, rng: () => 1 })
  assert.match(without, /closed without a NEXT line/)
  const qs = new Set([2, 3, 4, 5, 6].map((a) => /A question for this stretch, in case it is useful: ([^\n]+)/.exec(V.continue({ attempt: a, rng: () => 1 }))[1]))
  assert.equal(qs.size, 5, "five resumes, five different questions")
  assert.match(V.continue({ attempt: 2, abstracted: ["gen_one"], rng: () => 1 }), /consolidated[\s\S]*gen_one/)
  assert.match(V.continue({ attempt: 2, toolIds: ["mcp__Leak_IV__verify_full_script"], rng: () => 1 }), /select:mcp__Leak_IV__verify_full_script/)
  assert.ok(V.continue({ attempt: 2, rng: () => 0 }).includes(HOUSEKEEPING_LINE))
  assert.match(V.continue({ attempt: 2, pantograph: true, rng: () => 1 }), /Leak II can show you the live goal/)
})

test("the curious nudge is light: a short stretch, one question, the agent's own NEXT, no order", () => {
  const V = VOICES.curious
  const t = V.nudge({ elapsedMs: 50000, libraryCount: 2, nudge: 1, of: 2, note: { next: "the p = 3 case" } })
  assert.match(t, /^That was a short stretch \(1 minute, nothing new verified\)/)
  assert.match(t, /Your NEXT was: the p = 3 case/)
  assert.match(t, /answer one question with the compiler/)
  assert.match(t, /write NOTE: and NEXT:/)
  assert.doesNotMatch(t, /ORDER|reminder \d of \d|not accepted/)
  assert.match(V.nudge({ elapsedMs: 1, pantograph: true }), /Leak II/)
})

test("extractNote reads the last NOTE/NEXT pair in whatever form the agent wrote it", () => {
  assert.deepEqual(extractNote("blah\nNOTE: a\nNEXT: b"), { note: "a", next: "b" })
  assert.deepEqual(extractNote("**NOTE:** first\n**NEXT:** second\n\nlater\nNOTE: third.\nNEXT: fourth."), { note: "third.", next: "fourth." })
  assert.deepEqual(extractNote("NEXT: only a next"), { note: "", next: "only a next" })
  assert.deepEqual(extractNote("  note: lower case works\n  next: too"), { note: "lower case works", next: "too" })
  assert.equal(extractNote("nothing here"), null)
  assert.equal(extractNote(""), null)
  assert.equal(extractNote(null), null)
  assert.ok(extractNote("NEXT: " + "x".repeat(2000)).next.length <= 700)
})

test("curiosity prompts rotate and never run out", () => {
  assert.ok(CURIOSITY_PROMPTS.length >= 10)
  assert.equal(curiosityPrompt(0), CURIOSITY_PROMPTS[0])
  assert.equal(curiosityPrompt(CURIOSITY_PROMPTS.length), CURIOSITY_PROMPTS[0])
  assert.equal(curiosityPrompt(-1), CURIOSITY_PROMPTS[CURIOSITY_PROMPTS.length - 1])
  assert.equal(curiosityPrompt("x"), CURIOSITY_PROMPTS[0])
})

// ---- the verifier guard ----------------------------------------------------------------------------------------
import { KERNEL_EVAL_RE, kernelEvalGuard } from "../../public/leak-memory.mjs"

test("kernelEvalGuard refuses a kernel evaluation on a large numeral, and nothing else", () => {
  const big = "open Nat in\ntheorem E396_k4 : (45153 : ℕ).descFactorial 5 ∣ (45153 : ℕ).centralBinom := by\n  rw [cb_eq]; decide +kernel"
  const r = kernelEvalGuard(big)
  assert.ok(r, "refused")
  assert.match(r, /^❌ Refused before compiling/)
  assert.match(r, /45153/)
  assert.match(r, /cannot be interrupted/)
  assert.match(r, /Prove the statement structurally/)
  assert.equal(kernelEvalGuard("theorem E396_k2 : (2480 : ℕ).descFactorial 3 ∣ (2480 : ℕ).centralBinom := by\n  decide +kernel"), null, "four digits are fine")
  assert.equal(kernelEvalGuard("theorem t : (123456 : ℕ) + 0 = 123456 := by\n  omega"), null, "no kernel evaluation, no refusal")
  assert.equal(kernelEvalGuard("-- the witness is 17609764994\ntheorem t (n : ℕ) : n = n := by decide"), null, "numerals in comments do not count")
  assert.equal(kernelEvalGuard("/- 17609764994 -/\ntheorem t (n : ℕ) : n = n := rfl"), null)
  assert.ok(kernelEvalGuard("theorem t : (17609764994 : ℕ) % 2 = 0 := by native_decide"))
  assert.ok(kernelEvalGuard("theorem t : (100000 : ℕ) % 2 = 0 := rfl"))
  assert.ok(kernelEvalGuard("example : (100000 : ℕ) % 2 = 0 := by\n  rfl"))
  assert.equal(kernelEvalGuard("theorem t : (99999 : ℕ) % 2 = 1 := by decide", { maxDigits: 6 }), null, "the threshold is a knob")
  assert.equal(kernelEvalGuard(""), null)
  assert.equal(kernelEvalGuard(null), null)
  assert.ok(KERNEL_EVAL_RE.test("by decide"))
  assert.ok(!KERNEL_EVAL_RE.test("by omega"))
})
