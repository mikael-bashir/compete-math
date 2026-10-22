# leak-rank

A star rating, one to five, for the theorems a Leak run banked, with the reasons. Lucid does this itself when it sleeps (`public/leak-quality.mjs`, `docs/leak-memory.md`); this tool runs the same rule offline over a whole set, to backfill runs from before or to audit the sleep stage's ratings. It exists so that "how good is this process" has a number: how many of the banked theorems are worth keeping, and which.

```
pnpm rank:bank -- --probes --read        # collect (cached, safe to stop and rerun), then write the report
node tools/leak-rank/rank.mjs            # just rewrite the report from what has been collected
```

`--export` also writes `src/data/leak-quality/<target>.json`, the file the app reads to show stars in the saved-theorems modal: numbers and flags keyed by entry id, no theorem text, so it can be committed. Rerun it (probes and reading are cached, so only new entries cost anything) after a long run to rate the new theorems; entries saved since the last ranking show as "unrated" until then.

Output goes to `~/.leak-runs/.quality/<target>/`: `ranking.html` (sorted, with the reason under each name), `ranking.csv` (everything), `ranking.md` (the distribution and the best fifteen).

## Where the stars come from

Three kinds of evidence, kept apart so you can see which one moved a rating.

| Evidence | What it is |
|---|---|
| Features | what the entry itself shows: proof size, whether the statement has any variable at all, how many other banked entries rest on it (a lemma another entry carries as a helper), whether it states the target from smaller hypotheses, whether it repeats another statement |
| Probes | two questions put to Leak IV about the statement alone: does a one-line automatic tactic prove it (`decide`, `simp`, `omega`, `norm_num`, `aesop`, `positivity`), does a single existing lemma prove it (`exact?`) |
| Reading | a model's reading, in batches of eight with the order reshuffled between independent draws: what the statement says, the kind, how deep the proof is, how general the statement is, what it is worth to the target, whether Mathlib probably has it, whether the hypotheses look unsatisfiable. Correctness is not asked: everything banked compiles |

The rule is `stars()` in `rank-core.mjs`, and it is short. Caps first: a cheap tactic proves it (1), one existing lemma proves it (2), a numeric fact with no variable (2), the reader says Mathlib has it (2), hypotheses look unsatisfiable (1), same statement as another entry (1). Then a weighted score: 0.35 depth, 0.25 generality, 0.25 worth to the target, 0.15 reuse, rounded; five stars are rare on purpose (4.5 or more). A statement of the target from smaller hypotheses with real worth is raised to four, and a lemma four or more others rest on to three. Each rating carries its reasons.

## What it does not tell you

- It is not correctness (Leak IV settled that) and not novelty against the literature: "Mathlib has it" is the reader's belief plus the single-lemma probe, not a search.
- The reading is one model, so it can be wrong the same way twice. The draws' spread is reported; where they disagree the rating is less certain. There is no human-labelled set to calibrate against yet. A few anchors exist (the human-written seeds, the conditional reductions of the target) and the report shows where they land.
- `usedBy` counts entries in the same banked set that carry the lemma, not uses by the final proof of the target (the target is open).

The pure parts are tested in `tests/leak-rank/`; collecting needs the network and costs a few dollars of reading for a few hundred entries.
