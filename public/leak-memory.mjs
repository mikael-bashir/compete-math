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
export const MAX_ENTRIES = 600

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
- Leak I (loogle_search, moogle_search) searches all of Tengoku. loogle takes a type pattern or a list of constants and returns every declaration of that shape; moogle takes a concept in words and returns the declarations about it. Before you prove anything, ask Leak I whether it already exists and what its neighbours say. Whatever it returns is already proved: it is free, and you build on it instead of re-proving it.
- Leak IV (verify_full_script) is the compiler and the judge. It compiles your whole script against the entire Tengoku tree and returns either the exact diagnostics or "100% verified". It is fast and exact, so use it constantly: on a whole proof, on one lemma, on an \`example\` that tries \`exact?\`, \`apply?\`, \`simp?\`, \`decide\` or \`omega\`, on a \`#check\` or \`#print\`. Ask Lean itself, rather than reasoning in the dark. Every theorem it verifies is a permanent brick.${pantograph ? "\n- Leak II (init_proof, apply_tactic, get_current_proof_state, snapshot_state, branch_tactics) is a live proof state. Open a goal, apply one tactic at a time and read the real goals after each, snapshot a state and try several tactics on branches from it, and clean up when done. It shows you what a stuck goal actually looks like instead of leaving you to guess." : ""}${memoryTools ? "\n- The memory (memory_recall, memory_list, memory_nominate) is your own library on this target: every theorem Leak IV has verified for you, across sessions and runs, compile-ready. Recall before you re-derive, build on it, generalise it." : ""}
Used together: search to find what exists, verify to add what does not, ${pantograph ? "step to understand what is stuck, " : ""}${memoryTools ? "remember to build on it. " : ""}A body of mathematics is built by this loop, brick by brick, and not by waiting on a computation.`

const NO_BRUTE_FORCE = `OUR INSTRUMENT IS PROOF, NOT SEARCH. Do not run brute-force checks: no scanning a range of integers for a witness or a counterexample, no sieving or factoring over a growing bound, no enumerating cases for larger and larger parameters, no "let me run it a little longer". No computation you start may run for more than 5 minutes, and if you expect one to, do not start it: a search like that is someone else's job, it has very likely been done with nothing to show for it, and it leaves nothing behind that a proof can use. A quick experiment (seconds, a small range) is fine when it answers a specific question you wrote down first, and its result is never the deliverable: turn it into a lemma and verify it. If you catch yourself waiting on a job, polling it with sleep, or widening a bound, that is the signal to go back to the compiler. If a command is ever moved to the background, the tool prints the path of its output file: read exactly that path, copied character for character (it is not your working directory with the slashes changed, so never rebuild it by hand), and never search the disk for it.`

const HONESTY = `HONESTY. No sorry, no new axioms, and no change to the statement as given. Nothing is proved until verify_full_script says so, and nothing you write needs to pretend otherwise: a lemma is a lemma, a conjecture is a conjecture, and both are welcome here.`

// Questions a mathematician asks when the direct road is not visible. One is offered at each resume, in turn, so that stretches of the
// same session look in different directions.
export const CURIOSITY_PROMPTS = [
  "What is the simplest case you do not yet understand, and what exactly do you not understand about it?",
  "What does the proof for one parameter use that the proof for the next parameter cannot? Name the step.",
  "What would a counterexample have to look like? Write down its properties as a lemma and see which of them the compiler refutes.",
  "What is the strongest statement you can prove today, with the library as it is? Prove that, then ask what stops it from being stronger.",
  "Which objects are really in play here (valuations, digits, carries, residues, densities, growth rates)? What is their algebra, and is it in the library?",
  "Is there a quantity that is monotone, or bounded, or invariant along the structure of the problem? Prove that it is.",
  "Restate the problem in another language: as a statement about digit expansions, about a product, about a sum, about a set and its density. Which restatement is a theorem you can verify?",
  "What is a natural generalisation that is actually easier, because it has more structure to use? State it and try it.",
  "Take one lemma from the library and weaken its hypotheses until the proof breaks. The last hypothesis to go is the real content.",
  "What does the problem look like for the smallest two parameters, side by side? Write the two proofs so that they share every step they can.",
  "What is the obstruction, precisely? Which prime, which size, which carry? State the obstruction as a lemma about those objects.",
  "Which classical technique does this resemble (Kummer, Legendre, Lucas, pigeonhole, extremal choice, an averaging argument)? Search the library for its formal shape and try to fit it.",
]
export const curiosityPrompt = (i) => CURIOSITY_PROMPTS[((Number(i) || 0) % CURIOSITY_PROMPTS.length + CURIOSITY_PROMPTS.length) % CURIOSITY_PROMPTS.length]

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

${NO_BRUTE_FORCE}

${TOOL_GUIDE({ pantograph, memoryTools })}

PACE. Verify early and often: within your first few minutes, submit something to verify_full_script, even a small lemma or an \`example\` that asks \`exact?\`. A submission that fails teaches more than another stretch of thinking. After a few shell commands with nothing verified, go back to the compiler. And before you prove a lemma, ask Leak I whether the tree already has it or its neighbours (loogle for the shape, moogle for the idea): a mathematician reads before writing, and what the tree already knows is free.

YOUR LAB NOTES. Work in stretches. When a stretch ends (you will pause naturally; that is fine and expected), close your message with two lines in exactly this form:
NOTE: <one or two sentences: what you now know or believe that you did not before>
NEXT: <the one question or claim you will take up next>
The run hands your own notes back to you when you resume, so the thread is never lost. There is no need to open a note by saying that the statement is not yet proved or refuted: we know, and nobody is asking; say what you learned and what you will do. A pause with a NEXT line is a mathematician closing the notebook for the evening. A pause that announces the problem cannot be done is not something we do here, because it is not something we know.

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
  continue({ attempt = 2, elapsedMs = 0, libraryCount = 0, abstracted = [], toolIds = [], episodic = "", pantograph = false, note = null, guide = "", rng = Math.random } = {}) {
    const min = Math.max(1, Math.round((elapsedMs || 0) / 60000))
    const lines = [`Welcome back. The last stretch ran ${min} minute${min === 1 ? "" : "s"}; the library holds ${libraryCount} verified theorem(s). This is the same session (attempt ${attempt}), so everything you worked out is still yours.`]
    if (note?.note || note?.next) lines.push(`Your last lab note:\nNOTE: ${note.note || "(none)"}\nNEXT: ${note.next || "(none)"}\n\nTake up NEXT.`)
    else lines.push("Your last message closed without a NEXT line. Decide the next question now, say it in one line, and take it up.")
    if (abstracted.length)
      lines.push(`While you were away the library was consolidated: ${abstracted.length} more general lemma(s) were added (${abstracted.slice(0, 12).join(", ")}); memory_recall shows them marked (abstract lemma).`)
    if (toolIds.length) lines.push(`If a tool you used before is not callable now, load it again with ONE ToolSearch call: select:${toolIds.join(",")}`)
    if (rng() < HOUSEKEEPING_CHANCE) lines.push(HOUSEKEEPING_LINE)
    lines.push(`A question for this stretch, in case it is useful: ${curiosityPrompt(attempt)}${pantograph ? " (Leak II can show you the live goal if a step is unclear.)" : ""}`)
    if (guide) lines.push(guide)
    lines.push("Verify something within your first few steps, and close the stretch, as always, with NOTE: and NEXT:.")
    return `${lines.join("\n\n")}\n${episodic || ""}`
  },
  nudge({ elapsedMs, libraryCount = 0, nudge = 1, of = 2, pantograph = false, note = null, toolIds = [], guide = "" } = {}) {
    const min = Math.max(1, Math.round((elapsedMs || 0) / 60000))
    const reload = toolIds.length ? ` (If a tool is not callable now, load it again with ONE ToolSearch call: select:${toolIds.join(",")}.)` : ""
    return `That was a short stretch (${min} minute${min === 1 ? "" : "s"}, nothing new verified), and the library holds ${libraryCount} theorem(s).${note?.next ? ` Your NEXT was: ${note.next}` : ""} Before closing the notebook again, answer one question with the compiler: ${curiosityPrompt(nudge * 5 + libraryCount)} State it in Lean, verify_full_script it${pantograph ? " (or step it through Leak II first if the goal is unclear)" : ""}, and then write NOTE: and NEXT:.${reload} A verified lemma, or a verified counterexample, is a good place to pause; an announcement that the problem cannot be done is not, because it is not something we know.${guide ? `\n\n${guide}` : ""}`
  },
}

export const VOICES = { order, curious }
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
  constructor({ targetId = "", variant = "", emit = () => {}, now = () => Date.now() } = {}) {
    this.targetId = targetId
    this.variant = variant
    this.emit = emit
    this.now = now
    this.entries = new Map() // id -> entry
    this.stats = { saves: 0, updates: 0, recalls: 0, recallHits: 0, injected: 0, sleeps: 0, abstracted: 0, nudges: 0 }
  }

  get size() {
    return this.entries.size
  }

  // What the driver is shown. An entry that a more general lemma replaced is hidden, unless the account nominated it.
  visible(e) {
    return !e.subsumedBy || !!e.nominated
  }

  hiddenCount() {
    return [...this.entries.values()].filter((e) => !this.visible(e)).length
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
      if (!prior && this.entries.size >= MAX_ENTRIES) continue
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
  addAbstract(script, subsumes = [], meta = {}) {
    const added = this.addScript(script, { ...meta, origin: "abstracted", subsumes, minStatement: 12 })
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
    for (const id of new Set(subsumes)) {
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

  list({ limit = 30, nominatedOnly = false } = {}) {
    const all = [...this.entries.values()].filter((e) => this.visible(e) && (!nominatedOnly || e.nominated))
    return all.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))).slice(0, limit)
  }

  recent(n) {
    return this.list({ limit: n })
  }

  // BM25 over name + statement tokens, with a bonus for symbols the query shares and a small one for entries that were
  // useful before. Subsumed entries rank below the abstract lemma that replaced them.
  recall(query, { limit = 5, markHit = true } = {}) {
    const qt = [...new Set(tokens(query).filter((t) => !STOP.has(t)))]
    const docs = [...this.entries.values()].filter((e) => this.visible(e)).map((e) => ({ e, t: tokens(`${e.name} ${e.statement}`).filter((x) => !STOP.has(x)) }))
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
      s *= 1 + Math.min(0.3, 0.05 * (d.e.hits || 0))
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
  return (
    `${memory ? memory.size - hidden : entries.length} verified theorem(s) saved (showing ${entries.length}, newest first):\n` +
    entries.map((e) => `- [${e.id.slice(0, 8)}] ${e.name}${e.origin === "abstracted" ? " (abstract lemma)" : ""}${e.nominated ? " *nominated*" : ""}: ${e.statement.slice(0, 220)}`).join("\n") +
    (hidden ? `\n${hidden} more merged into the general lemmas above are hidden.` : "")
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
        "Search the verified theorems saved on THIS target (by you earlier in this run, in earlier attempts, and in earlier runs). Give a goal, a statement, or a few key words (names, symbols, numbers). Returns compile-ready verified blocks, best match first. Use it when you think you may have proved something related before, and before you spend an hour re-deriving a lemma.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "a Lean statement, a goal, or key words" }, limit: { type: "number", description: "how many (default 5, at most 8)" } },
        required: ["query"],
      },
      run: (args) => renderRecall(memory.recall(String(args?.query || ""), { limit: Math.min(8, Math.max(1, Number(args?.limit) || 5)) }), memory),
    },
    memory_list: {
      description: "List the verified theorems saved on this target, newest first (names and statements only).",
      inputSchema: { type: "object", properties: { limit: { type: "number" }, nominatedOnly: { type: "boolean" } } },
      run: (args) => renderList(memory.list({ limit: Math.min(60, Math.max(1, Number(args?.limit) || 30)), nominatedOnly: !!args?.nominatedOnly }), memory),
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
export function memoryRules(variantKey, { envHint = "", pantograph } = {}) {
  const cfg = VARIANTS[variantKey]
  const withLeakII = pantograph === undefined ? !!cfg.pantograph : !!pantograph // the bridge says false when no Leak II server is connected
  const tools = cfg.tools.length
  const lines = [
    "- You MAY prove helper theorems/lemmas as separate top-level declarations and verify them with verify_full_script (a helper must compile with no sorry). Every verified, non-trivial theorem is saved automatically to this target's memory, for you and for later attempts: a verified lemma is progress even if the target is still open. The target itself stays exactly as given.",
  ]
  lines.push("- Verify early and often. Python or other numeric probing is fine for finding a candidate, but a number or a pattern is only a fact once Leak IV has checked it (`decide +kernel`, `rfl`, `norm_num`), and a plan is not progress. Within your first few minutes submit something to verify_full_script, even a small lemma or a concrete instance; a submission that fails teaches more than another stretch of thinking.")
  lines.push("- Look up what the library already has (loogle_search for a type pattern, moogle_search for a concept) before you prove a helper that may exist; use what you find in a real script.")
  if (envHint) lines.push(envHint)
  if (tools) lines.push("- Before you re-derive something, call memory_recall: you may already have proved it. Save effort for what is genuinely new.")
  if (cfg.augmentSearch) lines.push("- Your library searches also return matching theorems from this memory under a MEMORY heading; they are compile-ready.")
  if (tools) lines.push(`- When a saved theorem is general, minimally assumed and well named, nominate it with memory_nominate (at most ${MAX_NOMINATED}). Nominated theorems are the ones that can later be submitted to the Tengoku library, so nominate only what you would be proud to have others reuse.`)
  if (withLeakII) lines.push("- Leak II (init_proof, apply_tactic) is yours as well: when an error is opaque or a subgoal is fiddly, init_proof the goal and apply_tactic ONE tactic at a time to read the real goal state, then fold the tactics that worked into a full script and verify it. Never put sorry in an apply_tactic. Pantograph never certifies anything; only verify_full_script does.")
  if (cfg.sleep) lines.push("- From time to time the system consolidates the memory in the background and adds more general lemmas; you will see them in memory_recall results marked (abstract lemma).")
  return lines.join("\n")
}

// ---- the sleep stage (Lucid) ----------------------------------------------------------------------------------
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

export function sleepPrompt(memory, target, { maxEntries = 40, maxChars = 14000 } = {}) {
  const items = [...memory.entries.values()].filter((e) => !e.subsumedBy).slice(0, maxEntries)
  let used = 0
  const shown = []
  for (const e of items) {
    const t = `### [${e.id.slice(0, 8)}] ${e.name}\n${e.closure.slice(0, 1400)}`
    if (used + t.length > maxChars) break
    used += t.length
    shown.push(t)
  }
  return `You are the consolidation ("sleep") stage of a long theorem-proving run. You are NOT proving the target. The run has verified the theorems below; they are all correct Lean 4 + Mathlib. Your job is to make this library more reusable.

TARGET (for context only):
${target}

THE LIBRARY:
${shown.join("\n\n")}

DO THIS:
1. Group the theorems that are variants of one idea (same shape with different constants or hypotheses, a chain of special cases, near-duplicates).
2. For each group worth it, write ONE more general lemma that implies the members (parametrise constants, weaken hypotheses to what the proof really uses, state it at the natural generality), and prove it. Prefer a lemma whose statement is short and whose hypotheses are minimal. Do not invent facts that are not supported by the library.
3. Check every candidate with verify_full_script (your only tool). A candidate that does not compile with no error, no warning and no sorry is discarded. The system re-verifies everything you return.
4. Ignore trivial restatements and anything already in Mathlib.

Finish with ONE fenced json block and nothing after it:
\`\`\`json
[{"name": "lemma_name", "script": "the complete compile-ready Lean text (the lemma and anything it needs)", "subsumes": ["8-char ids from the library"], "why": "one sentence"}]
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
