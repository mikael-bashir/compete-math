// A target's guide (its written line of attack): validation, rendering, and where it is allowed to appear. It is handed over only when the
// agent is reminded to keep going (a resumed attempt, a reminder after a short stretch), never in the opening prompt.
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import test from "node:test"

import { GUIDE_MAX_CHARS, GUIDE_TAGS, VOICES, cleanGuide, continuePrompt, nudgePrompt, renderGuide, renderGuidePointer } from "../../public/leak-memory.mjs"

const TARGETS = new URL("../../src/data/leak-targets/", import.meta.url)
const targets = readdirSync(TARGETS).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, TARGETS), "utf8")))

const small = {
  intro: "A tiny chain.",
  notation: "f n = n + 1.",
  steps: [
    { id: "G1", tag: "holds", title: "First", says: "f is injective.", why: "Cancel the 1.", lean: ["f_injective"] },
    { id: "G2", tag: "repaired", title: "Second", says: "f has no fixed point.", why: "n = n + 1 has no solution." },
    { id: "G3", tag: "hole", title: "Third", says: "Every orbit of f is unbounded.", why: "Each step adds 1.", fill: "Settled: after k steps the value is n + k. To try: state it as a lemma.", lean: ["orbit_unbounded"] },
  ],
  next: ["Prove that f is injective.", "Prove that orbits are unbounded."],
}
const rendered = renderGuide(cleanGuide(small))
const MARK = "A LINE OF ATTACK"

test("a guide is cleaned: only well-formed steps survive, tags are from the fixed set, Lean names are identifiers", () => {
  assert.equal(cleanGuide(null), null)
  assert.equal(cleanGuide("a string"), null)
  assert.equal(cleanGuide([]), null)
  assert.equal(cleanGuide({ steps: [] }), null)
  assert.equal(cleanGuide({ steps: [{ id: "G1", says: "" }] }), null, "a step with nothing to say is dropped, and a guide with no step is nothing")
  const g = cleanGuide({ steps: [{ id: "G1", tag: "bogus", says: "  spaced \n out  ", lean: ["ok_name", "not ok", "x;y", 7, "Nat.add_comm"] }, "junk", null] })
  assert.equal(g.steps.length, 1)
  assert.equal(g.steps[0].tag, "holds", "an unknown tag falls back to holds, it never invents a status")
  assert.equal(g.steps[0].says, "spaced out", "whitespace is collapsed")
  assert.deepEqual(g.steps[0].lean, ["ok_name", "Nat.add_comm"])
  assert.deepEqual(GUIDE_TAGS, ["holds", "repaired", "hole"])
  const many = cleanGuide({ steps: Array.from({ length: 60 }, (_, i) => ({ id: `G${i}`, says: "x" })) })
  assert.equal(many.steps.length, 24, "at most 24 steps")
})

test("a guide too long to hand over at every reminder is not used at all, never cut in the middle", () => {
  const long = { steps: Array.from({ length: 24 }, (_, i) => ({ id: `G${i}`, tag: "hole", says: "s".repeat(1400), why: "w".repeat(1400), fill: "f".repeat(2200) })) }
  assert.ok(renderGuide(long).length > GUIDE_MAX_CHARS)
  assert.equal(cleanGuide(long), null)
})

test("the rendered guide says what each tag means, and gives every step its claim, its reason and what is settled", () => {
  assert.ok(rendered.startsWith(MARK))
  assert.match(rendered, /not a proof and not an instruction/)
  assert.match(rendered, /\[holds\]: it follows from the steps before it/)
  assert.match(rendered, /\[repaired\]: the step as first written fails/)
  assert.match(rendered, /\[hole\]: claimed, but the reasoning given does not establish it/)
  assert.match(rendered, /NOTATION\. f n = n \+ 1\./)
  assert.match(rendered, /G1 \[holds\] First\. f is injective\. Why: Cancel the 1\. Lean \(in your library\): f_injective\./)
  assert.match(rendered, /G2 \[repaired\] Second\. f has no fixed point\. Why: n = n \+ 1 has no solution\./)
  assert.match(rendered, /G3 \[hole\] Third\. Every orbit of f is unbounded\. Why: Each step adds 1\. What is settled, and what to try: Settled: after k steps/)
  assert.match(rendered, /MOVES THIS SUGGESTS\. 1\. Prove that f is injective\. 2\. Prove that orbits are unbounded\./)
  assert.match(rendered, /Lean names under a step are verified theorems that are already in your library/)
})

test("with no seeds in the run the Lean names are left out, and so is the sentence that explains them", () => {
  const bare = renderGuide(cleanGuide(small), { withLean: false })
  assert.doesNotMatch(bare, /f_injective|orbit_unbounded.*Lean|Lean \(in your library\)|Lean names under a step/)
  assert.match(bare, /G1 \[holds\] First\./, "the steps themselves stay")
  assert.equal(renderGuide(null), "")
  assert.equal(renderGuide({ steps: [] }), "")
})

for (const [name, V] of Object.entries(VOICES)) {
  test(`${name}: a resumed attempt and a reminder both carry the guide; with none given, neither does`, () => {
    const c = V.continue({ attempt: 3, elapsedMs: 120000, libraryCount: 4, rng: () => 1, guide: rendered })
    const n = V.nudge({ elapsedMs: 60000, libraryCount: 4, nudge: 1, of: 2, guide: rendered })
    assert.ok(c.includes(rendered), "continue")
    assert.ok(n.includes(rendered), "nudge")
    assert.equal(c.split(MARK).length - 1, 1, "once, not repeated")
    assert.equal(n.split(MARK).length - 1, 1, "once, not repeated")
    const c0 = V.continue({ attempt: 3, elapsedMs: 120000, libraryCount: 4, rng: () => 1 })
    const n0 = V.nudge({ elapsedMs: 60000, libraryCount: 4, nudge: 1, of: 2 })
    assert.ok(!c0.includes(MARK) && !n0.includes(MARK), "no guide, no trace of one")
    // the guide is an addition: everything the reminder said before it is still said
    assert.equal(c.replace(`\n\n${rendered}`, ""), c0, "continue is the old prompt plus the guide, nothing else changed")
    assert.equal(n.replace(`\n\n${rendered}`, ""), n0, "nudge is the old prompt plus the guide, nothing else changed")
  })

  test(`${name}: nothing the agent is told at the start mentions the guide`, () => {
    const starts = [V.opening?.({ pantograph: true, memoryTools: true }), V.mandate, V.goal, V.workModes, V.systemRule, V.sessionRules(1), V.sessionRules(3), V.persist?.({ pantograph: true }), V.strategy?.({})].filter((x) => typeof x === "string")
    for (const t of starts) assert.doesNotMatch(t, new RegExp(MARK), "the opening is the question and the agent's own ideas")
  })
}

test("the curious voice keeps its promises with a guide in it: nothing calls the problem open, hard or unsolved, and there are no orders", () => {
  const V = VOICES.curious
  const all = [V.continue({ attempt: 2, rng: () => 1, guide: rendered }), V.nudge({ elapsedMs: 1, guide: rendered })].join("\n")
  assert.doesNotMatch(all, /open problem|is open|unsolved|too hard|impossible|STANDING ORDER|ORDER:|not accepted|you must\b/i)
})

test("the old exported names still reach the order voice, and accept a guide", () => {
  assert.ok(continuePrompt({ attempt: 2, rng: () => 1, guide: rendered }).includes(rendered))
  assert.ok(nudgePrompt({ elapsedMs: 1, guide: rendered }).includes(rendered))
})

// ---- the pointer: what a reminder carries when the full text is already in the conversation ------------------------
test("the pointer names where the plan needs work and the moves it suggested, and is a fraction of the full text", () => {
  const g = cleanGuide(small)
  const ptr = renderGuidePointer(g)
  assert.match(ptr, /^THE LINE OF ATTACK \(G1 to G3\), written out in full earlier in this conversation, is still there as a plan to use, repair or leave\./)
  assert.match(ptr, /Where it needs work: G3 Third\./)
  assert.match(ptr, /Moves it suggested: 1\. Prove that f is injective\. 2\. Prove that orbits are unbounded\./)
  assert.ok(!ptr.includes(MARK), "it is not mistaken for a full copy: the full text starts with " + MARK)
  assert.ok(ptr.length < rendered.length / 2, `${ptr.length} against ${rendered.length}`)
  assert.equal(renderGuidePointer(null), "")
  assert.equal(renderGuidePointer({ steps: [] }), "")
  const noHoles = renderGuidePointer(cleanGuide({ steps: [{ id: "G1", tag: "holds", title: "Only", says: "x." }] }))
  assert.doesNotMatch(noHoles, /Where it needs work/)
  assert.doesNotMatch(noHoles, /\(G1 to G1\)/, "a single step has no range")
  const long = renderGuidePointer(cleanGuide({ steps: [{ id: "G1", says: "x." }], next: ["m".repeat(400)] }))
  assert.ok(long.length < 400 && /…$/.test(long), "a long move is clipped to a line: " + long.length)
})

for (const [name, V] of Object.entries(VOICES)) {
  test(`${name}: a reminder can carry the pointer in place of the guide, and then says nothing else new`, () => {
    const ptr = renderGuidePointer(cleanGuide(small))
    const c = V.continue({ attempt: 3, elapsedMs: 120000, libraryCount: 4, rng: () => 1, guide: ptr })
    const n = V.nudge({ elapsedMs: 60000, libraryCount: 4, nudge: 1, of: 2, guide: ptr })
    assert.ok(c.includes(ptr) && n.includes(ptr))
    assert.ok(!c.includes(MARK) && !n.includes(MARK))
    if (name === "curious") assert.doesNotMatch(c + n, /open problem|is open|unsolved|too hard|impossible|STANDING ORDER|ORDER:|not accepted|you must\b/i, "the curious voice's promises hold with the pointer in it")
  })
}

// ---- every target that has a guide ---------------------------------------------------------------------------------
const declared = (seeds) => new Set(seeds.flatMap((s) => [...String(s).matchAll(/^\s*(?:theorem|lemma|def|abbrev|instance)\s+([A-Za-z0-9_'.]+)/gm)].map((m) => m[1])))

for (const t of targets.filter((x) => x.guide)) {
  test(`${t.id}: the guide is valid, fits with room to spare, and its steps are well formed`, () => {
    const g = cleanGuide(t.guide)
    assert.ok(g, "cleanGuide accepts it")
    assert.equal(g.steps.length, t.guide.steps.length, "no step is dropped")
    const text = renderGuide(g)
    assert.ok(text.length <= GUIDE_MAX_CHARS - 200, `renders at ${text.length} of ${GUIDE_MAX_CHARS} characters`)
    const ids = t.guide.steps.map((s) => s.id)
    assert.deepEqual(ids, ids.map((_, i) => `G${i + 1}`), "step ids run G1, G2, ... in order")
    for (const s of t.guide.steps) {
      assert.ok(GUIDE_TAGS.includes(s.tag), `${s.id} has a tag from the fixed set, not ${s.tag}`)
      assert.ok(s.says && s.title, `${s.id} says something and has a title`)
      assert.ok(s.why, `${s.id} says why it follows (or might)`)
      if (s.tag === "hole") assert.ok(s.fill, `${s.id} is a hole, so it says what is settled and what to try`)
    }
    assert.ok(t.guide.steps.some((s) => s.tag === "hole"), "a guide that marks no hole is claiming a proof")
  })

  test(`${t.id}: its pointer is short and names every hole`, () => {
    const g = cleanGuide(t.guide)
    const ptr = renderGuidePointer(g)
    assert.ok(ptr.length > 100 && ptr.length < 1400, `the pointer is ${ptr.length} characters`)
    for (const s of t.guide.steps.filter((x) => x.tag === "hole")) assert.ok(ptr.includes(`${s.id} ${s.title}`), `the pointer lacks ${s.id}`)
    assert.ok(!ptr.includes(MARK))
  })

  test(`${t.id}: every Lean name the guide cites is a theorem in the target's seeds, which Leak IV verified`, () => {
    const have = declared(t.seeds)
    for (const s of t.guide.steps) for (const n of s.lean || []) assert.ok(have.has(n), `${s.id} cites ${n}, which no seed declares`)
  })

  test(`${t.id}: the rendered guide is safe for the curious voice`, () => {
    const text = renderGuide(cleanGuide(t.guide))
    assert.doesNotMatch(text, /open problem|is open|unsolved|too hard|impossible|STANDING ORDER|ORDER:|not accepted|you must\b/i)
    assert.doesNotMatch(text, /https?:\/\/|www\./i, "the agent has no network and the guide gives no source to look up: where the argument came from is recorded in the target's provenance, not shown")
  })
}
