# Local harness

Run the whole Leak prover stack on your own machine — no connection to
competemath.com required except a single non-blocking report when a theorem
gets proven.

## 1. Start the Leak-I/II/IV containers

```bash
docker compose up --build
```

First run builds a full Lean 4 + Mathlib toolchain per service (multiple GB
each) — expect this to take a while. Subsequent runs reuse the Docker layer
cache and start in seconds.

This exposes:
- Leak-I (lemma search) — `http://localhost:8011`
- Leak-II (proof-state daemon) — `http://localhost:8012`
- Leak-IV (script verification) — `http://localhost:8014`

## 2. Start the bridge

In a separate terminal, anywhere:

```bash
npm install -g @anthropic-ai/claude-code
claude login   # once, if you haven't already
curl -fsSL https://competemath.com/local-claude-bridge.mjs -o claude-bridge.mjs
node claude-bridge.mjs
```

The bridge prints its own bridge token and port (default `4123`) on startup.

## 3. Open the local UI

Visit `http://localhost:4123` in a browser. Type a theorem, pick a model, hit
Prove — the bridge drives your locally logged-in Claude Code CLI against the
three containers from step 1, entirely on your machine.

Whenever a proof comes back verified, the bridge fires a single non-blocking
`POST` to CompeteMath's submission inbox (`/api/leak/submissions`) with the
theorem and proof, then moves on — nothing waits on that call succeeding, and
nothing about proving locally requires ever visiting competemath.com.

## Notes

- Override the container ports in `docker-compose.yml` if 8011/8012/8014 are
  already taken on your machine — just keep the bridge UI's three URL fields
  (Leak-I/II/IV) in sync with whatever you change them to.
- Override where proofs get reported with `LEAK_SUBMISSION_ENDPOINT` if
  you're pointing the bridge at a different CompeteMath deployment.
- The bridge binds `127.0.0.1` only — nothing here is reachable off your
  machine unless you deliberately expose it yourself.
