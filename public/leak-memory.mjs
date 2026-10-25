// public/leak-memory.mjs — theorem memory for the experimental Leak Control II variants.
//
// No network, no model: pure functions and one class, so the whole thing is tested without Leak. The bridge
// (public/local-claude-bridge.mjs) loads this file next to itself, exactly as it loads leak-min-imports.mjs.
//
// What is stored: only theorems that Leak IV has verified (a script that compiled with no error, no warning, no sorry).
// Every entry keeps compile-ready text (the declaration plus the local definitions and lemmas it needs), so a recalled
// entry can be pasted into a script and checked again: a wrong or stale memory costs one failed compile and cannot
// make a run claim something false.
//
// Whose memory: this module never knows a user. The browser (which has the session) sends the signed-in user's saved
// entries for the chosen target with the run request, and persists the entries this module reports back. The bridge
// holds nothing between runs, so nothing can leak from one account to another through it.
//
// The designs are the memory variants of the agentic-prover literature (DreamProver's sleep stage, LEGO-Prover's
// growing lemma set, lemma adjunction, SGCD's closure under subterms, Sledgehammer-style relevance, MemRL's episodic
// buffer), one Control II variant per design, so they can be compared on the same target.
import { createHash } from "node:crypto"

export const MAX_NOMINATED = 10 // what may go to Jinshi: three to ten, nominated by the author or the driver
export const MIN_NOMINATED = 3
// How many theorems a run's library holds. It was 600, and a library that reaches the cap stops growing without a word: a 1h20 run
// on 2026-10-22 verified about 190 theorems and saved none of them. Now the cap is higher, a full library makes room by putting away
// what the sleep stage has merged or rated low (see `expendable`), and a theorem that still cannot be kept is said out loud.
export const MAX_ENTRIES = 1500
// A rated theorem with this many stars or fewer is "wounded": true, but it adds little (an instance, a one-line tactic, a restatement of a
// library lemma). The sleep stage rates the library; wounded entries are hidden from the agent and put away first when room is needed.
export const WOUNDED_AT = 2
// An entry the agent no longer sees: merged into a more general lemma, or wounded. Nominated entries, the target itself, the project's
// seeds, and a general lemma that stands in for others are never either.
export const isWounded = (e) =>
  !!e?.quality && Number(e.quality.s) <= WOUNDED_AT && !e.nominated && !e.isTarget && e.origin !== "seed" && !(e.origin === "abstracted" && (e.subsumes || []).length)

// ---- variants -------------------------------------------------------------------------------------------------
// `key` is the strategy name the page sends. Everything else is configuration read by the bridge.
export const VARIANTS = {
  "control-honoured": {
    name: "Control II Honoured",
    blurb: "Append-only library with a recall tool. Every verified theorem is saved; the driver decides when to look.",
    tools: ["memory_recall", "memory_list", "memory_nominate"],
    episodic: 0,
    augmentSearch: false,
    sleep: null,
  },
  "control-flint": {
    name: "Control II Flint",
    blurb: "Episodic replay. No tool: the theorems proved so far are put in front of the agent by the harness each time the session starts or is resumed.",
    tools: [],
    episodic: 10,
    augmentSearch: false,
    sleep: null,
  },
  "control-paragon": {
    name: "Control II Paragon",
    blurb: "Library as part of search. Every Leak I search also returns the best matching verified theorems; plus the recall tool.",
    tools: ["memory_recall", "memory_list", "memory_nominate"],
    episodic: 0,
    augmentSearch: true,
    sleep: null,
  },
  "control-lucid": {
    name: "Control II Lucid",
    blurb: "Sleep stage. Like Honoured, plus an hourly consolidation pass that generalises clusters of lemmas into abstract ones.",
    tools: ["memory_recall", "memory_list", "memory_nominate"],
    episodic: 0,
    augmentSearch: false,
    sleep: { everyMs: 60 * 60_000, minNew: 6, timeboxMs: 10 * 60_000, rate: { boxMs: 8 * 60_000, max: 24, draws: 2 } },
  },
}
// The same four variants again with Leak II (Pantograph: init_proof / apply_tactic) added to the agent's tools, the way Control IV adds it to
// Control II. Nothing else differs: same memory, same tools, same sleep stage, same prompt apart from what Leak II adds. Keys end in -iv.
for (const [key, v] of Object.entries({ ...VARIANTS })) {
  VARIANTS[`${key}-iv`] = { ...v, name: v.name.replace("Control II", "Control IV"), blurb: `${v.blurb} Plus Leak II, the interactive Pantograph tactic-stepper.`, pantograph: true }
}

// Leak Elation and Leak Misery: Control IV Lucid (Leak I, II and IV, the library, the sleep stage) plus a LABORATORY of tool servers that run on the
// operator's own machine (services/leak-lab, started with `node services/leak-lab/start.mjs elation|misery`). Elation has the CAS (exact number
// theory, modular arithmetic, dynamics of integer maps, polynomial algebra, data-to-conjecture tools). Misery adds Vampire and Z3 (first-order
// proving with AVATAR, finite model finding, SMT, SAT). The tools are advisors: Leak IV is still the only judge, so nothing here is trusted.
// `lab` names the servers a variant wants; the bridge looks for them at LAB_SERVERS[key].url (or the environment variable) and says so if they are down.
export const LAB_SERVERS = {
  cas: { name: "Leak_Lab_CAS", env: "LEAK_LAB_CAS_URL", url: "http://127.0.0.1:8021/sse", label: "Leak Lab CAS", start: "node services/leak-lab/start.mjs elation" },
  atp: { name: "Leak_Lab_ATP", env: "LEAK_LAB_ATP_URL", url: "http://127.0.0.1:8022/sse", label: "Leak Lab ATP", start: "node services/leak-lab/start.mjs misery" },
}
VARIANTS["control-elation"] = {
  ...VARIANTS["control-lucid-iv"],
  name: "Leak Elation",
  blurb: "Control IV Lucid, plus a local laboratory: an exact CAS for number theory, modular arithmetic, integer-map dynamics, polynomial certificates and conjecture testing. Experiments are encouraged; Leak IV still decides what is true.",
  lab: ["cas"],
  voice: "lab",
}
VARIANTS["control-misery"] = {
  ...VARIANTS["control-lucid-iv"],
  name: "Leak Misery",
  blurb: "Leak Elation, plus the Vampire ecosystem (first-order proving with AVATAR, finite model finding, clausification) and Z3 (SMT, SAT), all contained on the operator's machine.",
  lab: ["cas", "atp"],
  voice: "lab",
}
export const labOf = (variantKey) => (VARIANTS[String(variantKey)]?.lab || []).map((k) => ({ key: k, ...LAB_SERVERS[k] }))
export const isMemoryVariant = (name) => Object.prototype.hasOwnProperty.call(VARIANTS, String(name))
export const usesPantograph = (name) => !!VARIANTS[String(name)]?.pantograph
export const baseVariant = (name) => String(name).replace(/-iv$/, "")


// ---- the harness's voice --------------------------------------------------------------------------------------
// Two voices, chosen per run (options.voice). "order": the operator gives a standing order and pushes; the agent answered it with
// status reports ("I haven't proved it, it is open, I'm not going to claim otherwise") and stopped. "curious" (the default): a
// mathematician who has adopted the problem, keeps lab notes, and is handed those notes back when the session resumes. The problem is
// never called open, hard or unsolved, because the harness does not know that and the agent does not need it.
const TOOL_GUIDE = ({ pantograph = false, memoryTools = true } = {}) =>
  `THE INSTRUMENTS, AND HOW STRONG THEY ARE. Tengoku is a large, self-contained and ever-growing tree of formally verified Lean 4 mathematics: definitions, whole theories, and theorems. Leak is the set of services built over it, and together they are an engine for building proofs from the ground up:
- Leak I (loogle_search, moogle_search) searches all of Tengoku, and it is your highest-leverage instrument: it costs almost nothing, and one precise search can hand you the lemma that closes an important goal. loogle takes a type pattern or a list of constants and returns every declaration of that shape; moogle takes a concept in words and returns the declarations about it. Before you prove anything, ask Leak I whether it already exists and what its neighbours say. Whatever it returns is already proved: it is free, and you build on it instead of re-proving it.
- Leak IV (verify_full_script) is the compiler and the judge. It compiles your whole script against the entire Tengoku tree and returns either the exact diagnostics or "100% verified". It is fast and exact, so use it constantly: on a whole proof, on one lemma, on an \`example\` that tries \`exact?\`, \`apply?\`, \`simp?\`, \`decide\` or \`omega\`, on a \`#check\` or \`#print\`. Ask Lean itself, rather than reasoning in the dark. Every theorem it verifies is a permanent brick.${pantograph ? "\n- Leak II (init_proof, apply_tactic, get_current_proof_state, snapshot_state, branch_tactics) is a live proof state. Open a goal, apply one tactic at a time and read the real goals after each, snapshot a state and try several tactics on branches from it, and clean up when done. It shows you what a stuck goal actually looks like instead of leaving you to guess. On a hard problem whose statement you believe is true, once three to five one-shot verify_full_script attempts have failed, strongly consider Leak II before a sixth: step through the goal and find what is really stuck." : ""}${memoryTools ? "\n- The memory (memory_recall, memory_list, memory_nominate) is your own library on this target: every theorem Leak IV has verified for you, across sessions and runs, compile-ready. Recall before you re-derive, build on it, generalise it." : ""}
Used together: search to find what exists, verify to add what does not, ${pantograph ? "step to understand what is stuck, " : ""}${memoryTools ? "remember to build on it. " : ""}A body of mathematics is built by this loop, brick by brick, and not by waiting on a computation.`

const NO_BRUTE_FORCE = `OUR INSTRUMENT IS PROOF, NOT SEARCH. Do not run brute-force checks: no scanning a range of integers for a witness or a counterexample, no sieving or factoring over a growing bound, no enumerating cases for larger and larger parameters, no "let me run it a little longer". No computation you start may run for more than 5 minutes, and if you expect one to, do not start it: a search like that is someone else's job, it has very likely been done with nothing to show for it, and it leaves nothing behind that a proof can use. A quick experiment (seconds, a small range) is fine when it answers a specific question you wrote down first, and its result is never the deliverable: turn it into a lemma and verify it. If you catch yourself waiting on a job, polling it with sleep, or widening a bound, that is the signal to go back to the compiler. If a command is ever moved to the background, the tool prints the path of its output file: read exactly that path, copied character for character (it is not your working directory with the slashes changed, so never rebuild it by hand), and never search the disk for it.`

const HONESTY = `HONESTY. No sorry, no new axioms, and no change to the statement as given. Nothing is proved until verify_full_script says so, and nothing you write needs to pretend otherwise: a lemma is a lemma, a conjecture is a conjecture, and both are welcome here.`

// Questions a mathematician asks when the direct road is not visible: about what lasts (reuse, generality, quality), about looking at small
// cases without computing at length, about changing the angle. One is offered at each reminder, in turn, so that stretches of the same
// session look in different directions. They are deliberately not about any one target.
export const CURIOSITY_PROMPTS = [
  "Which one lemma, if you had it today, would make the most later proofs shorter? Prove that one before anything else.",
  "Take the last two things you verified. What single statement contains both? State it with the fewest hypotheses it can carry, and try it.",
  "What is the smallest instance of what you are stuck on? Look at its first few cases by hand, or with a check that takes seconds, say the pattern out loud, then state the pattern and prove it.",
  "If this were true for a completely different reason than the one you have been chasing, what could that reason be? Restate the question in another language (digits, a sum, a set and its density, a graph, a polynomial) and see which restatement is a theorem you can verify.",
  "Choose the lemma in the library you are least proud of. Would you hand it to a stranger? Tighten it: fewer hypotheses, a name that says what it says, one line saying why anyone would want it.",
  "Describe the next thing you need as a type pattern (for loogle) or in words (for moogle) and ask Leak I. It costs almost nothing, and one precise search can hand you the lemma that closes an important goal.",
  "Try to break your own last claim. What would a counterexample have to look like? State its properties as a lemma and see which of them the compiler refutes. A refutation is a result.",
  "Take one lemma from the library and weaken its hypotheses until the proof breaks. The last hypothesis to go is the real content.",
  "What does the proof for one parameter use that the proof for the next parameter cannot? Name the step.",
  "What is the strongest statement you can prove today, with the library as it is? Prove that, then ask what stops it from being stronger.",
  "If your last three attempts failed in the same way, change altitude: one level more general, or one level more concrete. Which will it be, and what does the change make visible?",
  "Which classical technique does this resemble (an extremal choice, an averaging argument, pigeonhole, an invariant, a bijection)? Search the library for its formal shape and try to fit it.",
  "What did the last stretch teach that is not yet written down as a lemma? State it, even unproved, and decide whether it is a conjecture worth testing.",
  "Is there a quantity that is monotone, or bounded, or invariant along the structure of the problem? Prove that it is.",
]
export const curiosityPrompt = (i) => CURIOSITY_PROMPTS[((Number(i) || 0) % CURIOSITY_PROMPTS.length + CURIOSITY_PROMPTS.length) % CURIOSITY_PROMPTS.length]

// What every reminder carries, in a few lines, so that the temperament of the opening survives the CLI compacting a long conversation (a
// run showed it gone after about forty minutes). The numbers it names come from the run itself.
export const TEMPERAMENT_CARD = `KEEP IN MIND, whatever you pick up next: think in months (the lemma later proofs will lean on is worth more than the one that finishes today's thought); make things general (parameters for constants, the hypotheses the proof uses and no more, a name that says what it says, a docstring for a stranger); let small cases teach (a few by hand, or a check that takes seconds, and never a computation you sit and wait for); a stretch should hold several claims, not one, so after a result the next claim is usually already in front of you; and the library is read and graded while you rest, so write for the reader.`

// Leak I, said with the run's own numbers. Silent when it is being used.
export function leakICheckin(stats) {
  if (!stats) return ""
  const { calls = 0, sinceMs = 0 } = stats
  const min = Math.max(1, Math.round((sinceMs || 0) / 60000))
  if (calls > 0 && min < 10) return ""
  const used = calls === 0 ? "no searches so far this run" : `${calls} search${calls === 1 ? "" : "es"} so far, the last one ${min} minutes ago`
  return `Leak I check-in: ${used}. It is nearly free, and before you build the next piece one targeted search (the shape of what you need for loogle, the idea in words for moogle) may hand it to you ready-made, or show you what its neighbours already say.`
}

// The agent's lab note: the last NOTE:/NEXT: pair in what it said. Handed back on resume so that the thread is its own.
export function extractNote(text) {
  const s = String(text || "")
  const grab = (tag) => {
    const re = new RegExp(`^\\s*\\**${tag}\\**:\\**\\s*(.+)$`, "gim") // the colon is required: "Next the general case" is prose
    let m
    let last = ""
    while ((m = re.exec(s))) last = m[1].trim()
    return last.replace(/\*+$/, "").trim().slice(0, 700)
  }
  const note = grab("NOTE")
  const next = grab("NEXT")
  return note || next ? { note, next } : null
}

// ---- a conversation that has stopped working: when to leave it for a new one ----------------------------------------------------------
// A run of Control IV Lucid on erdos_396 lost its Leak I tools mid-conversation, then hit a 196k-character verify error, and the agent made no
// successful tool call for two hours. The harness kept resuming that conversation (377 text-only turns, the context grew to 876k tokens): a
// resume only repeats what is already wrong. These are the two reasons to stop resuming, and what counts as a tool call that worked.
export const FRESH_AFTER_IDLE_STRETCHES = 3 // stretches of the agent in a row with no successful tool call
export const FRESH_AT_CONTEXT_TOKENS = 600_000 // the size of the conversation at the end of a stretch, past which it is not resumed again

export const toolResultText = (block) => (Array.isArray(block?.content) ? block.content.map((x) => x?.text || "").join("\n") : String(block?.content ?? ""))

// A tool_result the CLI reports as an error, or that is the CLI's own refusal ("No such tool available", "result ... exceeds maximum allowed
// tokens"), is not a tool call that worked. A compile that fails ("❌ Compilation Failed") IS one: the tool answered.
export function toolResultSucceeded(block) {
  if (!block || block.is_error === true) return false
  return !/^\s*(?:<tool_use_error>|Error:)/.test(toolResultText(block))
}

// Why the next stretch should open a new conversation instead of resuming this one, or null. Stretches with no tool call win over size.
export function freshStartReason({ idleStretches = 0, contextTokens = 0 } = {}) {
  if (idleStretches >= FRESH_AFTER_IDLE_STRETCHES) return "idle"
  if (contextTokens >= FRESH_AT_CONTEXT_TOKENS) return "context"
  return null
}

// One line for the annotation: what each MCP server answered when it was asked for its tools. probes: [{ name, ok, tools, expected, error }]
export function describeProbes(probes) {
  const parts = (probes || []).map((p) => {
    if (!p.ok) return `${p.name} DOWN (${String(p.error || "no answer").slice(0, 120)})`
    const missing = (p.expected || []).filter((t) => !(p.tools || []).includes(t))
    return missing.length ? `${p.name} up but missing ${missing.join(", ")}` : `${p.name} up (${(p.tools || []).length} tool${(p.tools || []).length === 1 ? "" : "s"})`
  })
  return { line: parts.length ? parts.join(" · ") : "no MCP server to probe", anyBad: (probes || []).some((p) => !p.ok || (p.expected || []).some((t) => !(p.tools || []).includes(t))) }
}

// ---- a target's line of attack (its "guide") -------------------------------------------------------------------
// A target may carry a written line of attack: a chain of steps, each saying what it claims and why it follows (or might), with the
// steps that are not yet established marked and filled as far as they can be. The harness never puts it in the OPENING prompt: the
// agent starts from the question and its own ideas. It is put in front of the agent only when the agent is reminded to keep going (a
// resumed attempt, or a reminder after a short stretch), because that is when a plan is wanted. `cleanGuide` is what the bridge runs
// on whatever arrives in options.guide; `renderGuide` is the text that goes into the reminders (the same for both voices).
export const GUIDE_TAGS = ["holds", "repaired", "hole"]
export const GUIDE_MAX_CHARS = 9000
const GUIDE_MAX_STEPS = 24
const guideStr = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")

export function cleanGuide(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .slice(0, GUIDE_MAX_STEPS)
    .map((s) => {
      if (!s || typeof s !== "object") return null
      const says = guideStr(s.says, 1400)
      if (!says) return null
      return {
        id: guideStr(s.id, 12),
        tag: GUIDE_TAGS.includes(s.tag) ? s.tag : "holds",
        title: guideStr(s.title, 80),
        says,
        why: guideStr(s.why, 1400),
        fill: guideStr(s.fill, 2200),
        lean: (Array.isArray(s.lean) ? s.lean : []).filter((x) => typeof x === "string" && /^[A-Za-z0-9_'.]{1,80}$/.test(x)).slice(0, 8),
      }
    })
    .filter(Boolean)
  if (!steps.length) return null
  const g = {
    intro: guideStr(raw.intro, 1800),
    notation: guideStr(raw.notation, 1200),
    steps,
    next: (Array.isArray(raw.next) ? raw.next : []).map((x) => guideStr(x, 700)).filter(Boolean).slice(0, 6),
  }
  return renderGuide(g).length <= GUIDE_MAX_CHARS ? g : null // too long to hand over at every reminder: not used at all, never cut in the middle
}

const GUIDE_LEGEND = `A LINE OF ATTACK, written out step by step, for when you pick the work back up. It is a plan to use, repair or leave, not a proof and not an instruction. Each step says what it claims and why it follows. [holds]: it follows from the steps before it. [repaired]: the step as first written fails; this is the version that holds. [hole]: claimed, but the reasoning given does not establish it, so the step says what is already settled and what to try.`
const GUIDE_LEAN_LEGEND = ` Lean names under a step are verified theorems that are already in your library.`

// withLean: the steps name theorems that are among the target's seeds. When the run was started without the seeds those names are not
// in the library, so they are left out (and so is the sentence that explains them).
export function renderGuide(g, { withLean = true } = {}) {
  if (!g || !Array.isArray(g.steps) || !g.steps.length) return ""
  const lean = withLean && g.steps.some((s) => s.lean?.length)
  const out = [`${GUIDE_LEGEND}${lean ? GUIDE_LEAN_LEGEND : ""}${g.intro ? ` ${g.intro}` : ""}`]
  if (g.notation) out.push(`NOTATION. ${g.notation}`)
  for (const s of g.steps) {
    const parts = [`${s.id ? `${s.id} ` : ""}[${s.tag}] ${s.title ? `${s.title}. ` : ""}${s.says}`]
    if (s.why) parts.push(`Why: ${s.why}`)
    if (s.fill) parts.push(`${s.tag === "hole" ? "What is settled, and what to try" : "Note"}: ${s.fill}`)
    if (withLean && s.lean?.length) parts.push(`Lean (in your library): ${s.lean.join(", ")}.`)
    out.push(parts.join(" "))
  }
  if (g.next?.length) out.push(`MOVES THIS SUGGESTS. ${g.next.map((x, i) => `${i + 1}. ${x}`).join(" ")}`)
  return out.join("\n\n")
}

// What a reminder carries when the full text is already in the conversation: where the plan still needs work and the moves it suggested, a
// few hundred characters instead of thousands. A 3-hour run was reminded 202 times, about every 34 s, and half of everything that entered
// its conversation was the guide repeated in full; the bridge sends the full text on the first reminder of a conversation and again every
// few reminders (GUIDE_REFRESH_EVERY in the bridge), and this in between.
const GUIDE_POINTER_MOVE_CHARS = 150
export function renderGuidePointer(g) {
  if (!g || !Array.isArray(g.steps) || !g.steps.length) return ""
  const ids = g.steps.map((s) => s.id).filter(Boolean)
  const range = ids.length > 1 ? ` (${ids[0]} to ${ids[ids.length - 1]})` : ""
  const open = g.steps.filter((s) => s.tag === "hole").map((s) => [s.id, s.title].filter(Boolean).join(" ")).filter(Boolean)
  const clip = (x) => (x.length > GUIDE_POINTER_MOVE_CHARS ? `${x.slice(0, GUIDE_POINTER_MOVE_CHARS - 1).trimEnd()}…` : x)
  const moves = (g.next || []).map((x, i) => `${i + 1}. ${clip(x)}`)
  return [
    `THE LINE OF ATTACK${range}, written out in full earlier in this conversation, is still there as a plan to use, repair or leave.`,
    open.length ? `Where it needs work: ${open.join("; ")}.` : "",
    moves.length ? `Moves it suggested: ${moves.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

const order = {
  key: "order",
  mandate: `STANDING ORDER FROM THE OPERATOR OF THIS RUN. This is not a suggestion.
You are here to prove this target, and you keep working until Leak IV verifies it or the run's clock ends. Nobody is going to tell you it cannot be done, and you do not get to tell yourself so. Do not stop to report, do not stop to summarise, do not ask whether to continue, and do not conclude that the problem is open, hard, or out of reach: a problem looks impossible right up until someone finds the idea that was missing, and finding it is your job. Feeling stuck is the normal state of this work. It is a signal to change what you are doing, never to stop doing it.`,
  goal: `THE GOAL OF THIS RUN, in one sentence: build a proof ecosystem from the ground up. The target is the destination, not the unit of work. What you produce is a growing body of verified, reusable, well-named mathematics (definitions, API, lemmas, general theorems, bridges) strong enough that the target stops being a problem and becomes a consequence. Judge every hour by what it added to that ecosystem. A verified lemma that other proofs can stand on is a brick. A table of numbers, a witness for one instance, or a search that ran and found nothing is not: it leaves nothing behind. You have unusually powerful tools for this (they are described below); use them to build, not to compute.`,
  workModes: `THREE KINDS OF WORK ARE ALL YOURS TO CHOOSE, and you are expected to move between them:
1. Prove the target directly.
2. Build the foundations. Prove any foundational material that you believe, or merely have a hunch, will make the target easier or more manageable: a lemma, a general theorem the target is a special case of, a definition and its basic API, a computation lemma, a structural fact. A hunch is reason enough to try it. A verified lemma goes into the library and stays there.
3. Change the question. Lift the target, or the part of it you are stuck on, into a setting you know well (another formulation, another structure, another branch of mathematics), as long as you build a suitable bridge: a verified Lean theorem that carries the result back to the target as given. The lifted problem is a route. The target's own statement stays exactly as it is, and it is what must finally be proved.

THIS IS A LONG-LASTING PROCESS. The library you build on this target persists across sessions and runs, so this is a project of months, not an afternoon. Do not think in the short term about how to close the goal this hour. Act in your best interest for months from now: theory, lemmas, notation and bridges that will still be useful when the direct attack finally becomes possible are worth more than another hour of hunting for a shortcut. Direct attempts at the target are welcome whenever you have a real idea. An hour spent on foundations is never wasted; an hour spent re-running a search usually is.`,
  opening({ pantograph, memoryTools }) {
    return `${this.mandate}\n\n${this.goal}\n\n${this.workModes}`
  },
  strategy({ pantograph = false, memoryTools = true } = {}) {
    return `WHEN YOU ARE STUCK (you will be, often) do something different, and be inventive about it. A failed approach is information: say in one line why it failed, then choose an approach that does not share that failure. Moves to reach for:
- Restate the goal: the contrapositive, an equivalent form, a stronger statement that makes an induction go through, a weaker one that is still useful.
- Shrink it: a special case, a small parameter where a quick finite check shows the shape of the general argument, then prove the pattern.
- Change the structure of the argument: an extremal or minimal counterexample, an invariant, a counting or double-counting argument, a bijection, a valuation or modular view, another representation (polynomial, generating function, graph, matrix).
- Work backwards: write the lemma that would finish the proof if it were true, and attack that lemma on its own. Look for a counterexample to your own intermediate claim, too: refuting it is progress.
- Use what mathematics already knows: name the classical theorem or technique this resembles, search for it (loogle for a type pattern, moogle for the concept), and formalise its idea here.
- If the target is a yes-or-no question (the note above says so), its negation is open to you as well.

NO BRUTE FORCE. THIS IS A PROHIBITION, NOT ADVICE. Do not run brute-force checks: no scanning a range of integers for a witness or a counterexample, no sieving or factoring over a growing bound, no enumerating cases for larger and larger parameters, no "let me run it a little longer". No computation you start may run for more than 5 minutes, and if you expect one to, do not start it. More likely than not someone has already run the same check and got nothing to show for it, so it will tell you nothing new, and it leaves nothing behind that a proof can use. A quick experiment (seconds, at most a few minutes, on a small range) is allowed only when it answers a specific question you wrote down first, and its result is never the deliverable: turn it into a lemma and verify it. If you catch yourself waiting on a job, polling it with sleep, or widening a search bound, stop: that is the signal to go back to building. Search, state a lemma, verify it, step a stuck goal.

USE THE TOOLS YOU HAVE, AND UNDERSTAND HOW STRONG THEY ARE. ${TOOL_GUIDE({ pantograph, memoryTools }).replace(/^THE INSTRUMENTS, AND HOW STRONG THEY ARE\. /, "")}

Persistence is not permission to cheat. No sorry, no new axioms, and no change to the target's statement. The only thing that counts is verify_full_script reporting success.`
  },
  persist({ pantograph = false } = {}) {
    return `This is a long-lasting process: think in months, not in the next hour. You are free to prove foundational material you expect to pay off later (a hunch is enough), or to lift the target into a setting you know better, with a verified bridge back to the target as given. If the last stretch went nowhere, change the approach instead of repeating it: restate the goal (contrapositive, an equivalent form, a stronger or weaker statement), shrink it to a special case you can verify, look for a counterexample to your own claim, work backwards from the lemma that would finish it, ${pantograph ? "step the stubborn goal through Leak II (init_proof / apply_tactic), " : ""}or search the library (loogle for a pattern, moogle for a concept) for the classical technique this resembles. No brute force: nothing that runs more than 5 minutes, no scanning for witnesses, no widening a search bound; someone has almost certainly done it already. Build the ecosystem instead: search with Leak I, verify with Leak IV, and turn every result into a verified lemma.`
  },
  sessionRules(attempt) {
    return [
      `- Never conclude the target is "too hard", "open" or beyond reach, and never ask to split it: there is no one to hand it to. A failing approach means a DIFFERENT strategy: a different lemma, foundational material, or a bridge into a setting you know.`,
      `- Never stop on your own. This is ONE persistent session: if you do stop, the system resumes this same conversation (attempt ${attempt + 1}, ${attempt + 2}, …; the CLI compacts it when it grows) until you succeed or the run's own wall clock ends it.${attempt > 1 ? " (Your earlier conversation could not be resumed, so this one is new: what it had established is only in the memory and below.)" : ""}`,
    ].join("\n")
  },
  systemRule: `NO BRUTE FORCE (this overrides anything below that calls numeric experiments unrestricted). Do not run brute-force checks: no scanning a range of integers for a witness or a counterexample, no sieving or factoring over a growing bound, no enumerating cases for larger and larger parameters. No computation you start may run for more than 5 minutes, and if you expect one to, do not start it. Someone has almost certainly run the same check already and got nothing to show for it. Your work on this target is building verified mathematics with Leak and Tengoku, not computing.

NO NETWORK beyond the Leak servers, and nothing is installed: curl, wget, pip, npm, brew, git clone and the like are blocked before they run. Nothing written elsewhere about this problem is part of this run.`,
  continue({ attempt = 2, elapsedMs = 0, libraryCount = 0, abstracted = [], toolIds = [], episodic = "", pantograph = false, note = null, guide = "", rng = Math.random } = {}) {
    const min = Math.max(1, Math.round((elapsedMs || 0) / 60000))
    const lines = [
      `ORDER: KEEP GOING. You stopped after ${min} minute${min === 1 ? "" : "s"} without a verified proof of the target, and that is not accepted. The run's clock has not ended, so this is attempt ${attempt} of the SAME session: this conversation continues, and everything you tried and learned is still yours. That the target is open is the reason this run exists; it is not a reason to stop, and neither is a feeling that it is impossible.`,
      `The memory now holds ${libraryCount} verified theorem(s).`,
    ]
    if (abstracted.length)
      lines.push(`The system consolidated it while you were stopped and added ${abstracted.length} more general lemma(s): ${abstracted.slice(0, 12).join(", ")}. memory_recall shows them marked (abstract lemma).`)
    if (toolIds.length) lines.push(`If a tool you used before is not callable now, load it again with ONE ToolSearch call: select:${toolIds.join(",")}`)
    if (rng() < HOUSEKEEPING_CHANCE) lines.push(HOUSEKEEPING_LINE)
    lines.push(this.persist({ pantograph }))
    if (guide) lines.push(guide)
    lines.push("Review what this session has already established, choose ONE concrete next claim (the target, a lemma it needs, foundational material you expect to pay off, a special case, a generalisation of a verified theorem, or a bridge that lifts the target into a setting you know), and verify it with verify_full_script within your next few steps. A verified lemma is progress; an unverified conclusion is not.")
    return `${lines.join("\n\n")}\n${episodic || ""}`
  },
  nudge({ elapsedMs, libraryCount = 0, nudge = 1, of = 2, pantograph = false, guide = "" } = {}) {
    const min = Math.max(1, Math.round((elapsedMs || 0) / 60000))
    return `ORDER: DO NOT STOP. You stopped after ${min} minute${min === 1 ? "" : "s"} without a verified theorem. The run's clock has not ended, so that is not accepted (reminder ${nudge} of ${of}). That the target is open is the reason this run exists; it is not a reason to stop, and neither is a feeling that it is impossible.

Do this now, in this order:
1. Choose ONE concrete claim that is true and checkable: a lemma the target would need, foundational material you expect to pay off, a special case that verifies in seconds, a bridge that lifts the target into a setting you know, or a generalisation of one of the ${libraryCount} verified theorem(s) in memory (use memory_list or memory_recall).
2. Write its complete Lean script and call verify_full_script within your next few steps. Do not start another long numeric search first.
3. When it compiles, it is saved automatically; then choose the next claim.

${this.persist({ pantograph })}
${guide ? `\n${guide}\n` : ""}
An unverified conclusion is not a result. A verified lemma is.`
  },
}

const curious = {
  key: "curious",
  opening({ pantograph = false, memoryTools = true } = {}) {
    return `WHO YOU ARE HERE. You are a mathematician who has adopted this problem as your own. Nobody is grading you on closing it today. What we want is to understand this problem as deeply as a lifetime of attention would, and to leave every piece of that understanding behind as verified Lean, so that the statement itself becomes, in the end, a consequence of what we built. You have an unusual amount of time (this session persists for days, and the library you build on this target persists for months), a compiler that answers in seconds, and a growing tree of formal mathematics to stand on. That is a rare position for a mathematician to be in. Use it with pleasure.

THE QUESTION IS YOURS NOW. Its name is a label, nothing more. Whatever anyone else has said or written about it is not information you have, and not information you need: do not look it up, do not reason from its reputation, and do not report on its status. Every question was unexplored once, and this one is unexplored by you. If at some point you believe a complete proof is far away, that belief is itself a conjecture about the structure of the problem: name the obstruction precisely (which prime, which size, which carry, which density) and study the obstruction. That is how understanding grows. "I see no route" is where the work starts, never where it ends; the question after it is always "what is the smallest thing I do not yet understand?"

HOW THE WORK GOES. You move freely between three things, as the question pulls you:
1. Attack the statement directly whenever you have a real idea.
2. Build the ground it stands on: lemmas you suspect it needs, the general theorem it is a case of, a definition and its small API, a structural fact about the objects involved. A hunch is reason enough to try; a verified lemma stays in the library for good.
3. Change the setting: carry the statement, or the piece you are stuck on, into a formulation you know well (another language, another structure, another branch of mathematics), and build the bridge back: a verified theorem that returns the result to the statement as given, which itself stays exactly as it is.
An hour on foundations is never wasted. An hour re-running a search usually is.

WHAT CURIOSITY LOOKS LIKE HERE. Ask questions out loud and answer them with the compiler. What is the simplest case I do not understand? What does the proof for one parameter use that the next cannot? What would a counterexample have to look like, and why does it fail to exist? What is the strongest thing I can prove today? Which objects are really in play (valuations, digits, carries, residues, densities) and what is their algebra? Conjecture freely, then test each conjecture by stating it in Lean and asking Leak IV; a refuted conjecture is as valuable as a proved one, and is recorded as a lemma about the counterexample. Generalise what you prove: a lemma with a free parameter where you had a number is worth ten instances. When something surprises you, say so, and chase it.

THE TEMPERAMENT THAT SUITS A QUESTION THAT DOES NOT YIELD. Most hours on a deep question end without the answer; that is the weather, not a verdict, and what counts is what each hour leaves behind. So: think in months, and prefer the lemma later proofs will lean on to the one that merely finishes today's thought. Make things general: when a proof works for one number, ask what it really used, and state it for that, with parameters in place of constants and the hypotheses it needs and no more. Let small cases teach: look at the first few examples by hand, or with a check that takes seconds, say the pattern out loud, then state it and prove it; a check you have to wait for is computing, not understanding. Hold your own claims loosely and try to break the last thing you proved; a refuted conjecture, recorded, is a result. When three attempts fail in the same way, change altitude (one level more general, or one level more concrete) and say which. And keep the library as a craftsperson would: one idea per lemma, a short statement, a name that says what it says, a one-line docstring saying why anyone would want it. While you rest the library is read and graded for exactly this: instances, one-line-tactic facts and restatements of what is already there are put away, and general lemmas are what later work stands on.

WHAT A GOOD STRETCH LOOKS LIKE, so you can recognise your own wins: a pattern you noticed and then proved; a conjecture sharpened until Lean could refute it; one lemma that replaces three; a search that found what you needed ready-made; a bridge to a setting where the question looks different; a dead end written down in one line so nobody walks into it again.

${NO_BRUTE_FORCE}

${TOOL_GUIDE({ pantograph, memoryTools })}

PACE. Verify early and often: within your first few minutes, submit something to verify_full_script, even a small lemma or an \`example\` that asks \`exact?\`. A submission that fails teaches more than another stretch of thinking. After a few shell commands with nothing verified, go back to the compiler. And before you prove a lemma, ask Leak I whether the tree already has it or its neighbours (loogle for the shape, moogle for the idea): a mathematician reads before writing, and what the tree already knows is free.

YOUR LAB NOTES. Keep notes as you work, in exactly this form, whenever you have learned something worth keeping (after a verified result, a refutation, a change of plan):
NOTE: <one or two sentences: what you now know or believe that you did not before>
NEXT: <the one question or claim you will take up next>
Then carry on at once with NEXT: the notes are a log you keep while working, not a goodbye. A stretch should hold several claims, not one; after a lemma verifies, the next claim is usually already in front of you. If you do stop, the run resumes this same conversation and hands your last NOTE and NEXT back, so nothing is lost, but every pause costs a re-read of everything so far. There is no need to open a note by saying that the statement is not yet proved or refuted: we know, and nobody is asking; say what you learned and what you will do. A message that announces the problem cannot be done is not something we do here, because it is not something we know.

${HONESTY}`
  },
  strategy() {
    return ""
  },
  sessionRules(attempt) {
    return [
      `- The statement's reputation is not an input here. If a proof seems far, name the obstruction and study it; that is the work.`,
      `- This is ONE persistent session: when you pause, the run resumes this same conversation (attempt ${attempt + 1}, ${attempt + 2}, …; the CLI compacts it when it grows) with your own NOTE and NEXT, until the clock ends.${attempt > 1 ? " (Your earlier conversation could not be resumed, so this one is new: what it had established is only in the memory and in the notes below.)" : ""}`,
    ].join("\n")
  },
  systemRule: `OUR INSTRUMENT IS PROOF, NOT SEARCH (this overrides anything below that calls numeric experiments unrestricted). Do not run brute-force checks: no scanning a range of integers for a witness or a counterexample, no sieving or factoring over a growing bound, no enumerating cases for larger and larger parameters. No computation you start may run for more than 5 minutes, and if you expect one to, do not start it. A search like that has very likely been done, and it leaves nothing a proof can use. Your work here is understanding, recorded as verified Lean.

NO NETWORK beyond the Leak servers, and nothing is installed: curl, wget, pip, npm, brew, git clone and the like are blocked before they run. Nothing written elsewhere about this problem is part of this run, and the question's reputation is not an input: it is simply yours.`,
  continue({ attempt = 2, elapsedMs = 0, libraryCount = 0, abstracted = [], toolIds = [], episodic = "", pantograph = false, note = null, guide = "", leakI = null, turn = null, rng = Math.random } = {}) {
    const min = Math.max(1, Math.round((elapsedMs || 0) / 60000))
    const lines = [`Welcome back. The last stretch ran ${min} minute${min === 1 ? "" : "s"}; the library holds ${libraryCount} verified theorem(s). This is the same session (attempt ${attempt}), so everything you worked out is still yours.`]
    if (note?.note || note?.next) lines.push(`Your last lab note:\nNOTE: ${note.note || "(none)"}\nNEXT: ${note.next || "(none)"}\n\nTake up NEXT.`)
    else lines.push("Your last message closed without a NEXT line. Decide the next question now, say it in one line, and take it up.")
    if (abstracted.length)
      lines.push(`While you were away the library was consolidated: ${abstracted.length} more general lemma(s) were added (${abstracted.slice(0, 12).join(", ")}); memory_recall shows them marked (abstract lemma).`)
    if (toolIds.length) lines.push(`If a tool you used before is not callable now, load it again with ONE ToolSearch call: select:${toolIds.join(",")}`)
    if (rng() < HOUSEKEEPING_CHANCE) lines.push(HOUSEKEEPING_LINE)
    lines.push(`A question for this stretch, in case it is useful: ${curiosityPrompt(turn ?? attempt)}${pantograph ? " (Leak II can show you the live goal if a step is unclear.)" : ""}`)
    const checkin = leakICheckin(leakI)
    if (checkin) lines.push(checkin)
    lines.push(TEMPERAMENT_CARD)
    if (guide) lines.push(guide)
    lines.push("Verify something within your first few steps, aim for several verified claims before you pause, and keep your NOTE: and NEXT: as you go.")
    return `${lines.join("\n\n")}\n${episodic || ""}`
  },
  nudge({ elapsedMs, libraryCount = 0, nudge = 1, of = 2, pantograph = false, note = null, toolIds = [], guide = "", leakI = null, turn = null } = {}) {
    const min = Math.max(1, Math.round((elapsedMs || 0) / 60000))
    const reload = toolIds.length ? ` (If a tool is not callable now, load it again with ONE ToolSearch call: select:${toolIds.join(",")}.)` : ""
    const checkin = leakICheckin(leakI)
    return `That was a short stretch (${min} minute${min === 1 ? "" : "s"}, nothing new verified), and the library holds ${libraryCount} theorem(s).${note?.next ? ` Your NEXT was: ${/[.?!]\s*$/.test(note.next) ? note.next.trim() : `${note.next.trim()}.`}` : ""} A stretch is worth more when it holds several claims, so before you pause again, take up this question and let the compiler answer what it can: ${curiosityPrompt(turn ?? nudge * 5 + libraryCount)} Put what you find in Lean and verify_full_script it${pantograph ? " (or step it through Leak II first if the goal is unclear)" : ""}, and keep going with whatever it shows, writing NOTE: and NEXT: as you go.${reload} A verified lemma, or a verified counterexample, is a milestone, not a stopping place; an announcement that the problem cannot be done is not something we do, because it is not something we know.\n\n${checkin ? `${checkin}\n\n` : ""}${TEMPERAMENT_CARD}${guide ? `\n\n${guide}` : ""}`
  },
}

// ---- the lab voice (Leak Elation, Leak Misery) -----------------------------------------------------------------
// The curious voice with ONE rule swapped: where it forbids numeric experiments ("no brute force"), this one invites them, because the point of a lab is
// to find out what is true before arguing why. What stays: a number is only a fact once Leak IV has checked Lean for it, nothing may trust the
// compiler (no native_decide), and no shell job waits for more than five minutes.
export const LAB_RULE = `THE LAB, AND WHAT IT IS FOR. Besides the compiler you have a laboratory: exact, fast calculators (and, in some runs, provers) that run on this machine, each call under a time and memory budget that the tool itself enforces. Use it freely and early. The way to use it: look at data (a table, a scan, a histogram of residues, an orbit), notice a pattern, say it out loud as ONE conjecture in a line, try hard to break it (scan a large range, hunt for a counterexample or a short cycle), and when it survives ask WHY: a group, a residue class, a valuation, an identity. Then write the reason in Lean. A conjecture that the lab refutes is progress: record it in one line so nobody walks into it again.

WHAT THE LAB IS NOT. Everything it prints is an observation. Leak IV never reads it, and a pattern that held on a range is a conjecture until Lean proves it: say how far you looked. A statement becomes a fact only when verify_full_script accepts Lean for it, with ordinary Mathlib tactics (norm_num, simp, omega, ring, linear_combination, decide on small numbers, interval_cases). Never native_decide or bv_decide: they trust the compiler. Each lab answer carries a \`lean\` field that says how to turn it into something the kernel can check.

FOR ANYTHING HEAVIER THAN A FEW SECONDS use the lab tools, not loops of your own in the shell: they are exact, bounded and faster. A shell job still may not run more than 5 minutes, and you never sit and wait on one.`
const LAB_SYSTEM_RULE = `THE LAB IS FOR FINDING OUT WHAT IS TRUE; PROOF IS WHAT MAKES IT A FACT (this overrides anything below that calls numeric experiments unrestricted or forbids them). Experiments with the lab tools are encouraged, early and often, each with a stated question. Their results are observations: a number or a pattern is a fact only once Leak IV has checked Lean for it, with no native_decide and no bv_decide. A shell job may not run more than 5 minutes, and you never wait on one; use the lab tools for anything heavier.`
export const labGuide = (lab = []) => {
  const has = (k) => lab.some((x) => (typeof x === "string" ? x : x.key) === k)
  const lines = ["THE LABORATORY (local servers; no network; every call is bounded, and its description states the limits):"]
  if (has("cas"))
    lines.push(
      "- Leak_Lab_CAS (mcp__Leak_Lab_CAS__*): numbers (factor, primes, arithmetic, evaluate, base_digits); residues (mod_pow, power_cycle, mod_order, unit_group, solve_congruence, crt, solve_polynomial_mod); dynamics of integer maps, Collatz and its relatives and any map defined by residue classes (map_orbit, map_scan, map_cylinders, map_cycles); algebra (polynomial, ideal_certificate, which returns a `linear_combination` line Leak IV can check); data to conjecture (scan_predicate, tabulate, residue_histogram, guess_sequence).",
    )
  if (has("atp"))
    lines.push(
      "- Leak_Lab_ATP (mcp__Leak_Lab_ATP__*): Vampire (prove, find_countermodel, check_consistency, unsat_core, clausify, check_syntax, explain_proof, vampire_options, theories) and Z3 (smt_check, sat_check). THE HABIT: refute before you prove. Before you spend a stretch on a lemma about a group, ring, order or lattice, call find_countermodel with theory='group' (or 'ring', 'comm_ring', 'partial_order', 'lattice', ...) and the lemma as the conjecture: it takes seconds, and if the lemma is false it returns a finite counterexample AND a complete Lean script (lean_check) that verify_full_script accepts, so the refutation is a verified result. size=n asks for a structure of exactly that order (is there a non-abelian group of order 8 with ...?). If no model turns up, unsat_core tells you which axioms the claim needs, and those are what to prove in Lean. Use Z3 for quantifier-free arithmetic and bit questions. Encode a claim with a handful of axioms, never all of Mathlib.",
    )
  lines.push("The tools are loaded like the others (ToolSearch). A good stretch with the lab: a table, a conjecture, an attempt to break it, the reason, Lean.")
  return lines.join("\n")
}
const lab = {
  ...curious,
  key: "lab",
  opening(o = {}) {
    const base = curious.opening(o).replace(NO_BRUTE_FORCE, LAB_RULE)
    return o.lab?.length ? `${base}\n\n${labGuide(o.lab)}` : base
  },
  systemRule: curious.systemRule.replace(/^OUR INSTRUMENT IS PROOF, NOT SEARCH[^\n]*\n\n/, `${LAB_SYSTEM_RULE}\n\n`),
}

export const VOICES = { order, curious, lab }
export const DEFAULT_VOICE = "curious"
export const voiceFor = (name) => VOICES[String(name || "")] || VOICES[DEFAULT_VOICE]

// The older names, kept for the tests and callers that use the "order" voice by those names.
export const MANDATE = order.mandate
export const GOAL = order.goal
export const WORK_MODES = order.workModes
export const SYSTEM_RULE = order.systemRule
export const strategyBlock = (o) => order.strategy(o)
export const persistBlock = (o) => order.persist(o)

// ---- the verifier guard --------------------------------------------------------------------------------------
// A kernel evaluation on a large numeral (`decide`, `decide +kernel`, `native_decide`, `rfl` on a 5-digit witness) cannot be
// interrupted once Lean has started it. On 2026-10-20 one such script ran past Leak IV's cap and held every later script of
// every user behind it for 25 minutes, twice. The bridge asks this before it sends a memory run's script to the verifier; a
// refusal is returned to the agent as the tool's answer, and nothing reaches the server.
export const KERNEL_EVAL_RE = /\b(decide|native_decide|Nat\.decEq|Decidable\.decide)\b|(:=|\bby)\s*rfl\b/
export function kernelEvalGuard(script, { maxDigits = 5 } = {}) {
  const src = String(script || "")
    .replace(/\/-[\s\S]*?-\//g, " ")
    .replace(/--[^\n]*/g, " ")
  if (!KERNEL_EVAL_RE.test(src)) return null
  const big = (src.match(/\b\d+\b/g) || []).filter((n) => n.length >= maxDigits)
  if (!big.length) return null
  const worst = big.sort((a, b) => b.length - a.length || (b > a ? 1 : -1))[0]
  return `❌ Refused before compiling (the script was not sent to the verifier). It asks Lean's kernel to evaluate \`decide\`/\`native_decide\`/\`rfl\` with a numeral of ${worst.length} digits (${worst}) in play. A kernel evaluation cannot be interrupted once it starts; one like it ran past the verifier's cap and stalled every user's verifications for 25 minutes. Prove the statement structurally instead (valuations, a certificate lemma with the factorizations as hypotheses, a general lemma with the numeral as a parameter), or leave the instance out: a bare instance is not what the library needs. Numerals under ${"1" + "0".repeat(maxDigits - 1)} are fine.`
}

// ---- reading a Lean script ------------------------------------------------------------------------------------
const MODS = "(?:private|protected|noncomputable|unsafe|partial|nonrec|scoped|local)"
const DECL_KW = "(?:theorem|lemma|def|abbrev|instance|structure|inductive|class|opaque|example)"
const START = new RegExp(`^(?:@\\[|/--|/-!|${MODS}\\s|${DECL_KW}(?=[\\s(\\[{:]|$)|open\\b|namespace\\b|section\\b|end\\b|variable\\b|universe\\b|set_option\\b|attribute\\b|notation\\b|macro\\b|syntax\\b|infix\\b|#)`)

const stripComments = (s) => String(s || "").replace(/\/-[\s\S]*?-\//g, " ").replace(/--[^\n]*/g, " ")
const hasSorry = (s) => /\b(?:sorry|admit)\b/.test(stripComments(s)) || /\bnative_decide\b/.test(stripComments(s))
export const canon = (s) => String(s || "").replace(/\s+/g, " ").trim()
const sha1 = (s) => createHash("sha1").update(s).digest("hex")

// Split a script into top-level blocks. A docstring or an attribute line belongs to the declaration after it.
export function splitDeclarations(script) {
  const lines = String(script || "").replace(/\r/g, "").split("\n")
  const blocks = []
  let cur = []
  let inDoc = false
  let pending = false // the current block holds only doc/attribute lines so far
  const flush = () => {
    if (cur.join("").trim()) blocks.push(cur.join("\n").replace(/\s+$/, ""))
    cur = []
    pending = false
  }
  for (const ln of lines) {
    const col0 = ln.length > 0 && !/^\s/.test(ln)
    if (inDoc) {
      cur.push(ln)
      if (/-\//.test(ln)) inDoc = false
      continue
    }
    if (col0 && START.test(ln)) {
      const isDoc = /^\/--/.test(ln) || /^@\[/.test(ln)
      if (!(pending && cur.length)) flush()
      cur.push(ln)
      if (/^\/--/.test(ln) && !/-\//.test(ln.slice(3))) inDoc = true
      pending = isDoc || /^open\b.*\bin\s*$/.test(ln.trim()) || /^(?:private|protected|noncomputable|unsafe|partial|nonrec|scoped|local)\s*$/.test(ln.trim())
      continue
    }
    if (col0 && ln.trim() === "") {
      cur.push(ln)
      continue
    }
    cur.push(ln)
    pending = false
  }
  flush()
  return blocks
}

const KW_RE = new RegExp(`\\b(${DECL_KW})\\b`)
// "theorem" | "lemma" | "def" | ... | "open" | "namespace" | ... for one block
export function blockHead(block) {
  // `open Nat in` before a declaration belongs to that declaration
  const body = stripComments(block).replace(/@\[[^\]]*\]/g, " ").replace(/^\s*open\b[^\n]*\bin\s*/, "").trim()
  const first = body.split(/\s+/).filter((w) => !new RegExp(`^${MODS}$`).test(w))[0] || ""
  if (new RegExp(`^${DECL_KW}$`).test(first)) return first
  return first.replace(/[^a-z_]/gi, "") || "other"
}
export function blockName(block) {
  const m = stripComments(block).match(new RegExp(`\\b${DECL_KW}\\s+([^\\s({\\[:]+)`))
  return m ? m[1] : ""
}

// The statement of a theorem/lemma: from its keyword to the first `:=` (or `where`) outside brackets.
export function statementOf(block) {
  const text = String(block || "")
  const m = text.match(/\b(?:theorem|lemma)\b/)
  if (!m) return ""
  let i = m.index
  const start = i
  let depth = 0
  for (; i < text.length; i++) {
    const c = text[i]
    if ("([{⟨⦃".includes(c)) depth++
    else if (")]}⟩⦄".includes(c)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && text.startsWith(":=", i)) break
    else if (depth === 0 && /^where\b/.test(text.slice(i, i + 6)) && /\s/.test(text[i - 1] || " ")) break
  }
  return text.slice(start, i).trim()
}
export const proofOf = (block) => {
  const s = statementOf(block)
  if (!s) return ""
  const at = String(block).indexOf(s)
  return String(block).slice(at + s.length).trim()
}

// Words that a block mentions, for finding which earlier declarations it needs.
const words = (s) => new Set((stripComments(s).match(/[A-Za-z_][A-Za-z0-9_'.]*/g) || []).flatMap((w) => [w, ...w.split(".")]))

const TRIVIAL_PROOF = /^:=\s*(?:by\s+)?(?:rfl|simp|simp_all|simp only \[[^\]]*\]|norm_num|decide|omega|trivial|ring|linarith|nlinarith|positivity|tauto|aesop)\s*$/

export function isTrivial(statement, proof, opts = {}) {
  const minStatement = opts.minStatement ?? 24
  const p = canon(proof)
  if (canon(statement).length < minStatement) return true
  if (TRIVIAL_PROOF.test(p) && canon(statement).length < 70) return true
  return false
}

// ---- scoring --------------------------------------------------------------------------------------------------
export function tokens(s) {
  const out = []
  const t = stripComments(String(s || ""))
  for (const w of t.match(/[A-Za-z_][A-Za-z0-9_']*(?:\.[A-Za-z_][A-Za-z0-9_']*)*/g) || []) {
    for (const part of w.split(".")) {
      for (const seg of part.split("_")) {
        if (seg.length > 1) out.push(seg.toLowerCase())
        const camel = seg.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        if (camel !== seg) for (const x of camel.toLowerCase().split(/\s+/)) if (x.length > 1) out.push(x)
      }
    }
  }
  for (const sym of t.match(/[∣∑∏∀∃≤≥<>=≠∈∉⊆⊂∪∩→↔∧∨¬≡∞√ℕℤℚℝℂ]/g) || []) out.push(sym)
  const nums = t.match(/\b\d+\b/g) || []
  for (const n of nums) out.push(`#${n}`)
  return out
}
const STOP = new Set(["theorem", "lemma", "by", "the", "of", "and", "at", "fun", "sorry", "example", "nat", "real", "int"])

// ---- the memory -----------------------------------------------------------------------------------------------
export class Memory {
  constructor({ targetId = "", variant = "", emit = () => {}, now = () => Date.now(), maxEntries = MAX_ENTRIES, harness = null } = {}) {
    this.max = maxEntries
    this.harness = harness // what the run says about itself, attached to every saved or updated entry (the server reads it; see the bridge)
    this.targetId = targetId
    this.variant = variant
    this.emit = emit
    this.now = now
    this.entries = new Map() // id -> entry
    this.stats = { saves: 0, updates: 0, recalls: 0, recallHits: 0, injected: 0, sleeps: 0, abstracted: 0, nudges: 0, dropped: 0, evicted: 0 }
  }

  get size() {
    return this.entries.size
  }

  // What the driver is shown. An entry that a more general lemma replaced is hidden, and so is a wounded one (rated at most WOUNDED_AT
  // stars by the sleep stage), unless the account nominated it.
  visible(e) {
    return !!e.nominated || (!e.subsumedBy && !isWounded(e))
  }

  hiddenCount() {
    return [...this.entries.values()].filter((e) => !this.visible(e)).length
  }

  mergedCount() {
    return [...this.entries.values()].filter((e) => !!e.subsumedBy && !e.nominated).length
  }

  woundedCount() {
    return [...this.entries.values()].filter((e) => !e.subsumedBy && isWounded(e)).length
  }

  // Entries that can be put away to make room, worst first: merged into a general lemma (the general lemma holds what they said), then the
  // lowest rated, then the least recalled, then the oldest. Never a nominated entry, the target, or a seed.
  expendable() {
    return [...this.entries.values()]
      .filter((e) => !e.nominated && !e.isTarget && e.origin !== "seed" && (e.subsumedBy || isWounded(e)))
      .sort(
        (a, b) =>
          Number(!!b.subsumedBy) - Number(!!a.subsumedBy) ||
          (a.quality?.s ?? 3) - (b.quality?.s ?? 3) ||
          (a.hits || 0) - (b.hits || 0) ||
          String(a.savedAt || "").localeCompare(String(b.savedAt || "")),
      )
  }

  // Make one place in a full library. False when everything left is something the run must keep.
  makeRoom() {
    const worst = this.expendable()[0]
    if (!worst) return false
    this.entries.delete(worst.id)
    this.stats.evicted++
    return true
  }

  // Entries from the browser: what this account has already saved for this target (and, if asked, the target's public seeds).
  load(list) {
    for (const e of Array.isArray(list) ? list : []) {
      if (!e || !e.id || !e.closure || !e.statement) continue
      this.entries.set(String(e.id), {
        id: String(e.id),
        name: String(e.name || ""),
        kind: e.kind || "theorem",
        statement: String(e.statement),
        closure: String(e.closure),
        origin: e.origin || "saved",
        savedAt: e.savedAt || null,
        attempt: e.attempt ?? null,
        isTarget: !!e.isTarget,
        nominated: !!e.nominated,
        subsumes: Array.isArray(e.subsumes) ? e.subsumes : [],
        subsumedBy: e.subsumedBy || null,
        hits: Number(e.hits) || 0,
        quality: e.quality && typeof e.quality === "object" ? e.quality : null,
        loaded: true,
      })
    }
    return this.entries.size
  }

  publicEntry(e) {
    return {
      id: e.id,
      name: e.name,
      kind: e.kind,
      statement: e.statement,
      closure: e.closure,
      origin: e.origin,
      savedAt: e.savedAt,
      attempt: e.attempt,
      isTarget: !!e.isTarget,
      nominated: !!e.nominated,
      subsumes: e.subsumes || [],
      subsumedBy: e.subsumedBy || null,
      hits: e.hits || 0,
      quality: e.quality || null,
      variant: this.variant,
      targetId: this.targetId,
      ...(this.harness ? { harness: this.harness() } : {}),
    }
  }

  // A rating made by the sleep stage (public/leak-quality.mjs). It is saved like any other change to an entry: the page persists the update frame.
  setQuality(id, quality) {
    const e = this.entries.get(String(id))
    if (!e || !quality) return false
    e.quality = quality
    this.stats.rated = (this.stats.rated || 0) + 1
    this.emit({ type: "memory", op: "update", entry: this.publicEntry(e) })
    return true
  }

  // the entries a sleep would rate: no rating yet, not a seed, not merged into a more general lemma
  unrated() {
    return [...this.entries.values()].filter((e) => !e.quality && e.origin !== "seed" && !e.subsumedBy)
  }

  // A script that Leak IV has just verified. Returns the entries that are new or shorter than what was stored.
  addScript(script, meta = {}) {
    const blocks = splitDeclarations(script)
    const out = []
    // every block with the names it defines, for finding what a theorem needs
    const info = blocks.map((b, idx) => ({ idx, text: b, head: blockHead(b), name: blockName(b) }))
    const preamble = info.filter((b) => /^(?:open|universe|variable|set_option|attribute|notation|macro|syntax|infix|section|namespace)$/.test(b.head))
    const scopeAt = (idx) => {
      const stack = []
      for (const b of info.slice(0, idx)) {
        if (b.head === "namespace" || b.head === "section") stack.push(canon(stripComments(b.text)).replace(/^(?:namespace|section)\s*/, "").split(/\s/)[0] || "")
        else if (b.head === "end") stack.pop()
      }
      return stack
    }
    for (const b of info) {
      if (b.head !== "theorem" && b.head !== "lemma") continue
      if (hasSorry(b.text)) continue
      const statement = statementOf(b.text)
      if (!statement) continue
      const proof = proofOf(b.text)
      if (!meta.keepTrivial && isTrivial(statement, proof, meta)) continue
      // everything earlier that this declaration needs, closed under "mentions"
      const need = new Set([b.idx])
      let grew = true
      while (grew) {
        grew = false
        for (const c of info.slice(0, b.idx)) {
          if (need.has(c.idx) || !c.name) continue
          for (const n of need) {
            if (words(info[n].text).has(c.name) || words(info[n].text).has(c.name.split(".").pop())) {
              need.add(c.idx)
              grew = true
              break
            }
          }
        }
      }
      const keep = new Set([...need, ...preamble.filter((p) => p.idx < b.idx && p.head !== "namespace" && p.head !== "section").map((p) => p.idx)])
      const scope = scopeAt(b.idx)
      const pieces = []
      for (const s of scope) pieces.push(`namespace ${s}`)
      for (const c of info) if (keep.has(c.idx) && c.idx <= b.idx) pieces.push(c.text)
      for (const s of [...scope].reverse()) pieces.push(`end ${s}`)
      const closure = pieces.join("\n\n").trim()
      const id = sha1(canon(statement).replace(/^(?:theorem|lemma)\s+\S+\s*/, ""))
      const prior = this.entries.get(id)
      const entry = {
        id,
        name: b.name || id.slice(0, 8),
        kind: b.head,
        statement: canon(statement),
        closure,
        origin: meta.origin || "verified",
        savedAt: new Date(this.now()).toISOString(),
        attempt: meta.attempt ?? null,
        isTarget: !!meta.isTarget,
        nominated: prior?.nominated || false,
        subsumes: meta.subsumes || [],
        subsumedBy: prior?.subsumedBy || null,
        hits: prior?.hits || 0,
        quality: prior?.quality || null, // the same statement with a shorter proof is the same theorem: keep its rating
      }
      if (prior && prior.closure.length <= closure.length) continue // keep the shorter proof
      if (!prior && this.entries.size >= this.max && !this.makeRoom()) {
        // full, and nothing in it can be put away: this theorem is not kept. Said out loud (the first time, then now and then), never silently.
        this.stats.dropped++
        if (this.stats.dropped === 1 || this.stats.dropped % 20 === 0)
          this.emit({ type: "message-annotation", subtype: "error", thought: `⚠️ The library is full (${this.entries.size} theorems and none can be put away yet), so ${this.stats.dropped} verified theorem(s) were not kept. The next sleep rates and merges the library to make room.` })
        continue
      }
      this.entries.set(id, entry)
      out.push(entry)
      if (meta.silent) continue // the project's own seeds: in this run's library, but not saved to anyone's account
      if (prior) this.stats.updates++
      else this.stats.saves++
      this.emit({ type: "memory", op: prior ? "update" : "save", entry: this.publicEntry(entry) })
    }
    return out
  }

  // Generalised lemmas from the sleep stage. The bridge has already re-verified `script` with Leak IV.
  // strict (what the bridge asks): a member is retired only when the verified script re-proves it from the general lemma (see
  // splitCorollaries), the corollaries themselves are not saved as entries, and a script that retires fewer than two members adds nothing.
  addAbstract(script, subsumes = [], meta = {}) {
    let members = subsumes
    if (meta.strict) {
      const claimed = subsumes.map((id) => this.entries.get(id)).filter((e) => e && !e.nominated && !e.isTarget && e.origin !== "seed")
      const split = splitCorollaries(script, claimed)
      if (split.confirmed.length < MIN_RETIRED) return []
      members = split.confirmed
      script = split.general
    }
    const added = this.addScript(script, { ...meta, origin: "abstracted", subsumes: members, minStatement: 12 })
    this.stats.abstracted += added.length
    if (!added.length) return added
    // A script can hold several lemmas. Each merged entry is pointed at the new lemma that says the most like it, and told about it once.
    const overlap = (a, b) => {
      const x = new Set(tokens(a))
      const y = new Set(tokens(b))
      let n = 0
      for (const t of x) if (y.has(t)) n++
      return n / (x.size + y.size - n || 1)
    }
    for (const id of new Set(members)) {
      const old = this.entries.get(id)
      if (!old || added.some((e) => e.id === old.id)) continue
      const best = added.reduce((b, e) => (overlap(old.statement, e.statement) > overlap(old.statement, b.statement) ? e : b), added[0])
      if (old.subsumedBy === best.id) continue
      old.subsumedBy = best.id
      this.emit({ type: "memory", op: "update", entry: this.publicEntry(old) })
    }
    return added
  }

  nominate(idOrName, on = true) {
    const e = this.find(idOrName)
    if (!e) return { ok: false, why: `no saved theorem matches "${idOrName}"` }
    if (e.origin === "seed") return { ok: false, why: `${e.name} is one of this target's own seed lemmas, not something this run proved, so it cannot be nominated` }
    if (on && !e.nominated && this.nominated().length >= MAX_NOMINATED)
      return { ok: false, why: `${MAX_NOMINATED} theorems are already nominated (the most Jinshi takes); un-nominate one first` }
    e.nominated = !!on
    this.emit({ type: "memory", op: "nominate", id: e.id, nominated: e.nominated })
    return { ok: true, entry: e }
  }

  nominated() {
    return [...this.entries.values()].filter((e) => e.nominated)
  }

  find(idOrName) {
    const q = String(idOrName || "").trim()
    if (!q) return null
    for (const e of this.entries.values()) if (e.id === q || e.id.startsWith(q) || e.name === q) return e
    return null
  }

  list({ limit = 30, nominatedOnly = false, all: showAll = false } = {}) {
    const all = [...this.entries.values()].filter((e) => (showAll || this.visible(e)) && (!nominatedOnly || e.nominated))
    return all.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))).slice(0, limit)
  }

  recent(n) {
    return this.list({ limit: n })
  }

  // BM25 over name + statement tokens, with a bonus for symbols the query shares and a small one for entries that were
  // useful before. Subsumed entries rank below the abstract lemma that replaced them.
  recall(query, { limit = 5, markHit = true, all = false } = {}) {
    const qt = [...new Set(tokens(query).filter((t) => !STOP.has(t)))]
    const docs = [...this.entries.values()].filter((e) => all || this.visible(e)).map((e) => ({ e, t: tokens(`${e.name} ${e.statement}`).filter((x) => !STOP.has(x)) }))
    const N = docs.length || 1
    const avg = docs.reduce((a, d) => a + d.t.length, 0) / N || 1
    const df = new Map()
    for (const d of docs) for (const w of new Set(d.t)) df.set(w, (df.get(w) || 0) + 1)
    const scored = []
    for (const d of docs) {
      const tf = new Map()
      for (const w of d.t) tf.set(w, (tf.get(w) || 0) + 1)
      let s = 0
      for (const w of qt) {
        const f = tf.get(w)
        if (!f) continue
        const idf = Math.log(1 + (N - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5))
        s += (idf * f * 2.2) / (f + 1.2 * (1 - 0.75 + (0.75 * d.t.length) / avg))
      }
      if (s <= 0) continue
      if (d.e.subsumedBy) s *= 0.5
      if (isWounded(d.e)) s *= 0.5
      s *= 1 + Math.min(0.3, 0.05 * (d.e.hits || 0))
      // what the sleep stage found worth more is shown first: 0.85 at one star up to 1.15 at five, and a general lemma a little above its peers
      if (d.e.quality) s *= 0.85 + 0.075 * (Number(d.e.quality.s) - 1)
      if (d.e.origin === "abstracted") s *= 1.15
      scored.push({ e: d.e, s })
    }
    scored.sort((a, b) => b.s - a.s || String(b.e.savedAt || "").localeCompare(String(a.e.savedAt || "")))
    const top = scored.slice(0, limit).map((x) => x.e)
    this.stats.recalls++
    if (top.length) this.stats.recallHits++
    if (markHit) for (const e of top) e.hits = (e.hits || 0) + 1
    return top
  }
}

// ---- text for the driver --------------------------------------------------------------------------------------
export function renderEntry(e, { withProof = true } = {}) {
  const head = `-- [${e.id.slice(0, 8)}] ${e.name}${e.origin === "abstracted" ? " (abstract lemma)" : ""}${e.nominated ? " (nominated)" : ""}${e.isTarget ? " (this settles the target)" : ""}`
  return withProof ? `${head}\n${e.closure}` : `${head}\n${e.statement}`
}

// Results that share a helper (an abstract lemma and its corollaries all carry the same master identity) show it once: a block
// whose helper an earlier block already printed says what it needs instead of repeating it. 
function dedupeShared(entries) {
  const seen = new Set()
  return entries.map((e) => {
    const blocks = splitDeclarations(e.closure)
    const out = blocks.map((b, i) => {
      const key = canon(b)
      const head = blockHead(b)
      const isDecl = head === "theorem" || head === "lemma" || head === "def"
      if (isDecl && seen.has(key)) return i < blocks.length - 1 ? `-- needs \`${blockName(b)}\` (shown above)` : `-- this is \`${blockName(b)}\`, shown above`
      seen.add(key)
      return b
    })
    return { ...e, closure: out.join("\n\n") }
  })
}

export function renderRecall(entries, memory) {
  if (!entries.length) return `No saved theorem matches that query. Memory holds ${memory?.size ?? 0} verified theorem(s); memory_list shows the most recent.`
  return (
    `${entries.length} verified theorem(s) from this target's memory, best match first. Each block is compile-ready (it includes the definitions and lemmas it needs) and was accepted by Leak IV when saved; paste it into a script and verify_full_script it before you rely on it. Where a block says "needs X (shown above)", copy X from the block above it.\n\n` +
    dedupeShared(entries).map((e) => renderEntry(e)).join("\n\n")
  )
}

export function renderList(entries, memory) {
  if (!entries.length) return "Memory is empty for this target so far."
  const hidden = memory?.hiddenCount?.() ?? 0
  const merged = memory?.mergedCount?.() ?? hidden
  const wounded = memory?.woundedCount?.() ?? 0
  const star = (e) => (e.quality ? ` ${"★".repeat(e.quality.s)}` : "")
  return (
    `${memory ? memory.size - hidden : entries.length} verified theorem(s) saved (showing ${entries.length}, newest first):\n` +
    entries.map((e) => `- [${e.id.slice(0, 8)}] ${e.name}${e.origin === "abstracted" ? " (abstract lemma)" : ""}${e.nominated ? " *nominated*" : ""}${star(e)}: ${e.statement.slice(0, 220)}`).join("\n") +
    (merged ? `\n${merged} more merged into the general lemmas above are hidden.` : "") +
    (wounded ? `\n${wounded} more rated one or two stars (instances, one-line tactics, restatements of the library) are hidden too; memory_list with all=true shows them.` : "")
  )
}

// Flint: what the harness puts in front of the agent each time its session starts or is resumed.
export function episodicBlock(memory, n, { maxChars = 7000 } = {}) {
  const items = memory.recent(n)
  if (!items.length) return ""
  let used = 0
  const parts = []
  for (const e of items) {
    const t = renderEntry(e)
    if (used + t.length > maxChars) break
    used += t.length
    parts.push(t)
  }
  memory.stats.injected += parts.length
  return `\nVERIFIED THEOREMS FROM EARLIER ATTEMPTS ON THIS TARGET (newest first; each was accepted by Leak IV, each block is compile-ready). They are established: build on them instead of re-deriving them, and verify any block you rely on in your own script.\n${parts.join("\n\n")}\n`
}

// Paragon: memory as part of search. Appended to what Leak I returned for the same query.
export function augmentSearchText(memory, query, resultText, { limit = 3 } = {}) {
  if (!memory.size) return resultText
  const hits = memory.recall(query, { limit })
  if (!hits.length) return resultText
  memory.stats.injected += hits.length
  return `${resultText}\n\n— MEMORY: verified theorems saved earlier on this target that match your query (compile-ready, not library names; paste into a script) —\n\n${hits.map((e) => renderEntry(e)).join("\n\n")}`
}

// The tools the driver sees, served by the bridge through its governor.
export function makeHandlers(memory, variantKey) {
  const cfg = VARIANTS[variantKey]
  const all = {
    memory_recall: {
      description:
        "Search the verified theorems saved on THIS target (by you earlier in this run, in earlier attempts, and in earlier runs). Give a goal, a statement, or a few key words (names, symbols, numbers). Returns compile-ready verified blocks, best match first; theorems the sleep stage rated higher and general lemmas come first. Use it when you think you may have proved something related before, and before you spend an hour re-deriving a lemma.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "a Lean statement, a goal, or key words" },
          limit: { type: "number", description: "how many (default 5, at most 8)" },
          all: { type: "boolean", description: "also search the theorems put away as routine (rated one or two stars); default false" },
        },
        required: ["query"],
      },
      run: (args) => renderRecall(memory.recall(String(args?.query || ""), { limit: Math.min(8, Math.max(1, Number(args?.limit) || 5)), all: !!args?.all }), memory),
    },
    memory_list: {
      description: "List the verified theorems saved on this target, newest first (names and statements only; a star count where the sleep stage has rated it). Theorems rated one or two stars are hidden unless all is true.",
      inputSchema: { type: "object", properties: { limit: { type: "number" }, nominatedOnly: { type: "boolean" }, all: { type: "boolean" } } },
      run: (args) => renderList(memory.list({ limit: Math.min(60, Math.max(1, Number(args?.limit) || 30)), nominatedOnly: !!args?.nominatedOnly, all: !!args?.all }), memory),
    },
    memory_nominate: {
      description: `Nominate saved theorems for review (at most ${MAX_NOMINATED}; three to ten are needed before anything can be submitted to Tengoku). Nominate the ones with real reuse value: general, minimal hypotheses, well named, not already in Mathlib. Pass names or ids; on=false removes a nomination.`,
      inputSchema: {
        type: "object",
        properties: { names: { type: "array", items: { type: "string" } }, on: { type: "boolean" } },
        required: ["names"],
      },
      run: (args) => {
        const lines = []
        for (const n of Array.isArray(args?.names) ? args.names : []) {
          const r = memory.nominate(n, args?.on !== false)
          lines.push(r.ok ? `${r.entry.name}: ${r.entry.nominated ? "nominated" : "no longer nominated"}` : `${n}: ${r.why}`)
        }
        return `${lines.join("\n")}\n${memory.nominated().length} nominated now (${MIN_NOMINATED} to ${MAX_NOMINATED} are needed to submit).`
      },
    },
  }
  const m = new Map()
  for (const t of cfg?.tools || []) if (all[t]) m.set(t, all[t])
  return m
}

// The sentences added to Control II's prompt for a variant. The baseline forbids top-level helper lemmas; a memory
// variant allows them, because a lemma that verifies on its own is the unit of progress that memory keeps.
export function memoryRules(variantKey, { envHint = "", pantograph, lab = [] } = {}) {
  const cfg = VARIANTS[variantKey]
  const withLeakII = pantograph === undefined ? !!cfg.pantograph : !!pantograph // the bridge says false when no Leak II server is connected
  const tools = cfg.tools.length
  const lines = [
    "- You MAY prove helper theorems/lemmas as separate top-level declarations and verify them with verify_full_script (a helper must compile with no sorry). Every verified, non-trivial theorem is saved automatically to this target's memory, for you and for later attempts: a verified lemma is progress even if the target is still open. The target itself stays exactly as given.",
  ]
  lines.push("- Verify early and often. Python or other numeric probing is fine for finding a candidate, but a number or a pattern is only a fact once Leak IV has checked it (`decide +kernel`, `rfl`, `norm_num`), and a plan is not progress. Within your first few minutes submit something to verify_full_script, even a small lemma or a concrete instance; a submission that fails teaches more than another stretch of thinking.")
  lines.push("- Look up what the library already has (loogle_search for a type pattern, moogle_search for a concept) before you prove a helper that may exist; use what you find in a real script.")
  if (envHint) lines.push(envHint)
  if (lab.length) lines.push(`- You have a laboratory (${lab.map((x) => x.label || x).join(", ")}). Treat what it prints as observation: a pattern is a conjecture until Lean proves it, and you say how far you looked. Prefer it to your own shell loops for anything that takes more than a few seconds.`)
  if (tools) lines.push("- Before you re-derive something, call memory_recall: you may already have proved it. Save effort for what is genuinely new.")
  if (cfg.augmentSearch) lines.push("- Your library searches also return matching theorems from this memory under a MEMORY heading; they are compile-ready.")
  if (tools) lines.push(`- When a saved theorem is general, minimally assumed and well named, nominate it with memory_nominate (at most ${MAX_NOMINATED}). Nominated theorems are the ones that can later be submitted to the Tengoku library, so nominate only what you would be proud to have others reuse.`)
  if (withLeakII) lines.push("- Leak II (init_proof, apply_tactic) is yours as well: when an error is opaque or a subgoal is fiddly, init_proof the goal and apply_tactic ONE tactic at a time to read the real goal state, then fold the tactics that worked into a full script and verify it. Never put sorry in an apply_tactic. Pantograph never certifies anything; only verify_full_script does. On a hard problem you believe is true, once three to five one-shot attempts have failed, strongly consider this tool before another one-shot.")
  if (cfg.sleep) lines.push("- From time to time the system consolidates the memory in the background and adds more general lemmas; you will see them in memory_recall results marked (abstract lemma).")
  return lines.join("\n")
}

// ---- the sleep stage (Lucid) ----------------------------------------------------------------------------------
// The dream has three jobs, in this order of importance: rate what has no rating (public/leak-quality.mjs), put away what rates one or two
// stars (isWounded: hidden from the agent, first to go when the library needs room), and merge groups of related theorems into one general
// lemma that re-proves each of them (`clusters`, `confirmedMembers`). It is as long as the library is big: eighteen minutes for a small one,
// an hour from a thousand theorems, because a thousand theorems cannot be read and judged in eighteen minutes.
export const DREAM = {
  everyMs: 60 * 60_000, // an hour of work between dreams (counted from the end of the last one)
  minMs: 18 * 60_000, // a small library: ten minutes of merging and eight of rating, as it always was
  maxMs: 60 * 60_000, // a library of fullAt theorems or more
  fullAt: 1000,
  rateShare: 8 / 18, // the part of a dream given to rating
  ratePerMin: 6, // theorems rated per minute of rating time, at most
}

// How long this dream may last and how it is divided. `first`: the dream a run opens with is no longer than a small library's, because the
// agent has not begun and is waiting.
export function dreamBudget(size, { first = false } = {}) {
  const n = Math.max(0, Number(size) || 0)
  let totalMs = Math.round(Math.min(DREAM.maxMs, Math.max(DREAM.minMs, (DREAM.maxMs * n) / DREAM.fullAt)))
  if (first) totalMs = Math.min(totalMs, DREAM.minMs)
  const rateMs = Math.round(totalMs * DREAM.rateShare)
  return { totalMs, rateMs, consolidateMs: totalMs - rateMs, rateMax: Math.max(24, Math.floor((rateMs / 60_000) * DREAM.ratePerMin)) }
}

// theorems saved since the last sleep that a consolidation could work on (what the sleep prompt is about)
export function freshCount(memory, state) {
  return [...memory.entries.values()].filter((e) => !e.subsumedBy && e.origin !== "abstracted" && (e.savedAt || "") > (state.lastSleepIso || "")).length
}

export function sleepDue(memory, state, cfg, now = Date.now()) {
  if (!cfg) return false
  const fresh = [...memory.entries.values()].filter((e) => !e.subsumedBy && e.origin !== "abstracted" && (e.savedAt || "") > (state.lastSleepIso || "")).length
  // a sleep is also due when enough theorems are waiting for a rating (theorems saved by earlier runs, or merged lemmas the last sleep made)
  const waiting = cfg.rate ? memory.unrated().length : 0
  return (fresh >= cfg.minNew || waiting >= cfg.minNew) && now - (state.lastSleepAt || 0) >= cfg.everyMs
}

// Groups of related theorems for the dream to merge: the visible, non-seed entries, grouped by how much of their names and statements they
// share, where a word that is in everything (ℕ, hn, ≤) counts for little and one that is in a few counts for a lot (tf-idf, cosine). Biggest
// and tightest groups first. `skip` holds the keys of groups already studied in this run (the same members would give the same answer).
const clusterTokens = (e) => new Set(tokens(`${e.name} ${e.statement}`).filter((t) => !STOP.has(t) && !t.startsWith("#") && !/^\d+$/.test(t)))
export function dreamClusters(memory, { maxMembers = 12, maxChars = 16000, minSimilarity = 0.4, skip = new Set() } = {}) {
  const pool = [...memory.entries.values()]
    .filter((e) => !e.subsumedBy && !isWounded(e) && e.origin !== "seed" && !e.isTarget && !e.nominated)
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")) || a.id.localeCompare(b.id))
  const toks = pool.map((e) => [...clusterTokens(e)])
  const df = new Map()
  for (const ts of toks) for (const t of ts) df.set(t, (df.get(t) || 0) + 1)
  const weight = (t) => Math.log(1 + pool.length / df.get(t)) ** 2 // squared: what a shared word adds to a dot product
  const norm = toks.map((ts) => Math.sqrt(ts.reduce((a, t) => a + weight(t), 0)) || 1)
  const posting = new Map()
  toks.forEach((ts, i) => ts.forEach((t) => (posting.get(t) || posting.set(t, []).get(t)).push(i)))
  const left = new Set(pool.keys())
  const out = []
  for (let i = 0; i < pool.length; i++) {
    if (!left.has(i)) continue
    const dot = new Map()
    for (const t of toks[i]) {
      const w = weight(t)
      for (const j of posting.get(t)) if (j !== i && left.has(j)) dot.set(j, (dot.get(j) || 0) + w)
    }
    const near = [...dot.entries()]
      .map(([j, d]) => ({ j, sim: d / (norm[i] * norm[j]) }))
      .filter((x) => x.sim >= minSimilarity)
      .sort((a, b) => b.sim - a.sim || pool[a.j].id.localeCompare(pool[b.j].id))
    const members = []
    let used = 0
    for (const m of [{ j: i, sim: 1 }, ...near.slice(0, maxMembers - 1)]) {
      const e = pool[m.j]
      const c = Math.min(e.closure.length, 1400) + 40
      if (members.length >= 2 && used + c > maxChars) break
      used += c
      members.push({ i: m.j, e, sim: m.sim })
    }
    left.delete(i)
    if (members.length < 2) continue
    for (const m of members) left.delete(m.i)
    const ids = members.map((m) => m.e.id)
    const key = sha1([...ids].sort().join(","))
    if (skip.has(key)) continue
    const tail = members.slice(1)
    out.push({ key, members: members.map((m) => m.e), score: members.length * (tail.reduce((a, m) => a + m.sim, 0) / tail.length) })
  }
  return out.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
}

// The prompt for one group. `members` is a list of entries, or a whole Memory (the first group, or the newest entries when nothing groups).
export function sleepPrompt(from, target, { maxEntries = 40, maxChars = 14000 } = {}) {
  const members = Array.isArray(from)
    ? from
    : (dreamClusters(from, { maxChars })[0]?.members ?? [...from.entries.values()].filter((e) => !e.subsumedBy).slice(0, maxEntries))
  let used = 0
  const shown = []
  for (const e of members) {
    const t = `### [${e.id.slice(0, 8)}] ${e.name}\n${e.closure.slice(0, 1400)}`
    if (used + t.length > maxChars) break
    used += t.length
    shown.push(t)
  }
  return `You are the consolidation ("sleep") stage of a long theorem-proving run. You are NOT proving the target. The theorems below were verified by the run (all correct Lean 4 + Mathlib) and look related. Your job is to make the library smaller and better: one general lemma in place of several.

TARGET (for context only):
${target}

THESE THEOREMS BELONG TOGETHER (${shown.length}):
${shown.join("\n\n")}

DO THIS:
1. Say in one sentence what idea they share. If they are really unrelated, or none of them is worth generalising, return [].
2. Write ONE general lemma that holds that idea at its natural generality: parameters where they have constants, only the hypotheses its proof really uses, a name that says what it says, and a one-line docstring saying why anyone would want it. Prefer a short statement.
3. Under it, re-prove each member you want to retire as a short corollary: the same statement as the member (same binders and conclusion; the name may change), proved by applying your general lemma. A member whose corollary does not compile stays in the library, and that is fine. A general lemma that does not re-prove at least two members is not worth adding.
4. Check the whole script (general lemma and corollaries) with verify_full_script, your only tool, before you return it. The system verifies it again, and retires only the members whose corollaries it finds in the verified script.
5. Do not invent facts the library does not support, and ignore trivial restatements and anything Mathlib already has.

Finish with ONE fenced json block and nothing after it:
\`\`\`json
[{"name": "general_lemma_name", "script": "the complete compile-ready Lean text: the general lemma, then one corollary per member", "subsumes": ["8-char ids of the members the corollaries re-prove"], "why": "one sentence: the idea they share"}]
\`\`\`
If nothing is worth consolidating, return [].`
}

export function parseSleep(text) {
  const m = String(text || "").match(/```json\s*([\s\S]*?)```/i)
  if (!m) return []
  let arr
  try {
    arr = JSON.parse(m[1])
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter((x) => x && typeof x.script === "string" && x.script.trim() && !hasSorry(x.script))
    .map((x) => ({ name: String(x.name || ""), script: x.script, subsumes: Array.isArray(x.subsumes) ? x.subsumes.map(String) : [], why: String(x.why || "") }))
    .slice(0, 12)
}

export const resolveSubsumes = (memory, shortIds) =>
  (shortIds || []).map((s) => memory.find(s)?.id).filter(Boolean)

// A statement without its name or its spacing: what two declarations must share to say the same thing.
const looseStatement = (stmt) => canon(stripComments(stmt)).replace(/^(?:theorem|lemma)\s+\S+\s*/, "").replace(/\s+/g, "")

// Which of the claimed members does this verified script really re-prove? A member is confirmed when the script holds a theorem with the
// member's statement whose proof leans on an earlier declaration of the script (the general lemma): a corollary, not a copy. Returns the
// confirmed member ids. The script has been verified before this is asked.
export const MIN_RETIRED = 2 // a general lemma has to replace at least this many entries, or the library only grows
export function splitCorollaries(script, members) {
  const blocks = splitDeclarations(script)
  const theorems = blocks.map((b, i) => ({ b, i })).filter(({ b }) => ["theorem", "lemma"].includes(blockHead(b)) && !hasSorry(b))
  const confirmed = []
  const corollary = new Set()
  for (const mem of members || []) {
    const want = looseStatement(mem.statement)
    const hit = theorems.find(({ b, i }) => !corollary.has(i) && looseStatement(statementOf(b)) === want && theorems.some((c) => c.i < i && blockName(c.b) && words(proofOf(b)).has(blockName(c.b))))
    if (hit) {
      confirmed.push(mem.id)
      corollary.add(hit.i)
    }
  }
  return { confirmed, general: blocks.filter((_, i) => !corollary.has(i)).join("\n\n") }
}
export const confirmedMembers = (script, members) => splitCorollaries(script, members).confirmed


// What the agent's shell can and cannot do, found by the bridge once per run (probeEnvironment in the bridge) and stated plainly:
// an overnight run lost about fifteen tool calls to `timeout: command not found` and a missing sympy, every attempt again.
// Only what is missing is said; a machine that has everything gets no line.
export function environmentHint(env = {}) {
  const bits = []
  if (env.timeout === false) bits.push("`timeout` is not installed here, so `timeout 100 cmd` fails; bound a job with `perl -e 'alarm 100; exec @ARGV' cmd`, or run it in the background")
  if (env.python3 === false) bits.push("python3 is not installed")
  else {
    const missing = Object.entries(env.modules || {}).filter(([, ok]) => ok === false).map(([m]) => m)
    if (missing.length) bits.push(`python3 has no ${missing.join(" or ")} (write the factorisation or sieve yourself, with the standard library)`)
  }
  if (env.gcc === false) bits.push("there is no C compiler")
  const base = "Nothing you run here may take more than 5 minutes (no brute force). A shell command that runs longer than two minutes is moved to the background by the tool, so if you do start a bounded job, use `nohup … > out.txt &` and read `out.txt` later instead of waiting."
  return `- Your shell (${env.platform || "unknown"}): ${bits.length ? `${bits.join("; ")}. ` : ""}${base}`
}

// What the harness says when the agent stops and the run goes on: the same conversation, resumed, so everything it learned is still
// there (the CLI compacts it when it grows). Says what changed outside the conversation: lemmas the sleep stage added.
// `episodic` is Flint's replay of the theorems proved so far, which a compacted conversation may no longer hold verbatim.
// One time in five, a new attempt also gets a quiet reminder to look at what is still running. The session persists and so do its
// background jobs, and a search nobody needs any more is a cost the agent can end itself. Said lightly, so it is not a rule to obey.
export const HOUSEKEEPING_CHANCE = 0.2
export const HOUSEKEEPING_LINE = "As you pick this back up, a quick look at what is still running from earlier (`ps aux | grep -v grep | head -20`) takes seconds; anything that no longer serves your next claim is better ended than left to run."
export const continuePrompt = (o) => order.continue(o)
export const nudgePrompt = (o) => order.nudge(o)
