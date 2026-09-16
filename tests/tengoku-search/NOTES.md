# Test notes — Tengoku search

Kept while building the new search (2026-09-15), for the CI/CD overhaul.
Which tests were run, how often, what each one caught, and what the numbers
did. Every command below is deterministic and needs no human.

## The tests, ranked by how often they ran

| # | Test | Runs | What it caught |
|---|------|------|----------------|
| 1 | `pnpm test:tengoku` — 48 unit tests (normalise, intent, expansion, fusion, shards, stats) | ~22 | LaTeX `\sum_{i}` not converted (`\b` fails before `_`); `Tengoku.X.Y` classified as a name, not a module; dotted names lower-cased before constant lookup; `sqrt` lost when the phrase "square root" consumed its words; unary vs binary minus; duplicate object keys |
| 2 | `npx tsc --noEmit` | ~16 | `string \| undefined` into `path.join` in the loader; a removed import; nothing behavioural, but it runs first because it is the cheapest gate |
| 3 | `pnpm tengoku:eval tests/tengoku-search/golden-dev.jsonl` — 80 golden queries against the live index | 10 | Everything that mattered: see the numbers below. Also reports expected names missing from the index, which is how the extractor's Init/Std exclusion was found |
| 4 | `python3 -m unittest discover -s tengoku/scripts/tests` — 10 tests for `stats.py` and `derive.py` | ~6 | `str \| None` syntax on the machine's Python 3.9; `«command#…»` names tokenised as one blob; token-df output shape |
| 5 | `scripts/tengoku-index/probe.ts` — size/free/pgvector per angel | 2 | Which angels are empty (ANGEL10–16), that ANGEL1 has 17 MB left, that pgvector is available everywhere |
| 6 | `scripts/tengoku-index/query.ts "<q>" [--channels name]` — one query, top 10 with channels and scores | ~8 | Why a miss missed (which channel ranked what) |
| 7 | Extractor smoke: `lake exe tengoku-extract --module Tengoku.Logic.Basic` (831 declarations, 6 s) | 3 | `enableInitializersExecution` needed before `importModules (loadExts := true)`; `supportInterpreter` needed in the lakefile; the JSON shape |

## Golden-dev numbers (80 queries; 66 evaluated until the core reload)

| Round | Change | hit@1 | hit@10 | MRR |
|-------|--------|-------|--------|-----|
| 1 | first load, six channels, RRF | 34.8% | 60.6% | 0.430 |
| 2 | notation → name tokens; all-constants for notation; phrases consume words; inflections; unary/binary minus; `self` | 45.5% | 74.2% | 0.561 |
| 3 | exact-name bonus 2; fusion weights trust the name channel for notation/pattern; e^ before ^; π; number words | 51.5% | 87.9% | 0.645 |
| 4 | reload with Init/Std (412,011 declarations), token IDF, token groups, local-name bonus, curated gazetteer | 58.8% | 86.3% | 0.677 |
| 5 | exact-name prior carried through fusion; coverage term; `++`, comparison phrases, commutativity pattern | 72.5% | 92.5% | 0.799 |
| 6 | instance binders not counted as constants; generic-over-namespaced tie-breaks (reload) | 71.3% | 95.0% | 0.803 |
| 7 | full-text weights favour names over docstrings 5:1; `a + a` beside `2 *` is two_mul, not self; "at least" = ge or le | 70.0% | 96.3% | 0.799 |
| 8–10 | numeric-type copies (Int8.two_mul, Nat.sub_self) fold into the general lemma and lift it; never for a name typed verbatim | **72.5%** | **100%** | **0.830** |

Latency at round 10, from this machine to the seven Neon shards over HTTP: median 190 ms, p90 421 ms, max 589 ms per query, all channels in parallel.

Rounds 4 onward evaluate all 80 queries. Per intent at round 10: every intent 100% hit@10.

Per intent at round 3: name 100%, pattern 86%, notation 80%, named 75%, nl 87%.

What the misses taught, in order of how much each fix was worth:

1. **Reciprocal-rank fusion flattens exact matches** (rounds 4→5, +14 points hit@1). Rank 1 vs 2 in one channel is worth 0.0008; a near miss that ranks well in another channel wins. An exact-name flag has to survive fusion as a prior.
2. **Notation needs its own vocabulary** (round 2, +14 points hit@10). `a^2 + b^2` says nothing to full-text search until `^2` means `sq` and `+` means `add`.
3. **Alternatives of one word must share credit** (round 4). "sum" → `add` or `sum`; a name matching both was double-counted.
4. **"Fewest constants" prefers concrete copies** (round 6). `Int.mul_add` has four constants, generic `mul_add` seven because its type-class arguments count. Instance binders must not count, and ties go to the shallower namespace.
5. **PageRank over the whole tree favours core** — `Int8.two_mul` outranks `two_mul` because everything imports Init. Importance is a tie-breaker, never a primary signal.
6. **Families flood a list** (rounds 8–10, the last three misses). Int8/Int16/Int32/Int64/UInt*/Nat copies of one lemma fill the top ten of a channel and push the general one out. Folding a numeric-type copy into its root, when the root is present, both fixes ranking and de-duplicates the page. Only a name typed verbatim is exempt.
7. **Each fix needs a unit test the same day** — three regressions were caught by the 48 unit tests before the eval ever ran (phrase precedence, notation rule order, the fold exemption).

The 14 "not in index" queries at rounds 1–3 were all core Lean declarations (`Nat.add_comm`,
`List.reverse_reverse`, …): the extractor only walked `Tengoku.*` modules.
That is a category the golden set catches and unit tests never would.

## What I would put in CI

- **Gate 1, every PR, seconds**: `tsc --noEmit`, `pnpm test:tengoku`, the
  tree's `python3 -m unittest discover -s scripts/tests`. Deterministic, no
  network.
- **Gate 2, every PR touching search, minutes**: `pnpm tengoku:eval
  golden-dev.jsonl --min-hit10 0.95` against the live index. Deterministic given
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


## Sandbox ledger — Tengoku security rework (2026-09-15)

Sandbox: `competemath/tengoku-sandbox` (public; merge queue needs public or Enterprise Cloud).

| Scenario PR | Expectation | Result (round 3, main after #20) |
|---|---|---|
| clean append to staging (#2) | pass gate, merge via queue | gate pass; queued; candidate module built in 5 s; **merged** |
| content + tooling in one PR (#3) | fail `classify` | fail (multi-purpose) |
| deletion in staging (#4) | fail `append-only` | fail |
| `#eval` in a record (#5) | fail `content-lint` | fail |
| Authors line removed (#6) | fail `credits` | fail |
| credential-shaped string (#7) | fail `secrets` | fail |
| commit without sign-off (#8) | fail `dco` | fail |
| source not on the allowlist (#9) | fail `records` | fail (after the fixture was fixed) |
| broken proof (#10) | pass gate, ejected by the queue with a comment | gate pass; queued; **ejected**, comment names `_candidate_Definability.lean:200:12`, the source line and `Selftest.broken` |
| comment in a script (#11) | pass gate (lint + tooling tests run) | pass |
| hand edit of a generated module (#12) | fail `classify` (derived); as a promotion-class PR: ejected by the queue | gate pass (bot identity = tester); queued; **ejected** by the regeneration check, comment names the file |
| promotion by the bot (#17) | class `promotion`; queue builds the library and diffs regeneration; merge | **merged** on the third attempt (two gate gaps and one merge-group gap fixed on the way) |
| tooling PRs #13–#21 | merge through the queue | all merged via the queue; each tooling-only group passes in ~3 min |
| attested cache, `TENGOKU_VERIFY=require` | unattested part refused; attested part accepted; tampered part refused | all three: the library's current (unattested) part → REFUSED in require mode, warning in warn mode; the sandbox's attested `cache-20260915T1930Z` part → `attestations verified`; the same part with one byte appended → REFUSED (warn mode only warns, which is why the default flips to require once every published cache is attested) |

What the sandbox caught before it reached the library:

1. The first `pr-gate.yml` had a YAML error; GitHub lists such a file by path and runs it on push. With the check already required, its own fix could not merge: the escape hatch (disable the ruleset for one push) was used once. Land workflows before requiring them.
2. A ruleset on `~ALL` branches blocked contributors' own force-pushes and auto-delete after merge. Removed; only `main` is protected.
3. Code-owner review with a single owner freezes every tooling PR (authors cannot approve their own). Off until a second reviewer identity exists.
4. Required checks must report on both the PR and the merge group, or nothing enters the queue.
5. `stats.json` changes with every commit and cannot be in the regeneration diff.
6. A failed merge-group run disarms auto-merge; the ejection comment says how to re-queue.
7. The gate scripts have their own test suite (`scripts/ci/tests/test_gates.py`, 16 cases on synthetic git repos), which caught the DCO message and the derived-path rule before the first push.
8. The first queue run failed on the runner, not on Lean: the generator needs the library's source corpus (`--corpus`). Corpora are now pinned in `schemas/sources.json` and cloned in the queue.
9. Two scenario PRs appending to one staging file could not both queue (UNMERGEABLE). Staging is one file per PR now.
10. The promote bot's PRs had no class. `promotion` exists, actor-gated.
11. `credits` flagged the tooling PR itself: editing a fixture record in `selftest.sh` removed a line containing `"source_url"`. Scripts, workflows and schemas are exempt from the credits gate; seeded modules, data, docs and licences stay covered (two tests added).
12. A local dry run of the queue helper showed `main` drifting from the generator by two imports; the queue compares only the derived files a group touches.
13. The first tooling-only merge group was ejected in 75 ms with no output: `grep` found no Lean targets, exited 1, and the runner's `bash -e -o pipefail` killed the step. The helper's stderr is now captured to a file and printed; `|| true` on the grep.
14. A PR in the merge queue reports `autoMergeRequest: null`; the queue entry (`isInMergeQueue`, `mergeQueueEntry.state`) is the thing to watch. `gh pr merge --auto` on an ejected PR enqueues it again directly.
15. Second queue round, the pipeline itself worked (corpus clone, candidate module, cache replay of 8,775 modules, a 5 s build of one module), but the clean PR was ejected: the candidate module for its source file also pulled in an older, still-broken staging record of the same file (`Definable.trans`, one of the 79 the promote loop had already declined). The queue now passes the group's own record names to the generator (`--candidate-names`).
16. The ejection comment was composed and posted to nobody: a squash merge group's commit subjects read `<title> (#N)`, not `Merge pull request #N`. It also missed lake's `error: <file>:<line>:<col>:` form and so quoted no source line or record. Fixed, with a dry-run test on a simulated two-PR group.
25. The sandbox cache build failed at publish with `HTTP 403: Resource not accessible by integration` on `POST /releases`, twice. Five probes narrowed it: the job token creates releases fine from push and dispatch runs, with the attestation scopes, with assets, with the exact `cache.sh put` command shape, and after the free-disk-space step — but **not when `--target` is an older commit of `main`** (the run's own commit after a 2.5 h build during which PRs merged). The same call with an admin token succeeds. The library's nightly never hit it only because its cached builds take minutes; a cold build while promotions land would fail the same way. The tag-push probe named the mechanism: `refusing to allow a GitHub App to create or update workflow .github/workflows/… without workflows permission` — GitHub evaluates a new ref (tag, or the tag a release creates) by the file differences between its commit and the default branch's tip, and `.github/workflows/*` had changed on `main` during the build. GITHUB_TOKEN can never hold `workflows`. So a nightly publish fails only when a workflow file lands on `main` while the build is running; content and promotions never trigger it. Options for the library: accept the rare failure (the next nightly publishes), or publish with a fine-grained PAT that has `contents` + `workflows` in a `CACHE_PUBLISH_TOKEN` secret.
24. Promotion PR, third attempt: merged through the queue. Gate class `promotion`, credits and data rules pass, queue builds the library target from the cache plus the regenerated modules, axioms scan, regeneration diff clean, pr-gate on the merge group accepts the class.
22. Promotion PR, second attempt: gate green (class promotion, credits and data rules pass), queue build of the library green, and then the *pr-gate* run on the merge group removed it: a `merge_group` event carries no pull-request actor, so the classifier refused the derived files. The classifier now accepts the promotion class on merge-group runs (the PR's own gate verified the actor; the queue only holds PRs that passed it).
23. Two tooling PRs that each append a test class to the same file conflict once the first merges (the queue reports DIRTY, auto-merge waits). A merge commit on the branch fixes it; the queue squashes anyway.
21. The derived-edit PR, queued as a promotion-class PR, was ejected by the queue's "Derived files match their generator" step with the hand-edit hint. Defence in depth holds even when the actor rule is satisfied.
19. Queue round 3 as designed: the clean PR merged through the queue (corpus clone, candidate module, 5 s build), the broken proof was ejected with a comment naming `_candidate_Definability.lean:200:12`, the source line and `Selftest.broken`. Only the newest PR of the failed group is commented on: GitHub gives each queue entry the previous entry's head as `base_sha`, so the group's commit range holds just that PR.
20. The promotion PR (staging file deleted, trusted appended, three modules regenerated, actor = bot) was classed `promotion` and then failed two data rules: `credits` saw the staging record's provenance line removed (it moves to trusted unchanged), and the content lint flagged `import Tengoku` lines the generator itself wrote into two regenerated modules. Credits now accepts a removed staging record when the same name and source_url are added to trusted in the same PR; `import` is forbidden only inside record fields, never in generated modules (the queue's regeneration diff governs those).
18. Round 3, with the sandbox's bot identity set to my own login for the promotion test, the derived-edit scenario was classed `promotion` and passed the gate. Correct for the actor rule, but the queue's regeneration step only regenerated libraries with *data* changes, so the hand-edited module would have merged. The queue now regenerates the library of every derived module a group touches; the dry run shows the hand edit reverted. The derived-edit PR is a queue scenario from here on.
17. My own fixture regression: after the record gained a real `source_url`, the bad-source scenario's `sed` no longer matched and the PR passed. The report caught it (`bad-source fail pass WRONG`).


## Overnight campaign — competemath/tengoku-sandbox (2026-09-15/16)

Scripts (copied to `tests/tengoku-security/campaign/`, paths point at the session's work clone and scratchpad): `gate.sh` (66 scenario PRs with precondition checks and a per-job expectation), `report.sh`, `queue.sh` (ejection classes one at a time, twelve clean PRs queued together, a broken PR between two clean ones, fix-and-re-queue, a bulk promotion, a disguised hand edit), `guard*.sh` (publish guard), `round2.sh`/`round3.sh` (re-runs after fixes). The bot identity was a stranger during the gate phase and the tester during the queue phase.

**Gate phase: 58 of 66 as expected** on the first run; every mismatch was either a real gap (below) or a fixture of mine (a reused record name that had already been promoted; a `Depends-On` body set by a `grep -P` that macOS grep does not have).

**Queue phase:** broken proof, `sorry`, unknown identifier, unsolved goals, heartbeat timeout and a seeded-module `unsafe def` were all ejected with comments; twelve clean PRs queued together merged in two groups (the first five in one pass, about 12 minutes for all twelve); a broken PR between two clean ones was ejected alone and both neighbours merged; a fixed PR re-queued and merged; a bulk promotion of every merged per-PR file (over 300 records) merged; a hand edit disguised as a promotion was ejected by the regeneration diff with the file named. Two "wrong" rows were mine: `rfl : 2 = 2` is a valid proof of `1 + 1 = 2` (definitional unfolding), and the re-queue watcher read the PR's earlier ejection comment.

**Gaps the campaign found in the shipped gates, all fixed the same night (sandbox PRs #100, #104, #122; library PR competemath/tengoku #6):**

1. `tooling-tests` piped `unittest` into `tail`: a failing test could not fail the job. Now `set -o pipefail`.
2. The queue's axioms step piped the tool into `tee`: a `decide +native` record was reported (`Lean.ofReduceBool` via `_native.decide.ax`) and merged anyway. Same fix. Because it merged before the fix and the bulk promotion then trusted it, every later PR touching that source file was ejected by the (now working) scan — a real-world lesson: a record that slips into trusted must be tombstoned and its module regenerated (phase 5 below).
3. TruffleHog's `verified,unknown` mode passes credential-shaped strings that fail verification; only tooling-class PRs were caught, by the pre-commit hook. The same `detect-secrets` pattern scan now runs in the `secrets` job for every class, including the added lines of data files. Round 2 then found the step exiting before the data scan for a content-only PR (fixed). Limit: `detect-secrets` finds key ids and tokens inside JSON strings but not a bare AWS secret-key value (its keyword rule needs the plain `key = value` form).
4. A record name with a space passed validation. Names must be identifiers (no whitespace, commas or control characters) and the statement must declare the name's last component (namespaces may come from `context`); verified against all 8,920 trusted records.
5. `Depends-On: #<merged PR>` failed with "not found": the job has no PR checkout so `gh` could not infer the repository, and the job token cannot read the merge-queue field. Now `-R $GITHUB_REPOSITORY` with a fallback to the merge state alone; the failure message carries `gh`'s reason.

6. **Tombstones did nothing.** The schema and `records` gate accept `{"tombstone": "<name>", …}`, the plan says "the generator drops it", and `generate.py` had no tombstone code at all. Phase 5 proved it: the retraction PR for the poisoned record merged (class promotion, regeneration diff clean — because nothing changed), and the next clean PR was ejected on the same record. The generator now collects tombstoned names from the library's trusted files and drops those records from modules and candidates, with a test; a re-staged record under a retracted name is dropped too.

7. **The build job could not dispatch itself.** The third guard run finally landed a workflow change mid-build: the guard skipped publishing as designed, and the relaunch step failed with `could not create workflow dispatch event: HTTP 403`. The rework's `permissions: {}` had removed the `actions: write` the self-dispatch needs — which also means the pre-existing resume-after-time-cap path had been broken since the port. Fixed by adding `actions: write` to the build job; a fourth guard run verifies the relaunch end to end.

After the campaign, the gate got a verdict comment per PR (`scripts/ci/gate_summary.py`: failed check, step, log excerpt, what to do, a prefilled gate-bug issue link for the fragile checks) and `pipefail` became the default for every step. Verified on the sandbox with six failing scenario PRs and a clean one.

The banking pipeline got a **PR mode** (2026-09-16, off by default): Emissary-Archangel banks into an ignored `.bank/<library>/` batch file and opens one content PR per batch (200 records or 10 minutes) from a throwaway worktree — signed off, auto-merge armed, names already on `main` refused rather than duplicated (`lib/tengoku-pr.ts`, commit 7109094); the tree's promote loop opens one promotion PR per source file and waits for each merge, with a 24 h skip list for ejected files (competemath/tengoku PR #9). The PR module was exercised against the sandbox: one record → PR #149 through gate and queue, clone left untouched. It goes live with the ruleset, once `TENGOKU_BOT` names the account the machine uses.

**Enforced on competemath/tengoku, 2026-09-16 ~11:50 UTC:** ruleset (PR only, required `pr-gate` + `queue-gate`, merge queue, linear history), auto-merge on, `TENGOKU_BOT` = the machine's login, the app and the promote loop in PR mode. A direct push to `main` is refused (`GH013`). The loop's first PR-mode cycle put the old broken staging record's file on the 24 h skip list, as designed.

Comment quality fixes on the way: the `sorry` ejection names the file, line and record; the queue lint's findings reach the comment; the comment stops at lake's trailer; the axiom hint matches the tool's wording.

**Publish guard:** two end-to-end runs both had the workflow PR land after the build had already published (a build from the saved cache takes ~9 minutes; a queue merge 6–10), so the guard saw no change and published normally, and the relaunch step was skipped as designed. A third run dispatches the build only once the workflow PR is inside a running merge group.

**Round 3 (secrets inside records, after the ordering fix):** an AWS key id and a GitHub token inside a record's `context`/`proof` fail at `secrets`; a clean content-only PR still passes; the bare secret-key value passes (detect-secrets limit, noted above).

**Phase 5 and 7 (a bad record in trusted):** the tombstone PR merged as a promotion but changed nothing (finding 6); with tombstones implemented, the regeneration PR removed the record from its module, merged through the queue, and the clean content PR that had been ejected on it merged.

**Publish guard, runs 3 and 4:** with the workflow PR queued first and the build dispatched once its merge group was running, the change landed mid-build both times. Run 3: the guard skipped publishing and the relaunch was refused (finding 7). Run 4, with `actions: write`: the guard skipped publishing, the relaunch dispatched a second run on the tip, and that run restored the saved build, published `cache-…` at the tip and attested it, with its own relaunch step skipped — the full path, end to end.

**Round 2 (after the fixes): 12 of 13** — the failing unit test now fails the job; fake credentials fail at `secrets`; names with a space or comma and a statement that declares another name fail `records`; a namespaced name declared by its last component passes; the real type mismatch (`3 = 3`) and `decide +native` are ejected in the queue with the right messages; the merged dependency passes `depends`.
