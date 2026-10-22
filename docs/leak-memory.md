# Leak targets and memory

Four experimental variants of Control II that keep what they prove, a roadmap of targets to point them at, and the per-account store for what they keep.

## Variants

All four are Control II (one continuous agent, Leak IV plus Leak I search) with a time limit that can run to 48 h and an optional dollar cap. They differ only in what memory is and how it reaches the agent. Control II itself is the no-memory baseline.

| Variant | Memory | How the agent sees it |
|---|---|---|
| Honoured | append-only library of verified theorems | `memory_recall`, `memory_list`, `memory_nominate` tools |
| Flint | episodic: the most recent verified theorems | replayed into each fresh attempt, no tool |
| Paragon | the same library | also folded into the Leak I results the agent already reads, plus the tools |
| Lucid | Honoured | plus an hourly "sleep" pass that merges the library into fewer, more general lemmas |

What is saved: every declaration a run verifies on Leak IV that is not trivial (a closing-tactic proof of a one-line statement is not), with the helper declarations it needs, so each entry compiles on its own. Entries are keyed by the statement (not the name); a shorter proof of the same statement replaces a longer one. `sorry`, `admit` and `native_decide` scripts are never saved.

## Where it lives

- `public/leak-memory.mjs`: the pure memory module (splitting, closure, dedupe, BM25 recall, sleep prompt). Next to the bridge; the setup command downloads it.
- `public/leak-containment.mjs`: how the agent is confined (see `docs/leak-agent-containment.md`). Next to the bridge; the setup command downloads it.
- `public/local-claude-bridge.mjs`: the four strategies (`control-honoured`, `-flint`, `-paragon`, `-lucid`), `proveControlMemory`, the cost cap, the 48 h clamp.
- The bridge keeps nothing between runs. The browser sends the account's entries with the run (`options.memory.entries`, at most about 1.2 MB) and persists the `{type:"memory"}` frames the run emits.
- `src/app/api/leak/memory`, `src/app/lib/data/leak-memory.ts`: table `leak_memory`, one row per (username, target, statement). Every query filters by the signed-in username; the username comes from the session and never from the request, so one account cannot read or write another's memory. Limits: 600 entries per target, 3000 per account, 10 nominated per target.
- `src/data/leak-targets/`: the roadmap. One JSON per target (statement, informal reading, provenance, checks, seeds, and optionally a `guide`). Ids are permanent because memory is keyed by them. Targets: `erdos-396`, `collatz`.

## Guides (a target's line of attack)

A target may carry a `guide`: its heuristic, written as a chain of steps `G1, G2, ...`. Each step has `says` (the claim), `why` (why it follows, or might), a `tag`, and optionally `fill` and `lean`:

- `holds`: it follows from the steps before it.
- `repaired`: the step as first written (in the source the guide follows) fails; the text is the version that holds.
- `hole`: claimed, but the reasoning does not establish it. `fill` says what is already settled and what to try; a hole must have one.
- `lean`: names of theorems among the target's `seeds` (verified on Leak IV), so the step can be acted on at once.

**When the agent sees it.** Only when it is reminded to keep going: a resumed attempt (`continue`) and a reminder after a short stretch (`nudge`), in both voices. Never in the opening prompt, the system prompt or the session rules: the agent starts from the question and its own ideas, and gets the plan when it is picking the work back up. A conversation that could not be resumed is started again with the opening prompt, so it has no guide either (it is not a reminder). Each reminder carries the whole guide once; nothing is rotated or cut.

**How it gets there.** The playground sends `target.guide` as `options.guide` (next to `seeds`); the bridge runs `cleanGuide` (at most 24 steps, fixed tags, identifier-shaped Lean names, whitespace collapsed) and `renderGuide`, once per run, and passes the text to `V.continue` / `V.nudge` as `guide`. A guide that is malformed or renders to more than `GUIDE_MAX_CHARS` (9000) is not used at all, never cut in the middle, and the run says so. A run started without the seeds gets the steps without the Lean names (they would not be in its library).

**What goes in one.** Whatever the source argument claims, in the order it needs it, with every hole left visible and filled as far as it can honestly be: no step is marked `holds` that does not follow, and a step that fails as written is `repaired`, not silently corrected. Nothing in the text says who wrote the argument or links to it (the agent has no network and the question's reputation is not an input); that is recorded in the target's `provenance.guide`. `tests/leak-memory/guide.test.mjs` checks every target's guide: valid, under the limit with room to spare, ids in order, a reason on every step, a `fill` on every hole, every Lean name declared by a seed, and no wording the curious voice forbids.

`collatz`'s guide follows the slot-and-potential argument (see `provenance.guide`): G1 to G7 are exact and proved in the target's seeds (stopping-time reduction, slot-drop block, anchor drop, the round formula, slot-2 growth); G8 and G10 repair what fails as written; G9, G11 and G12 are the holes, with what is settled about each.

## Tests

`pnpm test:memory` runs the unit tests and `tests/leak-memory/live-bridge.mjs`, which starts the real bridge with a fake `claude` CLI and fake Leak servers (in a throwaway `$HOME`) and checks the variants end to end.

## Into Tengoku

Memory never reaches Tengoku by itself. A theorem leaves an account only when it is nominated (3 to 10 per target, by the author) and then passes the intake pipeline in emissary-archangel: a mechanical preflight, a Tau Ceti style agent audit, and Jinshi on the nominated modules. See `memory-intake/README.md` there. The modal's **Export nominated** button downloads the bundle (`GET /api/leak/memory/bundle?target=`) that pipeline takes.
