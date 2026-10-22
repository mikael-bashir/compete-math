// The library's upkeep (public/leak-memory.mjs): what a full library does, what a rated-low theorem is, how long the dream lasts, which theorems it
// reads together, and when it may retire one. Pure functions and one class; no network, no model.
import assert from "node:assert/strict"
import test from "node:test"

import {
  CURIOSITY_PROMPTS,
  DREAM,
  MAX_ENTRIES,
  MIN_RETIRED,
  Memory,
  TEMPERAMENT_CARD,
  VOICES,
  WOUNDED_AT,
  confirmedMembers,
  curiosityPrompt,
  dreamBudget,
  dreamClusters,
  isWounded,
  leakICheckin,
  makeHandlers,
  parseSleep,
  renderList,
  renderRecall,
  sleepPrompt,
  splitCorollaries,
} from "../../public/leak-memory.mjs"
import { mechanicalStars, toQuality } from "../../public/leak-quality.mjs"

const lemma = (name, a, b = a + 1) => `theorem ${name} (n : ℕ) (hn : ${a} < n) : ${b} ≤ n := by\n  have h := hn\n  omega`
const star = (m, e, s, extra = {}) => m.setQuality(e.id, { s, u: 0, rv: 1, r: "2026-10-22", ...extra })
const add = (m, script, meta) => m.addScript(script, meta)[0]

// ---- wounded: rated one or two stars --------------------------------------------------------------------------------------------------

test("a theorem rated one or two stars is wounded: hidden from the agent, found only with `all`, and counted", () => {
  const m = new Memory({})
  const [a, b, c, d] = ["wound_a", "wound_b", "wound_c", "wound_d"].map((n, i) => add(m, lemma(n, 10 + i)))
  star(m, a, 1)
  star(m, b, WOUNDED_AT)
  star(m, c, 4)
  assert.deepEqual([a, b, c, d].map((e) => isWounded(e)), [true, true, false, false], "one and two stars are wounded, four stars and unrated are not")
  assert.equal(m.hiddenCount(), 2)
  assert.equal(m.woundedCount(), 2)
  assert.equal(m.mergedCount(), 0)
  assert.deepEqual(m.list().map((e) => e.name).sort(), ["wound_c", "wound_d"])
  assert.deepEqual(m.list({ all: true }).map((e) => e.name).sort(), ["wound_a", "wound_b", "wound_c", "wound_d"])
  assert.ok(!m.recall("wound lemma").some((e) => e.name === "wound_a"), "recall does not offer it")
  assert.ok(m.recall("wound lemma", { all: true }).some((e) => e.name === "wound_a"), "unless asked")
  const text = renderList(m.list(), m)
  assert.match(text, /wound_c ★★★★:/, "a rating shows as stars")
  assert.match(text, /2 more rated one or two stars .* are hidden too; memory_list with all=true shows them/)
  assert.doesNotMatch(text, /merged into the general lemmas/, "nothing is merged, so that is not said")
})

test("what is never wounded: a nominated theorem, the target's own proof, a project seed, and a general lemma that stands in for others", () => {
  const m = new Memory({})
  const nominated = add(m, lemma("keep_nominated", 20))
  const target = add(m, lemma("keep_target", 21), { isTarget: true })
  const seed = add(m, lemma("keep_seed", 22), { origin: "seed", silent: true })
  const general = add(m, lemma("keep_general", 23), { origin: "abstracted", subsumes: ["aaaaaaaa"] })
  const abstractAlone = add(m, lemma("keep_abstract_alone", 24), { origin: "abstracted" })
  m.nominate(nominated.id)
  for (const e of [nominated, target, seed, general, abstractAlone]) star(m, e, 1)
  assert.deepEqual([nominated, target, seed, general, abstractAlone].map((e) => isWounded(e)), [false, false, false, false, true])
  assert.equal(m.woundedCount(), 1)
  assert.ok(m.visible(nominated))
})

test("recall puts the better rated first, and a general lemma a little above its peers", () => {
  const m = new Memory({})
  const low = add(m, lemma("rank_lemma_one", 30))
  const high = add(m, lemma("rank_lemma_two", 31))
  star(m, low, 3)
  star(m, high, 5)
  assert.deepEqual(m.recall("rank lemma", { markHit: false }).map((e) => e.name), ["rank_lemma_two", "rank_lemma_one"])
  star(m, high, 3)
  const gen = add(m, lemma("rank_lemma_three", 32), { origin: "abstracted", subsumes: ["aaaaaaaa"] })
  star(m, gen, 3)
  assert.equal(m.recall("rank lemma", { markHit: false })[0].name, "rank_lemma_three")
})

test("the recall and list tools take `all`, and say so in their descriptions", async () => {
  const m = new Memory({})
  const w = add(m, lemma("tool_wounded", 40))
  star(m, w, 1)
  const h = makeHandlers(m, "control-honoured")
  assert.doesNotMatch(await h.get("memory_recall").run({ query: "tool wounded" }), /tool_wounded/)
  assert.match(await h.get("memory_recall").run({ query: "tool wounded", all: true }), /tool_wounded/)
  assert.match(await h.get("memory_list").run({ all: true }), /tool_wounded ★:/)
  assert.match(h.get("memory_recall").description, /rated higher/)
  assert.match(h.get("memory_list").description, /hidden unless all is true/)
  assert.match(renderRecall([], m), /No saved theorem matches/)
})

// ---- a full library ------------------------------------------------------------------------------------------------------------------

test("the library holds more than it did, and a full one is never silent about what it cannot keep", () => {
  assert.equal(MAX_ENTRIES, 1500, "it was 600, and a library that reached it stopped growing")
  const said = []
  const m = new Memory({ maxEntries: 3, emit: (f) => said.push(f) })
  const kept = [50, 51, 52].map((i) => add(m, lemma(`full_${i}`, i)))
  assert.equal(m.size, 3)
  assert.equal(m.addScript(lemma("full_new", 60)).length, 0, "nothing can be put away, so it is not kept")
  assert.equal(m.stats.dropped, 1)
  const warnings = said.filter((f) => f.type === "message-annotation")
  assert.equal(warnings.length, 1, "and the first one is said out loud")
  assert.match(warnings[0].thought, /library is full \(3 theorems and none can be put away yet\), so 1 verified theorem\(s\) were not kept/)
  m.addScript(lemma("full_new2", 61))
  assert.equal(said.filter((f) => f.type === "message-annotation").length, 1, "not repeated for every theorem")
  assert.deepEqual(m.list({ all: true }).map((e) => e.name).sort(), kept.map((e) => e.name).sort())
})

test("a full library makes room by putting away what is merged first, then the lowest rated, and never what it must keep", () => {
  const m = new Memory({ maxEntries: 4 })
  const merged = add(m, lemma("room_merged", 70))
  const lowish = add(m, lemma("room_low", 71))
  const keeper = add(m, lemma("room_keeper", 72))
  const nominated = add(m, lemma("room_nominated", 73))
  merged.subsumedBy = "bbbbbbbb"
  star(m, lowish, 1)
  star(m, nominated, 1)
  m.nominate(nominated.id)
  assert.deepEqual(m.expendable().map((e) => e.name), ["room_merged", "room_low"], "merged first, then the lowest rated; the nominated one is not on the list")
  assert.equal(add(m, lemma("room_new1", 74)).name, "room_new1")
  assert.ok(!m.entries.has(merged.id), "the merged one went")
  assert.equal(add(m, lemma("room_new2", 75)).name, "room_new2")
  assert.ok(!m.entries.has(lowish.id), "then the rated-low one")
  assert.equal(m.addScript(lemma("room_new3", 76)).length, 0, "now nothing is left to put away")
  assert.ok(m.entries.has(keeper.id) && m.entries.has(nominated.id))
  assert.equal(m.stats.evicted, 2)
  assert.equal(m.size, 4)
})

// ---- how long the dream lasts ---------------------------------------------------------------------------------------------------

test("the dream is as long as the library is big: eighteen minutes for a small one, an hour from a thousand theorems", () => {
  const min = 60_000
  assert.equal(dreamBudget(0).totalMs, 18 * min)
  assert.equal(dreamBudget(300).totalMs, 18 * min, "a library that would need less is not given less than before")
  assert.equal(dreamBudget(492).totalMs, Math.round(60 * min * 0.492))
  assert.ok(dreamBudget(600).totalMs > 35 * min && dreamBudget(600).totalMs < 37 * min)
  assert.equal(dreamBudget(1000).totalMs, 60 * min)
  assert.equal(dreamBudget(5000).totalMs, 60 * min, "and no longer than that")
  for (const n of [0, 100, 492, 1000]) {
    const b = dreamBudget(n)
    assert.equal(b.rateMs + b.consolidateMs, b.totalMs, `rating and merging share it exactly (${n})`)
    assert.ok(b.rateMax >= 24)
  }
  assert.ok(dreamBudget(1000).rateMax > dreamBudget(100).rateMax, "a bigger dream rates more")
  assert.equal(dreamBudget(1000, { first: true }).totalMs, 18 * min, "the dream a run opens with is the short one: the agent is waiting")
  assert.equal(dreamBudget(100, { first: true }).totalMs, 18 * min)
  assert.equal(DREAM.everyMs, 60 * min)
  assert.equal(dreamBudget("junk").totalMs, 18 * min)
})

// ---- which theorems are read together ----------------------------------------------------------------------------------------------

const family = (stem, count, from = 0) => Array.from({ length: count }, (_, i) => `theorem ${stem}_case_${from + i} (n : ℕ) (hn : ${stem}Bound ${from + i} ≤ n) : ${stem}Count n ≥ ${from + i} := by\n  have h := hn\n  omega`)

test("related theorems are grouped, the biggest group first, and each theorem is in at most one group", () => {
  const m = new Memory({})
  for (const s of family("carry", 6)) m.addScript(s)
  for (const s of family("digit", 4)) m.addScript(s)
  m.addScript("theorem loner (a b c : ℕ) (hab : a ∣ b) (hbc : b ∣ c) : a ∣ c := by\n  exact Nat.dvd_trans hab hbc")
  const clusters = dreamClusters(m, { minSimilarity: 0.5 }) // two families built from one template: only a stricter cut tells them apart
  assert.equal(clusters.length, 2, "two families, and the one unrelated theorem is in no group")
  assert.ok(clusters[0].members.length >= clusters[1].members.length, "biggest first")
  for (const c of clusters) {
    const stems = new Set(c.members.map((e) => e.name.split("_")[0]))
    assert.equal(stems.size, 1, `a group is one family: ${[...stems]}`)
    assert.ok(c.members.length >= 2)
  }
  const all = clusters.flatMap((c) => c.members.map((e) => e.id))
  assert.equal(new Set(all).size, all.length, "no theorem twice")
  assert.ok(!all.includes([...m.entries.values()].find((e) => e.name === "loner").id))
})

test("what is hidden, wounded, nominated, the target's, or a seed is not offered for merging, and a group studied already is skipped", () => {
  const m = new Memory({})
  const es = family("stem", 8).map((s) => m.addScript(s)[0])
  es[0].subsumedBy = "cccccccc"
  star(m, es[1], 1)
  m.nominate(es[2].id)
  es[3].isTarget = true
  es[4].origin = "seed"
  const offered = new Set(dreamClusters(m).flatMap((c) => c.members.map((e) => e.id)))
  for (const i of [0, 1, 2, 3, 4]) assert.ok(!offered.has(es[i].id), `entry ${i} is not offered`)
  for (const i of [5, 6, 7]) assert.ok(offered.has(es[i].id), `entry ${i} is`)
  const first = dreamClusters(m)
  assert.equal(first.length, 1)
  assert.equal(dreamClusters(m, { skip: new Set([first[0].key]) }).length, 0, "the same members would get the same answer")
  assert.equal(dreamClusters(m)[0].key, first[0].key, "the key is stable")
})

test("a group is at most maxMembers theorems and fits the prompt's size; the groups are the same every time", () => {
  const m = new Memory({})
  for (const s of family("big", 30)) m.addScript(s)
  const a = dreamClusters(m, { maxMembers: 5 })
  assert.ok(a.every((c) => c.members.length <= 5))
  assert.ok(a.length >= 5, "thirty related theorems make several groups")
  assert.deepEqual(dreamClusters(m, { maxMembers: 5 }).map((c) => c.key), a.map((c) => c.key))
  const small = dreamClusters(m, { maxMembers: 12, maxChars: 500 })
  assert.ok(small.every((c) => c.members.length >= 2 && c.members.length <= 4), "a group is cut to what the prompt can hold, but never below two")
})

test("grouping a thousand-theorem library takes seconds, not minutes", () => {
  const m = new Memory({ maxEntries: 5000 })
  const stems = ["alpha", "beta", "gamma", "delta", "kappa", "sigma", "omega", "theta", "lambda", "zeta"]
  for (let i = 0; i < 1000; i++) m.addScript(family(stems[i % 10], 1, Math.floor(i / 10))[0])
  assert.ok(m.size >= 990)
  const t0 = Date.now()
  const clusters = dreamClusters(m)
  assert.ok(Date.now() - t0 < 15_000, `took ${Date.now() - t0} ms`)
  assert.ok(clusters.length >= 10)
  const pure = clusters.filter((c) => new Set(c.members.map((e) => e.name.split("_")[0])).size === 1)
  assert.ok(pure.length >= clusters.length * 0.95, `${pure.length} of ${clusters.length} groups are one family`)
  assert.ok(clusters.reduce((n, c) => n + c.members.length, 0) >= 950, "and almost every theorem is in one")
})

test("the dream's prompt shows one group, asks for a general lemma with a corollary per member, and its answer format is the one parseSleep reads", () => {
  const m = new Memory({})
  const members = family("carry", 3).map((s) => m.addScript(s)[0])
  const p = sleepPrompt(members, "theorem target : True")
  for (const e of members) assert.ok(p.includes(`[${e.id.slice(0, 8)}] ${e.name}`))
  assert.match(p, /THESE THEOREMS BELONG TOGETHER \(3\)/)
  assert.match(p, /Say in one sentence what idea they share/)
  assert.match(p, /re-prove each member you want to retire as a short corollary/)
  assert.match(p, /does not re-prove at least two members is not worth adding/)
  assert.match(p, /docstring/)
  assert.match(p, /\[\]/, "and it may return nothing")
  const answer = `thinking\n\`\`\`json\n[{"name":"g","script":"theorem g (n : ℕ) : n = n := rfl","subsumes":["${members[0].id.slice(0, 8)}"],"why":"all"}]\n\`\`\``
  assert.equal(parseSleep(answer)[0].subsumes[0], members[0].id.slice(0, 8))
  // the whole-memory form of the call (what the first tests used) picks the first group
  for (const s of family("digit", 3)) m.addScript(s)
  assert.match(sleepPrompt(m, "theorem target : True"), /THESE THEOREMS BELONG TOGETHER/)
})

// ---- retiring a member: only what the verified script re-proves -----------------------------------------------------------------------

const GENERAL = "theorem sq_ge_gen (k n : ℕ) (hk : k ≤ n) : k * n ≤ n * n := by\n  exact Nat.mul_le_mul_right n hk"
const memberScript = (k) => `theorem sq_ge_${k} (n : ℕ) (hn : ${k} ≤ n) : ${k} * n ≤ n * n := by\n  have h := hn\n  nlinarith [h]`
const corollary = (k, name = `sq_ge_${k}_via`, proof = `exact sq_ge_gen ${k} n hn`) => `theorem ${name} (n : ℕ) (hn : ${k} ≤ n) : ${k} * n ≤ n * n := by\n  ${proof}`

function sqLibrary() {
  const events = []
  const m = new Memory({ emit: (f) => events.push(f) })
  const mem = [2, 3, 4].map((k) => m.addScript(memberScript(k))[0])
  events.length = 0
  return { m, mem, events }
}

test("a member is retired when the verified script re-proves it from the general lemma, and the corollaries are not saved as entries", () => {
  const { m, mem, events } = sqLibrary()
  const script = [GENERAL, corollary(2), corollary(3), corollary(4)].join("\n\n")
  const added = m.addAbstract(script, mem.map((e) => e.id), { strict: true, attempt: 7 })
  assert.equal(added.length, 1)
  assert.equal(added[0].name, "sq_ge_gen")
  assert.equal(added[0].origin, "abstracted")
  assert.deepEqual([...added[0].subsumes].sort(), mem.map((e) => e.id).sort())
  assert.ok(mem.every((e) => e.subsumedBy === added[0].id), "every member points at the lemma that replaced it")
  assert.equal(m.size, 4, "three members and one general lemma: the corollaries added nothing")
  assert.deepEqual(m.list().map((e) => e.name), ["sq_ge_gen"], "the agent sees the general lemma alone")
  assert.equal(events.filter((f) => f.op === "save").length, 1)
  assert.equal(events.filter((f) => f.op === "update").length, 3, "each merged member is told once")
  assert.ok(!added[0].closure.includes("_via"), "the saved lemma does not carry the corollaries")
})

test("a member whose corollary is missing or does not use the general lemma stays; fewer than two retired adds nothing at all", () => {
  let { m, mem } = sqLibrary()
  // two re-proved, one not mentioned: the two are retired, the third stays visible
  let added = m.addAbstract([GENERAL, corollary(2), corollary(3)].join("\n\n"), mem.map((e) => e.id), { strict: true })
  assert.equal(added.length, 1)
  assert.deepEqual(mem.map((e) => !!e.subsumedBy), [true, true, false])
  assert.equal(MIN_RETIRED, 2)
  // a corollary proved without the general lemma is a copy, not a corollary
  ;({ m, mem } = sqLibrary())
  const copy = corollary(3, "sq_ge_3_copy", "have h := hn\n  nlinarith [h]")
  added = m.addAbstract([GENERAL, corollary(2), copy].join("\n\n"), mem.map((e) => e.id), { strict: true })
  assert.equal(added.length, 0, "only one member was really re-proved")
  assert.equal(m.size, 3)
  assert.ok(mem.every((e) => !e.subsumedBy))
  // one corollary: not worth a general lemma
  ;({ m, mem } = sqLibrary())
  assert.equal(m.addAbstract([GENERAL, corollary(2)].join("\n\n"), mem.map((e) => e.id), { strict: true }).length, 0)
  assert.equal(m.size, 3)
  // a general lemma that claims members it never re-proves
  ;({ m, mem } = sqLibrary())
  assert.equal(m.addAbstract(GENERAL, mem.map((e) => e.id), { strict: true }).length, 0, "claiming is not enough")
})

test("a corollary may spell the statement differently (spacing, the name) but not say something else; a nominated member is never retired", () => {
  let { m, mem } = sqLibrary()
  const spaced = "theorem renamed_two\n    (n : ℕ)   (hn : 2 ≤ n) :\n    2 * n ≤ n * n := by\n  exact sq_ge_gen 2 n hn"
  const weaker = "theorem sq_ge_3_weaker (n : ℕ) (hn : 3 ≤ n) : 3 * n ≤ n * n + 1 := by\n  exact Nat.le_succ_of_le (sq_ge_gen 3 n hn)"
  let added = m.addAbstract([GENERAL, spaced, weaker, corollary(4)].join("\n\n"), mem.map((e) => e.id), { strict: true })
  assert.deepEqual(added.map((e) => e.name).sort(), ["sq_ge_3_weaker", "sq_ge_gen"], "the weaker statement is another verified theorem, so it is saved as one, not as a corollary")
  assert.deepEqual(mem.map((e) => !!e.subsumedBy), [true, false, true], "the respelled one is retired, the different statement is not")
  ;({ m, mem } = sqLibrary())
  m.nominate(mem[0].id)
  added = m.addAbstract([GENERAL, corollary(2), corollary(3), corollary(4)].join("\n\n"), mem.map((e) => e.id), { strict: true })
  assert.equal(added[0].subsumes.length, 2)
  assert.equal(mem[0].subsumedBy, null, "the account nominated it, so it stays")
  assert.ok(mem[0].nominated)
})

test("splitCorollaries and confirmedMembers read the script, not the claim", () => {
  const { mem } = sqLibrary()
  const script = [GENERAL, corollary(2), corollary(4)].join("\n\n")
  assert.deepEqual(confirmedMembers(script, mem), [mem[0].id, mem[2].id])
  const split = splitCorollaries(script, mem)
  assert.match(split.general, /theorem sq_ge_gen/)
  assert.doesNotMatch(split.general, /_via/)
  assert.deepEqual(confirmedMembers("theorem sq_ge_gen : True := by sorry", mem), [])
  assert.deepEqual(confirmedMembers(script, []), [])
  assert.deepEqual(confirmedMembers("", mem), [])
})

test("without `strict` an abstract lemma is added as before, so the earlier callers and tests keep their meaning", () => {
  const { m, mem } = sqLibrary()
  const added = m.addAbstract(GENERAL, [mem[0].id])
  assert.equal(added.length, 1)
  assert.equal(mem[0].subsumedBy, added[0].id)
})

// ---- what the agent is told --------------------------------------------------------------------------------------------------------

test("the opening teaches the temperament for a question that does not yield, and does not invite the agent to stop", () => {
  const o = VOICES.curious.opening({ pantograph: true, memoryTools: true })
  assert.match(o, /THE TEMPERAMENT THAT SUITS A QUESTION THAT DOES NOT YIELD/)
  assert.match(o, /think in months/)
  assert.match(o, /Make things general/)
  assert.match(o, /Let small cases teach/)
  assert.match(o, /a check you have to wait for is computing, not understanding/)
  assert.match(o, /change altitude/)
  assert.match(o, /a one-line docstring/)
  assert.match(o, /graded for exactly this/)
  assert.match(o, /WHAT A GOOD STRETCH LOOKS LIKE/)
  assert.match(o, /highest-leverage instrument/)
  assert.match(o, /the notes are a log you keep while working, not a goodbye/)
  assert.match(o, /A stretch should hold several claims, not one/)
  assert.doesNotMatch(o, /closing the notebook for the evening|you will pause naturally/, "the invitation to stop is gone")
  assert.doesNotMatch(o, /Mathlib/)
})

test("every reminder carries the temperament card, so it outlives a compacted conversation", () => {
  const V = VOICES.curious
  assert.match(TEMPERAMENT_CARD, /think in months/)
  assert.match(TEMPERAMENT_CARD, /a few by hand, or a check that takes seconds, and never a computation you sit and wait for/)
  assert.ok(TEMPERAMENT_CARD.length < 900, "a few lines, not the guide's eight thousand characters")
  assert.ok(V.continue({ attempt: 3, rng: () => 1 }).includes(TEMPERAMENT_CARD))
  assert.ok(V.nudge({ elapsedMs: 60000 }).includes(TEMPERAMENT_CARD))
  assert.doesNotMatch(TEMPERAMENT_CARD, /open problem|is open|unsolved|too hard|impossible|you must\b/i)
  // the guide still goes where it did, after everything else
  const g = V.nudge({ elapsedMs: 60000, guide: "THE GUIDE" })
  assert.ok(g.endsWith("\n\nTHE GUIDE") && g.indexOf(TEMPERAMENT_CARD) < g.indexOf("THE GUIDE"))
})

test("Leak I is mentioned with the run's own numbers, only when it is not being used", () => {
  assert.equal(leakICheckin(null), "", "no numbers, no line")
  assert.match(leakICheckin({ calls: 0, sinceMs: 5 * 60000 }), /no searches so far this run/)
  assert.equal(leakICheckin({ calls: 6, sinceMs: 3 * 60000 }), "", "searching lately: nothing to say")
  assert.match(leakICheckin({ calls: 2, sinceMs: 47 * 60000 }), /2 searches so far, the last one 47 minutes ago/)
  assert.match(leakICheckin({ calls: 1, sinceMs: 30 * 60000 }), /1 search so far/)
  assert.match(leakICheckin({ calls: 0 }), /nearly free[\s\S]*ready-made/)
  const V = VOICES.curious
  assert.match(V.nudge({ elapsedMs: 60000, leakI: { calls: 2, sinceMs: 47 * 60000 } }), /Leak I check-in: 2 searches/)
  assert.match(V.continue({ attempt: 3, rng: () => 1, leakI: { calls: 0, sinceMs: 600000 } }), /Leak I check-in: no searches/)
  assert.doesNotMatch(V.nudge({ elapsedMs: 60000, leakI: { calls: 9, sinceMs: 60000 } }), /Leak I check-in/)
  assert.doesNotMatch(V.nudge({ elapsedMs: 60000 }), /Leak I check-in/)
})

test("the reminders' questions are about what lasts, small cases, the angle of attack and Leak I; none is about one target or a long computation", () => {
  assert.ok(CURIOSITY_PROMPTS.length >= 12)
  assert.equal(new Set(CURIOSITY_PROMPTS).size, CURIOSITY_PROMPTS.length)
  const all = CURIOSITY_PROMPTS.join("\n")
  for (const must of [/later proofs shorter/, /single statement contains both/, /first few cases by hand/, /a check that takes seconds/, /different reason/, /least proud of/, /Leak I/, /change altitude/]) assert.match(all, must)
  assert.doesNotMatch(all, /collatz|erdős|erdos|kummer|legendre|which prime/i, "they are for any target")
  assert.doesNotMatch(all, /scan|sieve|enumerate|brute|run a/i, "and none invites a long computation")
  for (const p of CURIOSITY_PROMPTS) assert.ok(p.length < 420, p)
})

test("a reminder's question rotates with the reminder count, even when the library has not changed size", () => {
  const V = VOICES.curious
  const asked = (t) => /let the compiler answer what it can: ([^\n]+?) Put what you find in Lean/.exec(t)[1]
  const qs = Array.from({ length: CURIOSITY_PROMPTS.length }, (_, turn) => asked(V.nudge({ elapsedMs: 60000, libraryCount: 600, nudge: 1, of: 2, turn })))
  assert.equal(new Set(qs).size, CURIOSITY_PROMPTS.length, "a frozen library used to give the same two questions every time")
  assert.equal(asked(V.nudge({ elapsedMs: 60000, turn: CURIOSITY_PROMPTS.length })), qs[0], "and it wraps")
  assert.equal(curiosityPrompt(3), CURIOSITY_PROMPTS[3])
  const c = (turn) => /in case it is useful: ([^\n]+)/.exec(V.continue({ attempt: 9, rng: () => 1, turn }))[1]
  assert.notEqual(c(0), c(1))
})

test("on lemmas written the way the agent writes them, the ones about the same function are read together and the unrelated ones are left alone", () => {
  const m = new Memory({})
  const src = [
    "theorem Tm_even (n : ℕ) (h : n % 2 = 0) : Tm n = n / 2 := by\n  unfold Tm\n  simp [h]",
    "theorem Tm_odd (n : ℕ) (h : n % 2 = 1) : Tm n = (3 * n + 1) / 2 := by\n  unfold Tm\n  simp [h]\n  omega",
    "theorem Tm_pos (n : ℕ) (hn : 0 < n) : 0 < Tm n := by\n  unfold Tm\n  split_ifs <;> omega",
    "theorem Tm_iter_pos (n k : ℕ) (hn : 0 < n) : 0 < Tm^[k] n := by\n  induction k with\n  | zero => simpa using hn\n  | succ k ih => rw [Function.iterate_succ_apply']; exact Tm_pos _ ih",
    "theorem offset_zero (n : ℕ) : offset 0 n = 0 := by\n  simp [offset]",
    "theorem offset_even_step (K n : ℕ) (h : Tm^[K] n % 2 = 0) : offset (K + 1) n = offset K n := by\n  simp [offset, h]",
    "theorem offset_odd_step (K n : ℕ) (h : Tm^[K] n % 2 = 1) : offset (K + 1) n = 3 * offset K n + 2 ^ K := by\n  simp [offset, h]\n  ring",
    "theorem cycle_gap_odd (K j : ℕ) (hj : 0 < j) : (2 ^ K - 3 ^ j) % 2 = 1 := by\n  omega",
    "theorem binomial_tail_chernoff (n k : ℕ) (hk : n / 2 < k) : Nat.choose n k ≤ 2 ^ n := by\n  exact Nat.choose_le_two_pow n k",
  ]
  for (const s of src) m.addScript(s)
  const groups = dreamClusters(m).map((c) => c.members.map((e) => e.name))
  assert.ok(groups.some((g) => g.includes("Tm_pos") && g.includes("Tm_iter_pos")), JSON.stringify(groups))
  assert.ok(groups.some((g) => g.includes("offset_even_step") && g.includes("offset_odd_step")), JSON.stringify(groups))
  const grouped = new Set(groups.flat())
  assert.ok(!grouped.has("binomial_tail_chernoff") && !grouped.has("cycle_gap_odd"), "a theorem with nothing in common with the rest is in no group")
})

// ---- ratings that need no reading ---------------------------------------------------------------------------------------------------

test("a repeat and a numeric fact are rated by what the entry shows, one star and two, and nothing else is", () => {
  assert.deepEqual(mechanicalStars({ duplicateOf: "other_name", ground: true }), { stars: 1, reasons: ["the same statement as other_name"], rated: true }, "a repeat first")
  assert.deepEqual(mechanicalStars({ duplicateOf: null, ground: true }), { stars: 2, reasons: ["a numeric fact, with no variable in it"], rated: true })
  assert.equal(mechanicalStars({ duplicateOf: null, ground: false, oneLiner: true, usedBy: 9, keystone: true }), null, "everything else waits for a reading")
  assert.equal(mechanicalStars(null), null)
  const q = toQuality({ usedBy: 3, ground: true, duplicateOf: null }, null, null, mechanicalStars({ ground: true }), new Date("2026-10-22T12:00:00Z"))
  assert.deepEqual(q, { s: 2, u: 3, rv: 1, r: "2026-10-22", n: 1 }, "numbers and flags only, as every rating")
  const wounded = { quality: q, origin: "verified", subsumes: [] }
  assert.equal(isWounded(wounded), true, "and a rating of two stars is wounded")
})
