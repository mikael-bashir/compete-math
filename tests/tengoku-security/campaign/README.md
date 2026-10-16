# Overnight campaign against competemath/tengoku-sandbox (2026-09-15/16)

Scenario runners for the Tengoku security rework, kept as they ran. Paths
inside point at the session's work clone (`~/tengoku-sandbox-work`) and
scratchpad; adjust `WORK` and `C` in `lib.sh` to rerun.

- `gate.sh` — 66 PR-gate scenarios with precondition checks and an expected failing job; `report.sh` polls and scores them.
- `queue.sh` — merge-queue scenarios: ejection classes one at a time, twelve clean PRs together, a broken PR between two clean ones, fix-and-re-queue, bulk promotion, a disguised hand edit.
- `guard*.sh` — the publish guard (a workflow file landing on `main` mid-build). Run 4 is the one that exercised the relaunch.
- `round2.sh`, `round3.sh` — re-runs after the fixes; `phase*.sh` — the chaining used overnight.
- `*-results.tsv`, `gate-report.txt`, `campaign.log` — what happened, minute by minute.

Findings and the fixes they led to are in `tests/tengoku-search/NOTES.md` ("Overnight campaign").
