# Driver trials on Erdős 396

Timed live trials of the memory harness on the open target, scored with `tools/driver-health/score.mjs`. Driver: Sonnet 5.5 (`claude-sonnet-5-5`). Servers: the public Leak I, II and IV. Library: the target's six seed lemmas, nothing else. The question each trial answers: does the driver behave like a mathematician who wants to understand the problem (curious, verifying, building, honest) rather than a contractor reporting that it cannot be done?

What the earlier runs looked like, for comparison (scored on their transcripts): the 2026-10-18 Lucid run, 5 h: 28 defeatist statements, 19 web lookups, 30 polling commands, 100 min at one point without a verify call. The 2026-10-20 11:58 run, 107 min: 10 brute-force sweeps, 8 shell calls over two minutes, 45 min without a verify call. The 2026-10-20 13:46 run (order voice), 29 min: 11 defeatist statements, 4 web lookups, 20 pauses with no next step. All three: red.

## Trial 1 — curious voice, Honoured-IV, 15 min (2026-10-20 14:17 UTC)

Verdict: quiet (no flag against the agent; too short to see pauses and resumes). Cost $1.60.

- Leak IV had just restarted; the first verify call hit the CLI's 300 s tool timeout. The agent wrote "the first call may have hit a cold start" and retried. (Infrastructure, flagged as such.)
- It probed the library with `exact?` to find the divisibility-by-valuations criterion, then saved a clean bridge lemma `descFactorial_dvd_centralBinom_iff` (general: n, k free).
- Searched for the valuation of `centralBinom` (loogle twice, moogle once), found `Nat.factorization_choose_le_log`, and from it wrote down an obstruction: a witness n must satisfy p^(v_p of the product) ≤ 2n for every p, "so n ≳ 2^k". It was proving that (`E396_necessary`) when the clock ended.
- 7 verify calls in 15 min, 3 searches, 2 recalls, no shell commands at all, no web, no brute force, nothing called open. Terse prose; the one long silence (minutes 8 to 11) was the model thinking before the obstruction lemma.

Reading: this is the behaviour wanted, at a slow pace. The 15 minutes never reached a pause, so the lab-note mechanism was not exercised. Next: 25–30 minute trials, in parallel: curious Lucid-IV (t2), the order voice on the same harness as a baseline (t3), curious Honoured-IV for 30 min (t4).
