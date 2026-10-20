# driver-health

How the Leak driver behaves on a hard target, measured, so that harnesses and prompts can be compared instead of argued about.

`score.mjs` reads one run transcript (`~/.leak-runs/<run>.jsonl`, the bridge's own record, which since this change holds the whole prompt, the agent's whole text, the whole script it submitted and what the memory saved) and prints a reading:

```
node tools/driver-health/score.mjs ~/.leak-runs/2026-10-20T14-17-10-562Z-erdos_396.jsonl
```

**Healthy signs** (counted): verify calls per ten minutes and the longest stretch without one; lemmas saved with free parameters (a binder or a quantifier in the statement) as against bare instances (a witness for one k); library searches; Leak II goal stepping; recalls; questions, conjectures and "why"/"what if"/"I suspect"/"interesting" in the agent's own prose; `NOTE:`/`NEXT:` lab notes at the end of a stretch.

**Red flags** (counted): calling the problem open, impossible, out of reach, or saying it is stopping or has no route; appeals to status, literature or others' results; `curl`/`wget`/URLs in the shell; commands that sleep or loop waiting; sweeps over large ranges; shell calls over two minutes; ten minutes without a verify call; pauses with no `NEXT` line. Infrastructure trouble (MCP tool timeouts, "no matching tools") is listed on its own, because it is the servers', not the agent's.

The verdict is `healthy` (no hard flag, verifies at least once per five minutes, at least one general lemma, some curiosity, every pause closed with a note), `quiet` (no hard flag, but not enough of the rest) or `red`.

`trial.mjs` runs one timed trial of a harness: the bridge from this checkout on its own port, the real `claude` CLI (your login), the remote Leak servers, Sonnet 5.5 only, a few minutes, then the score. It appends a line to `~/.leak-runs/.trials/trials.jsonl` and keeps the raw frames next to it.

```
node tools/driver-health/trial.mjs --strategy control-honoured-iv --voice curious --minutes 20
node tools/driver-health/trial.mjs --strategy control-lucid-iv --voice order --minutes 20 --label baseline
```

`--opt key=value` passes any other run option (for example `--opt minAttemptMs=0`). Nothing is downloaded or installed: the bridge's hook blocks that for the agent, and the trial uses only what is already on the machine.

## The voices

`public/leak-memory.mjs` holds two voices, chosen per run by `options.voice`:

- `curious` (the default): a mathematician who has adopted the problem. The question is theirs, its name is a label, nothing elsewhere about it is part of the run (the shell hook blocks the web). They move between attacking the statement, building its foundations, and changing the setting with a verified bridge back. Each stretch closes with `NOTE:` and `NEXT:`; on resume the run hands those notes back and offers one new question from a rotating list. Nothing calls the problem open, hard or unsolved; a pause that announces the problem cannot be done is "not something we do here, because it is not something we know".
- `order`: the earlier standing order (keep going, do not conclude it is open, no brute force), kept for comparison.

The trials that led here are recorded in `docs/driver-trials.md`.
