# Leak Lab

The local tool servers behind **Leak Elation** and **Leak Misery**, two variants of Control IV Lucid (Leak I search, Leak II proof states, Leak IV compiler, the library, the sleep stage) that also have a laboratory.

| variant | lab it connects | what is in it |
|---|---|---|
| **Leak Elation** | `Leak_Lab_CAS` | 22 tools: exact number theory, modular arithmetic, dynamics of integer maps (Collatz and any map given by residue classes), polynomial algebra with Lean-checkable certificates, and tools that turn data into conjectures and try to break them |
| **Leak Misery** | `Leak_Lab_CAS` + `Leak_Lab_ATP` | everything in Elation, plus Vampire (first-order proving with AVATAR, finite model building, clausification, unsat cores, proof reading) and Z3 (SMT and SAT) |

Nothing in the lab proves anything for Tengoku. Leak IV (`verify_full_script`) is still the only judge. See [What can be proved, and with what](#what-can-be-proved-and-with-what).

## Start it

```bash
pnpm lab:elation        # or: node services/leak-lab/start.mjs elation
pnpm lab:misery         # adds the Vampire / SMT / SAT server; the first build compiles Vampire and takes several minutes
pnpm lab:status         # what answers
pnpm lab:stop
```

It prints the MCP URL of each server and what `docker inspect` says about the containment:

```
  Leak Lab CAS   http://127.0.0.1:8021/sse   up, 22 tools
  Leak Lab ATP   http://127.0.0.1:8022/sse   up, 10 tools
Contained: read-only filesystem, no capabilities, non-root, no outbound network (checked with docker inspect just now).
```

Then start the bridge (`node public/local-claude-bridge.mjs`) and choose **Leak Elation** or **Leak Misery** as the strategy. The bridge needs no configuration:

- its banner shows where it looks for the lab and whether it answers;
- each run asks the servers for their tools, adds them to the agent's tool set, and tells the agent only about the ones that answered. A server that is down is reported in the run (an error line with the command that starts it) and the run goes on without it;
- plain `http` is accepted for a lab server **only on this machine** (`127.0.0.1`, `localhost`, `[::1]`); any other address must be `https`. `LEAK_LAB_CAS_URL` and `LEAK_LAB_ATP_URL` change the addresses, and a server you registered in the app under the name `Leak_Lab_CAS` / `Leak_Lab_ATP` is used as registered.

Ports can be changed with `LAB_CAS_PORT` / `LAB_ATP_PORT` (set them for `start.mjs` and for the bridge).

## The tools

Every description is written to one template (use when / not for, limits, returns, Lean, example), every argument has a description, and `tests/test_docstrings.py` fails if one is missing.

**CAS (22):** `evaluate`, `factor`, `primes`, `arithmetic`, `base_digits`, `mod_pow`, `power_cycle`, `mod_order`, `unit_group`, `solve_congruence`, `crt`, `solve_polynomial_mod`, `map_orbit`, `map_scan`, `map_cylinders`, `map_cycles`, `polynomial`, `ideal_certificate`, `scan_predicate`, `tabulate`, `residue_histogram`, `guess_sequence`.

Maps are given as a name (`collatz`, `collatz_shortcut`), a family (`5n+1`, `3n-1_shortcut`, `3n+3`) or by pieces, `{"modulus": m, "pieces": [[a, b, d], ...]}` meaning `n = r (mod m) -> (a*n + b)/d`. `map_cylinders` gives, for every residue class, the exact affine map an orbit follows and the density of integers that provably come down within `k` steps. `map_cycles` solves the cycle equation for every itinerary up to a length and returns the complete list. Checked against known results in `tests/test_cas.py`: the 3n+1 cycles `{1,2}`, `{-1}`, `{-5,-7,-10}` and the 11-cycle through -136; the 3n-1 cycles through 1, 5 and 17; the 7-cycle of 5n+1 through 1; the modulus-233 facts an earlier Collatz run found by hand (order of 2 is 29, index 8, 3 is not in the subgroup).

**ATP (11):** `prove`, `find_countermodel`, `check_consistency`, `unsat_core`, `clausify`, `check_syntax`, `explain_proof`, `vampire_options`, `theories`, `smt_check`, `sat_check`. **Named theories and Lean scripts.** `theory='group'` (also semigroup, monoid, abelian_group, ring, comm_ring, partial_order, lattice) adds the axioms for you, with fixed symbols (`mul`, `e`, `inv`, `add`, `zero`, `neg`, `one`, `le`, `meet`, `join`). `find_countermodel` returns the model it found as tables and as `lean_check`: a complete Lean script (the tables on `Fin n`, `decide` proofs that each axiom holds and that the conjecture fails), made by a small TPTP-to-Lean translator (`lab_atp/fol_lean.py`). Scripts made by the real tool, through the real servers, for a group of order 6, a group of order 8 and the refutation of x*x = x in a commutative ring (Z/3) were compiled on Leak IV; the generated text for the first and for a 3-element order is kept as a golden test file, so any change to the generator has to be verified again. `size=n` asks for exactly n elements; with Vampire 5.1 a size with no model comes back at once as `GaveUp`, which the tool reports as `no_model_of_size`. Vampire's advanced options are an allow-list with fixed values (`vampire_options` lists them); a value can never be a file name or a second option, and `include(...)` in a problem is refused.

## How it is contained

```
bridge (your machine) ──► 127.0.0.1:8021 ──► cas-gate ──► [ lab_internal: no way out ] ──► cas
                          127.0.0.1:8022 ──► atp-gate ──►                                  atp
```

| layer | what | where it is enforced / checked |
|---|---|---|
| network | the tool servers are on a Docker network with `internal: true`: no route to the internet, your LAN, or the host. A gate (the same image, `python -m lab_common.gate`, 60 lines that copy bytes) is the only thing published, on `127.0.0.1` only | `docker-compose.yml`; `start.mjs` reads `docker network inspect` and refuses to say "contained" otherwise |
| container | read-only root filesystem, 128 MB non-executable tmpfs, all capabilities dropped, `no-new-privileges`, user 10001, pids/memory/CPU limits, no host mounts, not privileged | `docker-compose.yml`; `containmentProblems()` in `start.mjs` checks each from `docker inspect` (tested in `tests/leak-memory/lab-start.test.mjs`) |
| process | every computation runs in a child of its own under `setrlimit` (CPU, address space, file size, open files, processes) with a wall-clock kill of the whole process group; a Vampire run is the same | `lab_common/limits.py` (tested, including that grandchildren die) |
| input | text from the driver is never `eval`-ed or handed to a parser that evaluates Python. Expressions go through a whitelist reader (`lab_common/safe_expr.py`: numbers, a fixed function list, no attributes, no names outside the lab); polynomials through another; TPTP is wrapped, size-limited and `include`-free; SMT-LIB is only parsed | `tests/test_common.py`, `tests/test_cas.py` (an injection attempt is only text) |
| output | every answer has one shape and stays under 12,000 characters; the bridge additionally caps any tool result at 20,000 | `lab_common/shape.py` |

What this does **not** do: Docker is not a hard security boundary against a kernel exploit in a container runtime; a malicious *image supply chain* (the base images, pip packages, the Vampire source) is trusted at build time. Versions are pinned (Vampire by tag **and** commit, checked in the Dockerfile; Python packages by version) but not hash-locked; hash-locking `requirements.txt` with `pip-compile --generate-hashes` is the next step.

## What can be proved, and with what

Everything the lab says is an observation. A statement becomes a fact in Tengoku only when **Leak IV compiles Lean for it**, so the question is which parts of Lean's toolbox a lab insight may be handed to. The least vulnerable answer is: **the Lean kernel and Mathlib tactics that produce kernel terms, and nothing else**. The lab adds no trusted component to Tengoku, and no lab server runs there.

| lab output | what to prove it with in Lean | what is trusted |
|---|---|---|
| a prime, a factorisation, a primality claim | `Nat.Prime p` and `n = p * q` by `norm_num` | the kernel; `norm_num` extensions return proof terms |
| an order, a coset, a power cycle, a finite modular fact | `decide` on `ZMod m` (small `m`; the bridge refuses 5-digit numerals), `orderOf` lemmas, `Nat.ModEq` with `omega`/`norm_num` | the kernel |
| a polynomial identity, an `ideal_certificate` | `ring`, `linear_combination c1 * h1 + c2 * h2` (the tool prints the line; `ring` re-checks the coefficients) | the kernel; this is how a CAS insight enters Lean with **no** new component |
| "no counterexample up to N", "no cycle of length <= L" | `decide` over `Fin N`, `interval_cases n <;> omega`, or per itinerary with `omega` on the cycle equation | the kernel; the finite statement is what is proved, never the pattern beyond it |
| a Z3 `unsat` over linear arithmetic | `omega`, `linarith`; nonlinear: `nlinarith [..]` or an `ideal_certificate` | the kernel |
| a Z3 `sat` or a Vampire countermodel | the witness / the structure on `Fin n` or `ZMod n`, each axiom and the failed conjecture by `decide` | the kernel |
| a Vampire proof | read it with `explain_proof`, prove its `axioms_used` as lemmas, replay with `simp only`, `rw`, `grind`, `aesop`, `tauto` or a `calc`; the proof text itself is never pasted | the kernel; Vampire's output is advice |

**What to keep out**, and Tengoku's own content lint (`docs/tengoku-security-plan.md`, job 5) already does: `native_decide` and `bv_decide` (they trust the compiler through `Lean.ofReduceBool`), `#eval`, `run_cmd`, `run_tac`, `macro`, `syntax`, `elab`, `initialize`, `@[extern]`, `@[implemented_by]`, `unsafe`, `opaque`, `set_option` outside the allow-list, and any axiom beyond `propext`, `Classical.choice`, `Quot.sound` (the `tengoku-axioms` check). The lab's prompt tells the agent the same, and the bridge already refuses a kernel evaluation on a large numeral.

So the tools Tengoku must be able to *accept* for lab insights are a short list it already accepts: `norm_num`, `simp`, `omega`, `ring`, `linear_combination`, `linarith`/`nlinarith`/`positivity`, `decide` (small), `interval_cases`/`fin_cases`, `rcases`/`by_cases`, and for replaying prover proofs `aesop` and (if the tree's Lean has it) `grind`. Whether `grind` and `bv_decide` behave on Leak IV's Lean has **not** been tested; try `example : ... := by grind` through Leak IV before relying on it, and keep `bv_decide` out regardless.

Threats from the lab itself, because it is a new thing on your machine:

| threat | consequence | answer |
|---|---|---|
| a tool answers wrongly (a bug, a bad flag) | the agent chases something false | Leak IV re-checks everything that is submitted; a wrong lab answer costs time, never soundness |
| an answer contains text that tries to instruct the agent | prompt injection through a tool result | outputs are numbers and structured fields, and formulas the agent itself sent; the agent is told that lab output is observation. The same holds for the bridge's other tools |
| the agent sends a computation that never ends or eats memory | the machine slows | rlimits + wall-clock kill per call, memory/CPU/pids limits on the container |
| the agent tries to read files or reach the network through a tool | data leaves the machine | no file input exists in any tool; `include` is refused; the container has no outbound route and no host mount |
| code execution inside a tool | arbitrary code in the container | whitelist readers instead of `eval`; the container is non-root, read-only, capability-free and cannot reach anything |

## Tests, and what has and has not been run

```bash
pnpm test:lab        # python unittest for the services + the node tests for the variants and start.mjs
node tests/leak-memory/live-bridge.mjs     # the bridge end to end, including the Elation / Misery scenarios
```

Run for this change: the Python suite (78 tests; the memory and CPU limit tests run only on Linux, the Z3 tests only where `z3-solver` is installed), `docker compose config` on both profiles (syntax only), the node tests, and the full bridge scenarios against fake lab servers.

**Not run here:** `docker build` and `docker run` of either image (needs network downloads: base images, apt, pip, the Vampire source), so the FastMCP server modules have not been imported or served, Vampire has not been built, and its flags have not met the real binary. Two guards exist for that: each Dockerfile runs a self-test at build time (`lab_cas/selftest.py`, `lab_atp/selftest.py`: against the real Vampire and Z3 it checks that every allowed option exists in `vampire --show_options`, that each documented example gives the documented answer, and that an injection attempt is refused), and the image will not build if any of them fails. Expect to fix a flag or a file name on the first build of the ATP image; the self-test says which.
