# Test notes — Tengoku search

Kept while building the new search (2026-09-15), for the CI/CD overhaul.
Which tests were run, how often, what each one caught, and what the numbers
did. Every command below is deterministic and needs no human.

## The tests, ranked by how often they ran

| # | Test | Runs | What it caught |
|---|------|------|----------------|
| 1 | `pnpm test:tengoku` — 41 unit tests (normalise, intent, expansion, fusion, shards, stats) | ~14 | LaTeX `\sum_{i}` not converted (`\b` fails before `_`); `Tengoku.X.Y` classified as a name, not a module; dotted names lower-cased before constant lookup; `sqrt` lost when the phrase "square root" consumed its words; unary vs binary minus; duplicate object keys |
| 2 | `npx tsc --noEmit` | ~12 | `string \| undefined` into `path.join` in the loader; a removed import; nothing behavioural, but it runs first because it is the cheapest gate |
| 3 | `pnpm tengoku:eval tests/tengoku-search/golden-dev.jsonl` — 80 golden queries against the live index | 3 (+1 pending) | Everything that mattered: see the numbers below. Also reports expected names missing from the index, which is how the extractor's Init/Std exclusion was found |
| 4 | `python3 -m unittest discover -s tengoku/scripts/tests` — 10 tests for `stats.py` and `derive.py` | ~6 | `str \| None` syntax on the machine's Python 3.9; `«command#…»` names tokenised as one blob; token-df output shape |
| 5 | `scripts/tengoku-index/probe.ts` — size/free/pgvector per angel | 2 | Which angels are empty (ANGEL10–16), that ANGEL1 has 17 MB left, that pgvector is available everywhere |
| 6 | `scripts/tengoku-index/query.ts "<q>"` — one query, top 10 with channels and scores | ad hoc | Why a miss missed (which channel ranked what) |
| 7 | Extractor smoke: `lake exe tengoku-extract --module Tengoku.Logic.Basic` (831 declarations, 6 s) | 3 | `enableInitializersExecution` needed before `importModules (loadExts := true)`; `supportInterpreter` needed in the lakefile; the JSON shape |

## Golden-dev numbers (80 queries; 66 evaluated until the core reload)

| Round | Change | hit@1 | hit@10 | MRR |
|-------|--------|-------|--------|-----|
| 1 | first load, six channels, RRF | 34.8% | 60.6% | 0.430 |
| 2 | notation → name tokens; all-constants for notation; phrases consume words; inflections; unary/binary minus; `self` | 45.5% | 74.2% | 0.561 |
| 3 | exact-name bonus 2; fusion weights trust the name channel for notation/pattern; e^ before ^; π; number words | 51.5% | 87.9% | 0.645 |
| 4 | reload with Init/Std (412,011 declarations), token IDF, token groups, local-name bonus, curated gazetteer | 58.8% | 86.3% | 0.677 |
| 5 | exact-name prior carried through fusion; coverage term; `++`, comparison phrases, commutativity pattern | 72.5% | 92.5% | 0.799 |
| 6 | instance binders not counted as constants; generic-over-namespaced tie-breaks | pending reload | | |

Rounds 4 and 5 evaluate all 80 queries. Per intent at round 5: name 100%, named 100%, nl 93%, pattern 80%, notation 80%.

Per intent at round 3: name 100%, pattern 86%, notation 80%, named 75%, nl 87%.

What the misses taught, in order of how much each fix was worth:

1. **Reciprocal-rank fusion flattens exact matches** (rounds 4→5, +14 points hit@1). Rank 1 vs 2 in one channel is worth 0.0008; a near miss that ranks well in another channel wins. An exact-name flag has to survive fusion as a prior.
2. **Notation needs its own vocabulary** (round 2, +14 points hit@10). `a^2 + b^2` says nothing to full-text search until `^2` means `sq` and `+` means `add`.
3. **Alternatives of one word must share credit** (round 4). "sum" → `add` or `sum`; a name matching both was double-counted.
4. **"Fewest constants" prefers concrete copies** (round 6). `Int.mul_add` has four constants, generic `mul_add` seven because its type-class arguments count. Instance binders must not count, and ties go to the shallower namespace.
5. **PageRank over the whole tree favours core** — `Int8.two_mul` outranks `two_mul` because everything imports Init. Importance is a tie-breaker, never a primary signal.

The 14 "not in index" queries at rounds 1–3 were all core Lean declarations (`Nat.add_comm`,
`List.reverse_reverse`, …): the extractor only walked `Tengoku.*` modules.
That is a category the golden set catches and unit tests never would.

## What I would put in CI

- **Gate 1, every PR, seconds**: `tsc --noEmit`, `pnpm test:tengoku`, the
  tree's `python3 -m unittest discover -s scripts/tests`. Deterministic, no
  network.
- **Gate 2, every PR touching search, minutes**: `pnpm tengoku:eval
  golden-dev.jsonl --min-hit10 0.8` against the live index. Deterministic given
  a fixed index commit; print the index commit in the report so a regression
  can be told apart from an index change.
- **Gate 3, nightly, after the index reload**: the same eval, plus a
  freshness check (`stats.json` tree commit vs `index_control.tree_commit`,
  alert past two days), plus `probe.ts` with a threshold on free space per
  shard.
- **Owner-only**: `golden-holdout.jsonl` is never run by the agent. Run it
  yourself on release candidates; if dev and holdout diverge by more than
  ~10 points the dev set has been overfitted and needs fresh queries.
- **What AI-driven tests could add**: generate paraphrases of golden queries
  (same expectation, new wording) to grow the set without hand-writing, and
  have a model judge "is this top-1 a reasonable answer" on the misses to
  separate ranking bugs from bad expectations.
