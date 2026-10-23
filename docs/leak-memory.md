# Leak targets and memory

Four experimental variants of Control II that keep what they prove, a roadmap of targets to point them at, and the per-account store for what they keep.

## Variants

All four are Control II (one continuous agent, Leak IV plus Leak I search) with a time limit that can run to 48 h and an optional dollar cap. They differ only in what memory is and how it reaches the agent. Control II itself is the no-memory baseline.

| Variant | Memory | How the agent sees it |
|---|---|---|
| Honoured | append-only library of verified theorems | `memory_recall`, `memory_list`, `memory_nominate` tools |
| Flint | episodic: the most recent verified theorems | replayed into each fresh attempt, no tool |
| Paragon | the same library | also folded into the Leak I results the agent already reads, plus the tools |
| Lucid | Honoured | plus an hourly "sleep" pass that merges the library into fewer, more general lemmas and rates every saved theorem, one to five stars |

What is saved: every declaration a run verifies on Leak IV that is not trivial (a closing-tactic proof of a one-line statement is not), with the helper declarations it needs, so each entry compiles on its own. Entries are keyed by the statement (not the name); a shorter proof of the same statement replaces a longer one. `sorry`, `admit` and `native_decide` scripts are never saved.

## Where it lives

- `public/leak-quality.mjs`: the rating rule (features, two probes, a model's reading, the stars). Next to the bridge; the setup command downloads it. The sleep stage and `tools/leak-rank` both use it.
- `public/leak-memory.mjs`: the pure memory module (splitting, closure, dedupe, BM25 recall, sleep prompt). Next to the bridge; the setup command downloads it.
- `public/leak-containment.mjs`: how the agent is confined (see `docs/leak-agent-containment.md`). Next to the bridge; the setup command downloads it.
- `public/local-claude-bridge.mjs`: the four strategies (`control-honoured`, `-flint`, `-paragon`, `-lucid`), `proveControlMemory`, the cost cap, the 48 h clamp.
- The bridge keeps nothing between runs. The browser sends the account's entries with the run (`options.memory.entries`, at most about 1.6 MB: the best rated first, rated-low and merged theorems left out) and persists the `{type:"memory"}` frames the run emits.
- `src/app/api/leak/memory`, `src/app/lib/data/leak-memory.ts`: table `leak_memory`, one row per (username, target, statement). Every query filters by the signed-in username; the username comes from the session and never from the request, so one account cannot read or write another's memory. Limits: 1500 live entries per target, 6000 per account, 10 nominated per target. Rows that were put away (below) are not live and do not count. A full target makes room by putting away its worst expendable row; only when nothing can be put away is a new theorem skipped, and the page says so.
- `src/data/leak-targets/`: the roadmap. One JSON per target (statement, informal reading, provenance, checks, seeds, and optionally a `guide`). Ids are permanent because memory is keyed by them. Targets: `erdos-396`, `collatz`.

## Guides (a target's line of attack)

A target may carry a `guide`: its heuristic, written as a chain of steps `G1, G2, ...`. Each step has `says` (the claim), `why` (why it follows, or might), a `tag`, and optionally `fill` and `lean`:

- `holds`: it follows from the steps before it.
- `repaired`: the step as first written (in the source the guide follows) fails; the text is the version that holds.
- `hole`: claimed, but the reasoning does not establish it. `fill` says what is already settled and what to try; a hole must have one.
- `lean`: names of theorems among the target's `seeds` (verified on Leak IV), so the step can be acted on at once.

**When the agent sees it.** Only when it is reminded to keep going: a resumed attempt (`continue`) and a reminder after a short stretch (`nudge`), in both voices. Never in the opening prompt, the system prompt or the session rules: the agent starts from the question and its own ideas, and gets the plan when it is picking the work back up. A conversation that could not be resumed is started again with the opening prompt, so it has no guide either (it is not a reminder). The first reminder of a conversation carries the guide in full, so does every tenth after it (the CLI compacts a long conversation, and a summary keeps the gist, not the steps), and the reminders in between carry a pointer of a few hundred characters (`renderGuidePointer`: where the plan needs work, the moves it suggested). In a 3-hour run the agent was reminded 202 times, about every 34 s, and the full text each time was half of everything that entered its conversation; `options.guideEvery` changes the cadence (1 is the full text every time). Nothing is cut: a guide too long to send in full is not sent.

**How it gets there.** The playground sends `target.guide` as `options.guide` (next to `seeds`); the bridge runs `cleanGuide` (at most 24 steps, fixed tags, identifier-shaped Lean names, whitespace collapsed) and `renderGuide`, once per run, and passes the text to `V.continue` / `V.nudge` as `guide`. A guide that is malformed or renders to more than `GUIDE_MAX_CHARS` (9000) is not used at all, never cut in the middle, and the run says so. A run started without the seeds gets the steps without the Lean names (they would not be in its library).

**What goes in one.** Whatever the source argument claims, in the order it needs it, with every hole left visible and filled as far as it can honestly be: no step is marked `holds` that does not follow, and a step that fails as written is `repaired`, not silently corrected. Nothing in the text says who wrote the argument or links to it (the agent has no network and the question's reputation is not an input); that is recorded in the target's `provenance.guide`. `tests/leak-memory/guide.test.mjs` checks every target's guide: valid, under the limit with room to spare, ids in order, a reason on every step, a `fill` on every hole, every Lean name declared by a seed, and no wording the curious voice forbids.

No target has a guide at present. `collatz` had one (the slot-and-potential chain G1 to G12) until 2026-10-22, when it was removed together with the seed lemmas built around it (the slot and round lemmas); `docs/archive/collatz-guide-2026-10-22.json` keeps all of it, and the mechanism above is unchanged for any target that wants one.

## What a run costs, and how to read it

The CLI reports cost once per call of the CLI, so the bill of a long run used to be one number. Now the run's record (`~/.leak-runs/<run>.jsonl`) has, for every API call of the agent's conversation, a line

```
USAGE — ctx 251,310 (read 250,900 · written 410 · new 0) · out 1,230 · est $0.118 (read 0.075 · write 0.002 · new 0.000 · out 0.018)
```

(the whole context of the call, how much of it came from the cache, how much was written to the cache anew, how much the model said, and the parts priced with the bridge's `MODEL_PRICE` table), a `COMPACTED (...)` marker when the context was much smaller than the one before it, and on the end line `metrics.usage`: the totals, `max_context_tokens`, `compactions`, and `est_usd` split into input / cache_read / cache_write / output. The estimate is not the bill: `cost_usd` (the CLI's own figure) stays the authoritative total. The lines are written when each call of the CLI ends and go to the record only, never to the console.

Two things in what the agent sees were removed because they cost every later call: the guide repeated in full at every reminder (above), and the `[[LEAK_NORMALIZED_SCRIPT_B64:...]]` marker Leak IV appends to a successful verify (the exact compiled bytes, base64, for the proof gate). In a memory run the verifier proxy takes the marker off before the agent sees the reply and keeps the bytes by script, so the gate still stores what the daemon compiled.

Settings that change the cost and are NOT set by the bridge (they pass through to the agent's CLI; their effect on this prover has not been measured, so compare with `tools/driver-health/trial.mjs`, which sends the target's guide as a page does): `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` and `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (how large the conversation grows before the CLI compacts it), `CLAUDE_CODE_EFFORT_LEVEL` (low to max), `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m` or `1h`; a longer TTL costs more per write). The `USAGE` lines say which of them matter: a context that never shrinks, a cache that is written again at every call.

## Tests

`pnpm test:memory` runs the unit tests and `tests/leak-memory/live-bridge.mjs`, which starts the real bridge with a fake `claude` CLI and fake Leak servers (in a throwaway `$HOME`) and checks the variants end to end.

## Into Tengoku

Memory never reaches Tengoku by itself. A theorem leaves an account only when it is nominated (3 to 10 per target, by the author) and then passes the intake pipeline in emissary-archangel: a mechanical preflight, a Tau Ceti style agent audit, and Jinshi on the nominated modules. See `memory-intake/README.md` there. The modal's **Export nominated** button downloads the bundle (`GET /api/leak/memory/bundle?target=`) that pipeline takes.

## The library's upkeep (what Lucid's sleep is for)

A run's library is only worth what the agent can use from it. Measured on 2026-10-22, a library that reached 600 theorems stopped growing: the bridge, the store and the page's byte budget all refused new theorems without a word, and a run that verified about 190 theorems saved none. Now:

- **Wounded.** A theorem the sleep stage rates one or two stars (`WOUNDED_AT`) is *wounded*: true, but an instance, a one-line tactic or a restatement of the library. It is hidden from the agent (`memory_list` and `memory_recall` say how many, and take `all` to show them), left out of what the page sends with a run, and the first to be put away when room is needed. Never wounded: a nominated theorem, the target's own proof, a seed, a general lemma that stands in for others.
- **Room.** The cap is 1500 per target (`MAX_ENTRIES` in the bridge, `MAX_ENTRIES_PER_TARGET` in the store). A full library puts away what is merged into a general lemma first, then the lowest rated, then the least recalled, then the oldest. On the server, "put away" is an archive, not a delete: the row keeps its statement, name and rating, drops its proof, is not listed, not sent to runs and not counted, and proving the same statement again brings it back. When nothing can be put away a new theorem is skipped, and the bridge and the page say so.
- **Clear library.** The Saved theorems window has a button (two clicks) that puts away everything but the nominated theorems for that target (`DELETE /api/leak/memory?target=…&all=1`). Nothing is deleted.
- **Recall.** Better rated theorems come first, and a general lemma a little ahead of its peers.

## The dream

Lucid's sleep (`runSleepStage`) is as long as the library is big (`dreamBudget`): eighteen minutes for a small one, a proportional share of an hour up to a thousand theorems, an hour from there. The dream a run opens with is the short one, because the agent has not begun. The hour between dreams runs from the end of the last one. It does two jobs, in this order:

1. **Rate** what has no rating (below), as many as fit in its share of the time (about 44%), newest first.
2. **Merge.** `dreamClusters` groups the visible theorems by the words of their names and statements (tf-idf, cosine; a word in everything counts for little), biggest and tightest groups first. Each group is one short session whose only tool is Leak IV, asked for ONE general lemma and, under it, one corollary per member: the member's own statement, proved from the general lemma. The harness verifies the script again and retires a member only when the verified script holds a theorem with that statement whose proof leans on an earlier declaration (`splitCorollaries`); the corollaries are not saved as entries, and a script that retires fewer than two members (`MIN_RETIRED`) adds nothing. A group studied once is not studied again in the same run. A nominated member is never retired.

The console says what happened: groups studied, general lemmas added, how many theorems were rated, merged and put away, and how many the agent now sees.

## Temperament

The curious voice (the default) is written for a question that does not yield: the opening names the temperament (think in months, make things general, let small cases teach, hold claims loosely, change altitude when stuck, keep the library for a stranger) and what a good stretch looks like, and asks for lab notes as the agent goes, not as a goodbye. Every reminder (`continue` and `nudge`) carries a short `TEMPERAMENT_CARD` so this survives the CLI compacting a long conversation, a high-level question from `CURIOSITY_PROMPTS` (about what lasts, small cases, the angle of attack, Leak I; the bridge counts reminders so the question changes even when the library does not), and, when Leak I has not been used lately, a check-in with the run's own count (`leakICheckin`). A NOTE/NEXT written in the middle of a stretch is kept and handed back, even if the last message has none. None of the text calls the problem open, hard or unsolved.

## Ratings (Lucid's second job when it sleeps)

When Lucid sleeps it also rates every saved theorem that has no rating yet (newest first, within the dream's rating share (24 at least, about three a minute of it); a numeric fact or a repeat is capped by what the entry shows and is not put to the verifier), by the rule in `public/leak-quality.mjs`: features of the entry (proof size, whether the statement has any variable, how many other entries rest on it, whether it states the target), two questions put to Leak IV (does a one-line automatic tactic prove its statement; does a single existing lemma), and a model's reading in two independent draws. The tactic test is checked first (it must close an easy truth and not an easy falsehood) or the pass stops and says so. A sleep is also due when enough theorems are waiting for a rating, not only when enough are new.

The rating is numbers and flags (`entry.quality`), saved with the entry like any other update, and the saved-theorems modal shows it as stars with a hover card that says what the rung means and what stands behind this theorem's rating. Entries saved before this existed carry the rating from the offline ranking (`src/data/leak-quality/<target>.json`) until they have their own. Only Lucid rates; the other variants never sleep, so their theorems show the shipped rating or none. See `docs/leak-agent-containment.md` for the confinement the reading runs under, and `tools/leak-rank/README.md` for the same rule run offline over a whole set.
