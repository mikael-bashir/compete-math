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
- `public/local-claude-bridge.mjs`: the four strategies (`control-honoured`, `-flint`, `-paragon`, `-lucid`), `proveControlMemory`, the cost cap, the 48 h clamp.
- The bridge keeps nothing between runs. The browser sends the account's entries with the run (`options.memory.entries`, at most about 1.2 MB) and persists the `{type:"memory"}` frames the run emits.
- `src/app/api/leak/memory`, `src/app/lib/data/leak-memory.ts`: table `leak_memory`, one row per (username, target, statement). Every query filters by the signed-in username; the username comes from the session and never from the request, so one account cannot read or write another's memory. Limits: 600 entries per target, 3000 per account, 10 nominated per target.
- `src/data/leak-targets/`: the roadmap. One JSON per target (statement, informal reading, provenance, checks). Ids are permanent because memory is keyed by them.

## Tests

`pnpm test:memory` runs the unit tests and `tests/leak-memory/live-bridge.mjs`, which starts the real bridge with a fake `claude` CLI and fake Leak servers (in a throwaway `$HOME`) and checks the variants end to end.

## Into Tengoku

Memory never reaches Tengoku by itself. A theorem leaves an account only when it is nominated (3 to 10 per target, by the author) and then passes the intake pipeline in emissary-archangel: a mechanical preflight, a Tau Ceti style agent audit, and Jinshi on the nominated modules. See `docs/memory-intake.md` there.
