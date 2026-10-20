# lrr-sync

Records every Leak run made on this machine in `competemath/LRR` under `runs/<account>/`, automatically, in the shapes the other LRR folders already use.

The bridge (`public/local-claude-bridge.mjs`) writes one transcript per run to `~/.leak-runs/<UTC>-<slug>.jsonl`, plus a row in `~/.leak-runs/index.jsonl`. A finished run also leaves its end line (metrics, target, session mode) and, when it has them, `<run>.lean` (the verified proof) and `<run>.memory.json` (a memory run's library). `sync.mjs` reads those, scrubs secrets, and commits what is new to LRR.

## What lands in LRR

```
runs/<account>/
  README.md             totals per month and per strategy, regenerated
  index.jsonl           one flat line per run (leak-run-index/1): the file to load for trends
  <YYYY-MM>/
    METRICS.md          the month's table, like runs/<CODE>-<Account>/METRICS.md
    metrics.json        {run, note, items[]}: the same item keys as the other folders
    <run_id>.lean       the verified proof of a proved run
    logs/<run_id>.jsonl the transcript (gzipped over 25 MB)
    memory/<run_id>.json  a memory run's saved theorems (leak-run-memory/1)
```

Item keys follow LRR (`seq, problem_id, status, refuted, cost_usd, started_at, finished_at, wall_ms, attempts, error_message, metrics{…}, has_proof, run_log`) with `strategy, model, target_id, variant, session_mode, reason, answer, memory_run, files, also_in` added.

**Null means unrecorded.** Runs from before the bridge wrote end-line metrics are backfilled from their transcript and index row: `metrics_source` is `derived`, `backfilled` is `true`, and anything the old bridge never counted (tokens, LLM invocations, …) is `null`, never `0`. `proof_source` says where a proof came from (`bridge`, `transcript`, or `proof-bank`); a proved run whose proof could not be recovered has `has_proof: false`. `memory_source` is `bridge`, `reconstructed`, or `null` (older memory runs did not log their saves).

**Pointers.** A transcript LRR already holds in another folder (the first line matches) is not stored twice: the item has `also_in` and `run_log: null`.

## Guarantees

- Append-only and confined: it only writes under `runs/<account>/`, and `git status` is checked before every commit; anything else aborts it.
- Secrets: transcripts and sidecars are scrubbed (`[REDACTED:kind]`: GitHub, Anthropic and OpenAI keys, AWS, Slack, JWT, bearer and auth headers, `*_TOKEN=`-style assignments, URL credentials, private keys), and a file in which a credential pattern survives is not written.
- Crash-safe and repeatable: a run is marked done only after the push succeeds; a lock stops two syncs at once; the output is deterministic, so running it twice changes nothing; a refused push is retried from the remote's new head.
- A run still being written is left alone; one with no end line that has been quiet for 2 hours is recorded as `interrupted`.

## Setup (once)

1. Make a deploy key that reaches only `competemath/LRR` with write access (the organisation must allow deploy keys: Member privileges → Deploy keys):
   `ssh-keygen -t ed25519 -N "" -C lrr-sync -f ~/.ssh/lrr_sync_ed25519`, then add `~/.ssh/lrr_sync_ed25519.pub` at `https://github.com/competemath/LRR/settings/keys/new` with *Allow write access*. The private half never leaves this machine.
2. Look before writing anything: `node tools/lrr-sync/sync.mjs sync --dry-run --account <account> --key ~/.ssh/lrr_sync_ed25519`
3. Install the job: `sh tools/lrr-sync/install.sh --account <account>`. It syncs every 15 minutes and whenever `index.jsonl` changes; the first run is the backfill. Log: `~/.leak-runs/.lrr-sync.log`.

`node tools/lrr-sync/sync.mjs status` shows what is recorded and what is pending. `sh tools/lrr-sync/install.sh --uninstall` removes the job.

## Tests

`pnpm test` runs `tests/lrr/*.test.mjs` (scrubbing with seeded fake credentials, the transcript → item rules, a real git repository standing in for LRR: backfill, incremental, idempotence, refused pushes, locks, size limits, confinement, the installer) and the `live-bridge` scenario that checks the bridge writes the end line, `.lean`, `.memory.json` and runs `LEAK_RUN_HOOK`. CI uses no secrets and no network.
