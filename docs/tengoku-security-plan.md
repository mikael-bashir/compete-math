# Tengoku security rework

Style: short. Every rule says where it runs, what it reads, what it blocks.
No AI-driven tests yet; slots for them are marked `[AI later]`.

## 0. Goals and threats

Tengoku is a ledger of theorem statements and proofs that becomes a Lean
library and a nightly cache loaded by every Leak service and every installer.
Two things must hold: nothing enters trusted without compiling, and nothing
in a cache can run code on a consumer's machine.

| Actor | Can try | Stopped by |
|---|---|---|
| anonymous contributor | append bad or malicious records | append-only rule, content lint, queue build, axioms |
| stolen bot token | push anywhere | bot has no bypass; bot PRs auto-merge only on append paths |
| malicious PR to scripts / workflows | change what CI builds or publishes | two reviewers, cooling period, environment-scoped publish token |
| tampered or forged cache | code execution on consumers | attested caches, verified on download |
| compromised action or tool | supply chain | SHA-pinned actions, egress allowlist, Dependabot |
| maintainer locked out | nothing merges | admin-disable of a ruleset, break-glass account, quarterly drill |

Lean facts that drive the lint: `initialize` runs on import inside every
Leak service; `#eval`, `run_cmd`, `run_tac`, `macro`, `elab`, `extern`,
`implemented_by`, `unsafe` run or link code at build; `native_decide` trusts
the compiler; `sorry` and custom axioms weaken the proof. Records paste
`context` and `proof` verbatim into modules. So the lint is a security gate,
not style.

## 1. Trial ground

- Merge queue exists only for public repositories, or private ones on
  Enterprise Cloud ([docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue), [discussion](https://github.com/orgs/community/discussions/131130)). Rulesets on private repos need a paid plan.
- So: trial in a **public sandbox** `competemath/tengoku-sandbox`, README banner "not the library", zero releases, nothing points at it. Private hides the tests but cannot run them.
- Copy `main` at one commit; port workflows there; iterate until green; then port to the real repo on your word.

## 2. Repository rules

Rulesets (Settings → Rules), not legacy branch protection:

- **`main` ruleset**: require PR; approvals 0 with *code-owner review required* (so tier 1–2 bot PRs need nobody and tier 3–4 paths need an owner); dismiss stale approvals; require status checks `pr-gate` and `queue-gate`; require merge queue; require linear history; block force-push and deletion; require conversation resolution; no bypass actors. Caveat found in the sandbox: an author cannot approve their own PR, so a solo maintainer with code-owner review on cannot merge tooling PRs at all. Turn it on only once a second reviewer identity exists (the break-glass account, or a collaborator); until then the sandbox runs with it off.
- **No ruleset on other branches.** Tried in the sandbox: blocking force-push on `~ALL` also blocked contributors rebasing their own PR branches, and blocking deletion broke auto-delete after merge. Protect `main` (and later `bank`); leave feature branches alone.
- **Merge settings**: squash only; default commit title = PR title; auto-delete head branches.
- **Merge queue**: merge method squash; build concurrency 2; group min 1, max 5; wait 5 min; status-check timeout 40 min; "only merge non-failing".
- **DCO**: install the [DCO app](https://github.com/apps/dco) and require its check. Contributors `git commit -s`. This is a sign-off trailer, not GPG; keep GPG/SSH signing as maintainer policy only.
- **CODEOWNERS** (`.github/CODEOWNERS`): tier 4 paths → maintainer + one other; tier 3 → maintainer; tiers 1–2 → none (bot PRs must not need a human).
- **Environments**: `cache-publish` holds the only token that can create releases; the nightly `build` job runs in it; manual `workflow_dispatch` in it requires a reviewer.
- **Security tab**: enable secret scanning and push protection (free on public); enable Dependabot alerts; enable private vulnerability reporting.

## 3. Write modes by path

| Tier | Paths | Mode | Who |
|---|---|---|---|
| 1 | `data/tentative/*.jsonl` | append-only | anyone, banking bot |
| 2 | `data/staging/*.jsonl` | append-only | anyone; the queue compiles it |
| 3 | `data/trusted/*.jsonl` | append by `promote.py`; humans append tombstones only | maintainer |
| D | `Tengoku/<Library>/**`, `Tengoku/All.lean`, `data/stats.json`, `data/cache-latest.json` | derived: never in a human PR | promote bot |
| 4 | `Tengoku.lean`, seeded `Tengoku/*` modules, `lean-toolchain`, `lakefile.toml`, `scripts/**`, `TengokuExtract.lean`, `.github/**`, `schemas/**` | modify | maintainer + second approver, 24 h cooling |
| 5 | `README.md`, `docs/**`, `CONTRIBUTING.md` | modify | anyone |

Append-only means: `git diff --numstat base..head` shows 0 deletions for the
file and the base content is a byte-prefix of the head content. Retraction is
a tombstone line `{"tombstone": "<name>", "reason": …, "by": …}` appended to
the same file; the generator drops tombstoned records.

## 4. PR gate — `pr-gate.yml`, runs on `pull_request`, no Lean, < 3 min

Jobs in order. A failed blocking job stops the rest (`needs:` chain).

1. **`classify`** (blocking). Reads `git diff --name-status`. Assigns the PR one class: `content` (tier 1/2 appends), `tombstone` (tier 3 append), `tooling` (tier 4), `docs` (tier 5), `derived` (tier D → always fails: "regenerated by the bot"). Two classes → fail "multi-purpose PR", except `docs` may ride along. Writes the class to a job output and a PR label. `[AI later: intent review of modified content]`
2. **`append-only`** (blocking, content/tombstone). The prefix test above on every tier 1–3 file. Fail names the first non-append hunk.
3. **`credits`** (blocking, all classes). Parses `git diff -U0`. Any removed or changed line matching `Authors?:|@author|Credit|Copyright|source_url|added_by` fails, with the line quoted. Covers Mathlib file headers and record provenance.
4. **`records`** (blocking, content/tombstone). Validates only added lines against `schemas/record.schema.json` with `scripts/ci/validate-records.py` (stdlib, no jsonschema dependency: required keys, types, `source_url` on the allowlist in `schemas/sources.json` with licence, `library` matches the file name, no duplicate `name` within the PR or against `data/trusted`, tombstone targets exist). Also file size ≤ 50 MB after the change.
5. **`content-lint`** (blocking, content/tombstone). `scripts/ci/lint-banked.py` over `context` and `proof` of added records: forbid `import`, `#eval`, `run_cmd`, `run_tac`, `initialize`, `builtin_initialize`, `@[init`, `@[extern`, `@[implemented_by`, `unsafe`, `macro`, `syntax`, `elab`, `native_decide`, `opaque`, `set_option` outside `schemas/allowed-options.json`. Same script is a pre-commit hook.
6. **`sorry-advisory`** (advisory, never blocks). Adds a PR comment listing `sorry`/`admit` in added records and `.lean` diffs. Leak IV in the queue is the authority.
7. **`secrets`** (blocking, all). `trufflesecurity/trufflehog@<sha>` on `base..head` with `--results=verified,unknown`; plus GitHub push protection upstream of it.
8. **`lint-python`** (blocking, tooling). `pre-commit run --all-files` — ruff check + format, JSON validity, large-file check, gitleaks. Reads `.pre-commit-config.yaml` only (§7).
9. **`tooling-tests`** (blocking, tooling). `python3 -m unittest discover -s scripts/tests`; a build of `tengoku-extract` on one module; a dry run of `scripts/derive.py` on a fixture; `actionlint` on workflows.
10. **`pr-gate`** (blocking summary). Passes only if every job of the PR's class passed. This is the required check. It also posts one comment per PR (updated in place, `scripts/ci/gate_summary.py`): each failed check with its step, the first error lines from its log, what the check looks for, what to do, and — for the checks that reason about paths, text patterns or other services (classify, credits, secrets, append-only, records, content lint, depends, tooling tests) — a prefilled *Report a gate bug* issue link, since those can be wrong themselves. Exact checks (DCO, lint) get advice only. Every `run:` step in the three workflows runs under `bash -e -o pipefail` (workflow `defaults`), after the campaign found two checks whose findings never failed their job.

Bot PRs (`bank` branch, tier 1–2 only) get auto-merge enabled by a workflow once `pr-gate` is green; they need no reviewer (CODEOWNERS has no entry for those paths).

## 5. Merge queue gate — `queue-gate.yml`, runs on `merge_group`, < 25 min

Authors build locally; the queue is the only CI that runs Lean.

1. **Seed**: `scripts/cache.sh get` (newest ancestor cache), then verify its attestation (§6).
2. **Generate**: `scripts/generate.py --candidate` for every changed staging file → `_candidate_*.lean`; for tombstones regenerate the trusted module.
3. **Build only what changed**: `lake build <candidate modules>`. Lake's traces make this incremental; nothing else compiles.
4. **Axioms**: `lake exe tengoku-axioms <candidate module>` (a 40-line Lean program next to the extractor: `CollectAxioms` on every new declaration; allowed `propext`, `Classical.choice`, `Quot.sound`; fail on `sorryAx` or anything else). Emissary-Archangel stays the authority for translations; this is the queue's independent check.
5. **Regeneration diff**: run `generate.py` for the touched library and `stats.py`; `git diff --exit-code` on tier D paths. A human edit to derived files cannot survive this.
6. **Content lint again** (same script; cheap; protects against a PR retargeted after review).
7. **`queue-gate`** summary: the required check.

Three things the sandbox taught about the queue:

- A required check must report on the PR *and* on the merge group, or nothing ever enters the queue. `pr-gate.yml` runs on both events; `queue-gate.yml` runs on both too and on a plain PR passes immediately ("the build happens in the queue").
- `data/stats.json` cannot be part of the regeneration diff: its counts and commit change with every commit. The diff covers `Tengoku/**` only; the derived-tier rule at the PR gate still blocks hand edits to `stats.json`.
- When a merge-group run fails, GitHub removes the PR *and disarms auto-merge*. The ejection comment tells the author to re-queue with `gh pr merge --squash --auto` or *Merge when ready*.
- The generator needs the source corpus, not just the record: `generate.py` reads each record's `source_path` from a checkout of the library it came from. The queue runner clones every touched library's corpus at the commit pinned in `schemas/sources.json` (`corpora`, blobless clone, ~1 min) via `scripts/ci/queue_targets.py`, which also prints the `_candidate_` modules to build. A staging record without `source_path` and `context` is silently never compiled, so `validate_records` now rejects one for any library that has a corpus.
- Two PRs appending to the same `data/staging/<library>.jsonl` conflict in the queue (GitHub marks the second UNMERGEABLE). Contributors add **one file per PR**, `data/staging/<library>/<anything>.jsonl`; the generator and the promote loop read the flat file plus the directory, and the promote loop deletes a per-PR file once its records are trusted.
- A candidate module compiles the trusted records of its source file plus **only the group's own** staging records for that file (`generate.py --candidate <path> --candidate-names <names>`). Without the filter an older broken staging record of the same file ejects every later PR touching that file.
- Ejection comments find the group's PRs from the squash commit subjects (`<title> (#N)`), quote lake's `error: <file>:<line>:<col>:` line, the source line and the record name, and note when the group held several PRs (GitHub retries the rest without the newest).
- The regeneration diff compares only the derived files the group itself touches. `main` can drift from the generator between promotions (the sandbox's copy of the tree differed by two `import Tengoku` lines after a generator change); a whole-tree diff would eject every group until a promotion happened to regenerate those modules.
- The promote bot's own PRs (staging records removed, trusted records appended, modules regenerated) are neither `content` nor `tooling`. `classify` has a `promotion` class, granted only when the PR author is the bot (`TENGOKU_BOT` repository variable) and the paths are derived + content + tombstone only; `append-only` skips staging files for that class.

Dependencies between PRs: merge groups are cumulative (PR1; PR1+PR2; …), so
a PR that depends on another only needs to be *behind* it in the queue. A PR
declares `Depends-On: #123` in its body; `pr-gate` job `depends` fails until
#123 is merged or already queued ahead. Content that needs a translation
record goes in one PR when it can; otherwise the translation PR queues first.

Ejection: when a group fails, GitHub removes the newest PR and retests the
rest. A `on: failure` step posts one comment to every PR in the group (numbers
parsed from the merge commits' `Merge pull request #N` messages):

- the failing step and target;
- the first `error:` with `file:line:col`, the source line, and the record name it came from;
- a plain-language hint keyed on the error class: unknown identifier (name or missing import in `context`), type mismatch, unsolved goals, `sorry`, forbidden syntax, axiom, heartbeats;
- the run URL and "re-queue after fixing".

`[AI later: enrich the hint.]`

## 6. Supply chain

- **Attested caches.** In `build.yml`, after `cache.sh put`, run `actions/attest-build-provenance@<sha>` with `subject-path: tengoku-cache.tar.zst.part-*` (`permissions: id-token: write, attestations: write`). Consumers verify before unpacking: `cache.sh get` runs `gh attestation verify <part> -R competemath/tengoku --signer-workflow competemath/tengoku/.github/workflows/build.yml` when `gh` exists, otherwise `cosign verify-blob-attestation --bundle <bundle> --certificate-identity-regexp 'https://github.com/competemath/tengoku/.github/workflows/build.yml@refs/heads/main' --certificate-oidc-issuer https://token.actions.githubusercontent.com <part>` with the bundle downloaded from the attestations API. Docker images install `cosign` (static binary, pinned by checksum). A cache that fails verification is refused; `pin.sh` stops. ([docs](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds), [action](https://github.com/actions/attest-build-provenance))
- **Publishing at the built commit.** `cache.sh put` tags the commit it built (`--target <sha>`). The sandbox showed GitHub refuses that for GITHUB_TOKEN when `.github/workflows/*` changed on `main` between the built commit and the tip (the tag is evaluated as a workflow-file change, and the job token can never hold the `workflows` permission). Content and promotion commits do not trigger it; a workflow PR merged during a running nightly does, and the next nightly recovers. If that is not acceptable, publish with a fine-grained PAT (`contents` + `workflows`) in a `CACHE_PUBLISH_TOKEN` secret, falling back to `github.token`.
- **`data/cache-latest.json`** committed by the nightly: `{tag, commit, published_at, parts: [{name, sha256}]}`. `cache.sh latest` reads it raw from GitHub, no API call, no rate limit. The listing API stays as fallback.
- **Workflow hygiene.** `permissions: {}` at workflow top; per-job least privilege; every action pinned to a commit SHA; `step-security/harden-runner@<sha>` first step with `egress-policy: block` and an allowlist (`github.com`, `api.github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org`, `sigstore.dev`, `fulcio.sigstore.dev`, `rekor.sigstore.dev`, `tuf-repo-cdn.sigstore.dev`, `huggingface.co`, `*.hf.space`); `actionlint` in `tooling-tests`.
- **Dependabot** (`.github/dependabot.yml`): `github-actions` weekly (the only dependency the tree has today); add `pip` if `requirements-dev.txt` appears.
- **Secrets**: none in the tree. `GH_TOKEN` in Docker builds is optional. `HF_TOKEN` lives only in the `cache-publish` environment. The notify job keeps working without it.
- **Bot identity**: a machine account `tengoku-bot` with write, no admin, no bypass; its token in the banking app's `.env` only; it pushes to `bank`, opens PRs, and auto-merge does the rest.

## 7. Local parity

- `.pre-commit-config.yaml` is the single source of truth. CI job `lint-python` runs `pre-commit run --all-files`; nothing else pins a linter version.
- Hooks: `ruff` (check + format, config in `pyproject.toml [tool.ruff]`), `check-json`, `check-added-large-files --maxkb=51200`, `end-of-file-fixer`, `gitleaks` (config `.gitleaks.toml`), local hooks `scripts/ci/lint-banked.py` and `scripts/ci/validate-records.py --staged`.
- `CONTRIBUTING.md`: `pre-commit install`, `git commit -s`, "one purpose per PR", "append to staging, build locally with `lake build <module>` before you push", how tombstones work, how the queue reports failures.

## 8. Scaling

- **Images clone only what they import.** `pin.sh` and the Dockerfiles use `git sparse-checkout set --no-cone /Tengoku /Tengoku.lean /lean-toolchain /lakefile.toml /scripts` after the blobless clone. Today every image materialises 2.7 GB of JSONL it never reads.
- **JSONL sharding.** Rule: a data file stays under 50 MB; the harvester writes `<library>.NN.jsonl`. GitHub rejects files over 100 MB; a `records` check enforces the limit before that.
- **Tentative out of the tree** (phase 4): move `data/tentative/` to `competemath/tengoku-tentative`, fetched by the harvester and the site importer. The library repo keeps staging and trusted. Clones and diffs shrink by 90%.
- **Queue throughput.** Group max 5, concurrency 2: five PRs per ~20 min run; the nightly cache keeps the delta per build to the PR's own modules. If the queue backs up, raise group max first.
- **Actions minutes** are unlimited for public repositories; the heavy job stays in the queue, not on every push.

## 9. Test inventory

| Node | Today | Keep? | Catches | Cost |
|---|---|---|---|---|
| nightly `lake build` + `sorry` grep | yes | yes, authority for trusted | anything that does not compile | 20–40 min nightly |
| cache publish + prune | yes | yes, plus attestation and `cache-latest.json` | consumers building from scratch | in nightly |
| promote loop candidate build | yes | yes | staging records that do not build | 1–5 min per file |
| `stats.py`, `derive.py` unit tests | yes | yes, run in `tooling-tests` | script regressions | seconds |
| extractor smoke | yes | yes, in `tooling-tests` | extractor API drift with Lean versions | 30 s |
| search golden eval | site repo | advisory there, not here | ranking regressions | minutes |
| `classify`, `append-only`, `credits`, `records`, `content-lint`, `secrets` | new | blocking | the whole threat table's contributor row | seconds |
| `queue-gate` build + axioms + regeneration | new | blocking | wrong or weakened proofs, hand-edited derived files | 5–25 min per group |
| attestation verify in `cache.sh get` | new | blocking on consumers | forged caches | 1 s |
| `sorry-advisory` | new | advisory | contributor guidance | seconds |
| `actionlint`, `harden-runner`, Dependabot | new | blocking / weekly | workflow bugs, egress, stale actions | seconds |

## 10. Not locking yourself out

- No bypass actors. The escape hatch is disabling a ruleset in Settings, which is logged and reversible. Used once in the sandbox on 2026-09-15: the first `pr-gate.yml` had a YAML error, so the required check could never report and its own fix could not merge; the ruleset was disabled for one push and re-enabled. Lesson for the order of work: land workflows on `main` *before* making them required checks.
- Required checks are all deterministic and self-contained. The Neon index, the Spaces and the promote loop are never required checks.
- Break-glass admin account with a hardware key, offline.
- Quarterly drill: disable, push a trivial commit, re-enable, open a real PR, confirm every required check runs.
- The agent's identity holds none of the above.

## 11. Order of work

1. Sandbox repo; rulesets, squash-only, linear history, DCO app, secret scanning + push protection, Dependabot. Acceptance: a direct push to `main` is rejected; an unsigned commit fails DCO.
2. `pr-gate.yml` with jobs 1–5, 7, 10. Acceptance: a two-purpose PR fails `classify`; a deletion in `data/staging` fails `append-only`; a record with `#eval` fails `content-lint`.
3. Pre-commit parity, `tooling-tests`, `sorry-advisory`. Acceptance: `pre-commit run --all-files` locally and in CI produce identical output.
4. Merge queue + `queue-gate.yml` with ejection comments. Acceptance: a queued PR with a broken proof is ejected with the exact line quoted.
5. Attested caches, `cache-latest.json`, verify in `cache.sh get`, sparse checkout in images, `harden-runner`. Acceptance: a tampered part is refused by `pin.sh`.
6. Bot account and `bank` branch auto-merge; retire direct pushes from the promote loop. Acceptance: the loop's commits arrive as merged PRs.
7. Your green light; port 1–6 to `competemath/tengoku`; JSONL sharding; tentative repo split.
