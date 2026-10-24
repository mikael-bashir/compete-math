"""The ATP tools' logic, separate from the MCP layer so that it can be tested without FastMCP or a Vampire binary (tests point VAMPIRE_BIN at a stand-in)."""
from __future__ import annotations

from typing import Any

from lab_common.arith import LabError
from lab_common.shape import clip, fail, fit, ok

from . import models, proofs, theories, tptp, vampire


def problem_text(problem: str | None, axioms: list[str] | None, conjecture: str | None, language: str, theory=None) -> str:
    if problem and (axioms or conjecture):
        raise LabError("give either `problem` (a full TPTP text) or `axioms` (+ `conjecture`), not both")
    if theory and language != "fof":
        raise LabError("named theories are first-order (language 'fof'); for typed problems write the axioms out")
    head = "".join(f"fof({name}, axiom, ({f})).\n" for name, f in theories.theory_axioms(theory))
    if problem:
        tptp.check_problem_text(problem)
        return head + (problem if problem.endswith("\n") else problem + "\n")
    if not axioms and not conjecture and not head:
        raise LabError("give `problem`, or `axioms` and a `conjecture`, or a `theory`")
    body = tptp.build_problem(axioms or [], conjecture, language) if (axioms or conjecture) else ""
    return head + body


def exact_size_axiom(n: int) -> str:
    """'there are exactly n elements', as a first-order sentence the model builder understands (n distinct witnesses that cover everything)."""
    if not 1 <= n <= 16:
        raise LabError("size must be between 1 and 16")
    xs = [f"X{i}" for i in range(n)]
    distinct = " & ".join(f"{a} != {b}" for i, a in enumerate(xs) for b in xs[i + 1 :]) or "$true"
    cover = " | ".join(f"Y = {x}" for x in xs)
    return f"fof(exact_size, axiom, (?[{','.join(xs)}]: (({distinct}) & ![Y]: ({cover}))))."


def statements(text: str) -> list[tuple[str, str, str]]:
    """(name, role, formula) of every fof statement in a problem text."""
    out = []
    for st in proofs.split_statements("\n".join(ln for ln in text.splitlines() if not ln.lstrip().startswith("%"))):
        m = proofs.HEAD.match(st)
        if not m or m.group(1) != "fof":
            continue
        args = proofs._top_level_args(st[st.index("(") + 1 : st.rindex(")")])
        if len(args) >= 3:
            out.append((args[0], args[1], args[2].strip()))
    return out


def lean_check_for(model_text: str | None, text: str) -> dict:
    """The model Vampire printed as {size, summary, lean_check} (a script Leak IV can verify), or why no script could be made."""
    m = models.parse_model(model_text or "")
    if m is None:
        return {}
    res = {"domain_size": m.size, "model": models.summarise(m)}
    stm = statements(text)
    axs = [(n, f) for n, role, f in stm if role == "axiom" and n != "exact_size"]
    goals = [f for _, role, f in stm if role == "conjecture"]
    try:
        res["lean_check"] = models.lean_skeleton(m, axs, goals[0] if goals else None)
    except LabError as e:
        res["lean_check_unavailable"] = str(e)
    return res


def _common(out: vampire.Outcome) -> dict[str, Any]:
    d: dict[str, Any] = {"verdict": out.verdict, "szs_status": out.szs, "seconds": out.seconds, "stats": out.stats}
    if out.verdict in ("no_answer", "error", "input_error"):
        d["vampire_said"] = out.stderr_tail or "(nothing on stderr)"
    return d


def prove(problem=None, axioms=None, conjecture=None, language="fof", strategy="default", time_limit_s=10, options=None, show_proof=True, theory=None) -> dict:
    try:
        text = problem_text(problem, axioms, conjecture, language, theory)
        argv = vampire.build_argv(mode=strategy, time_limit_s=time_limit_s, options=options)
    except LabError as e:
        return fail(str(e))
    out = vampire.run(argv, text)
    res = _common(out)
    note = None
    if out.proof:
        steps = proofs.parse_proof(out.proof)
        summ = proofs.summarise(steps, show=40)
        res.update({"axioms_used": summ["axioms_used"], "proof_steps": summ["steps"], "rules": summ["rules"]})
        if show_proof:
            res["proof"] = clip(out.proof, 6000, "proof")
        lean = proofs.lean_guidance(summ)
    elif out.verdict in ("countermodel", "satisfiable"):
        lean = "the conjecture does NOT follow from the axioms as written (Vampire saturated without a refutation). Check the encoding, then use find_countermodel to see a structure where it fails: that is a Lean counterexample."
        note = "'countermodel' is only trustworthy if the problem is a complete encoding; Vampire is complete for first-order logic, so a saturation without refutation is a real countermodel of THIS formulation."
    elif out.verdict == "timeout":
        lean = "no information: try a longer limit, strategy='casc', avatar on/off, or a stronger set of axioms."
    else:
        lean = "no proof was produced."
    return ok(res, lean=lean, note=note)


def find_countermodel(problem=None, axioms=None, conjecture=None, language="fof", time_limit_s=20, start_size=1, options=None, theory=None, size=None) -> dict:
    opts = {"saturation_algorithm": "fmb", "fmb_start_size": size or start_size, **(options or {})}
    try:
        text = problem_text(problem, axioms, conjecture, language, theory)
        if size is not None:
            text += exact_size_axiom(size) + "\n"
        argv = vampire.build_argv(mode="default", time_limit_s=time_limit_s, options=opts, proof=False)
    except LabError as e:
        return fail(str(e))
    out = vampire.run(argv, text)
    res = _common(out)
    if out.model:
        found = lean_check_for(out.model, text)
        if found:
            res.update(found)
        else:
            res["model_text"] = clip(out.model, 5000, "model")
    lean = {
        "countermodel": "a finite structure where the axioms hold and the conjecture fails. `lean_check` is a COMPLETE Lean script for it (the tables, a `decide` proof of every axiom, a `decide` proof that the conjecture fails): verify it with verify_full_script. Then the claim is refuted for that theory; to use the refutation inside a Lean proof, turn the tables into the structure the claim is about (for a group, give a Group instance on a wrapper of Fin n).",
        "satisfiable": "a finite model of the axioms (they are consistent). `lean_check` is a Lean script that verifies it by `decide`.",
        "proved": "no countermodel exists: the conjecture follows from the axioms. Run `prove` to get the refutation proof.",
        "proved_unsat": "the axioms are contradictory (no model exists).",
    }.get(out.verdict, "no model was found within the limit: that does not mean none exists (models can be larger or infinite). Try a longer limit, or a different `size`.")
    if size is not None and out.verdict == "gave_up":
        # With the size fixed the model builder searches that one size and, finding nothing, answers GaveUp at once (not "unsatisfiable"): it is exhaustive.
        res["no_model_of_size"] = size
        lean = f"NO model with exactly {size} elements exists for these axioms and this conjecture (the model builder exhausted that size). If the conjecture is a claim about ALL such structures, it holds at order {size}; try other sizes, or `prove`."
    if size is not None and out.verdict in ("countermodel", "satisfiable") and res.get("domain_size") not in (None, size):
        lean = f"NO model of exactly {size} elements exists: the smallest one the builder found has {res.get('domain_size')}. " + lean
        res["exact_size_requested"] = size
    return ok(res, lean=lean)


def check_consistency(problem=None, axioms=None, language="fof", time_limit_s=20, theory=None) -> dict:
    try:
        text = problem_text(problem, axioms, None, language, theory)
    except LabError as e:
        return fail(str(e))
    half = max(1, time_limit_s // 2)
    fmb = vampire.run(vampire.build_argv(time_limit_s=half, options={"saturation_algorithm": "fmb"}, proof=False), text)
    if fmb.verdict in ("satisfiable", "countermodel"):
        return ok({"consistent": True, "evidence": "finite model found", **(lean_check_for(fmb.model, text) or {"domain_size": vampire.model_domain_size(fmb.model)}), "seconds": fmb.seconds},
                  lean="the axioms hold in a finite structure, so they cannot contradict each other; in Lean give the structure on `Fin n` and check each axiom by `decide`")
    ref = vampire.run(vampire.build_argv(time_limit_s=time_limit_s - half or 1), text)
    if ref.verdict in ("proved", "proved_unsat", "axioms_contradictory"):
        return ok({"consistent": False, "evidence": "Vampire derived a contradiction", "axioms_used": proofs.summarise(proofs.parse_proof(ref.proof or ""))["axioms_used"] if ref.proof else [], "seconds": ref.seconds},
                  lean="the axioms are inconsistent: some of them are false in the intended structure. Find which with unsat_core, then fix the encoding.")
    return ok({"consistent": None, "evidence": "neither a finite model nor a contradiction was found", "first_attempt": fmb.verdict, "second_attempt": ref.verdict}, lean="undecided: infinite models are possible (for example arithmetic)")


def unsat_core(problem=None, axioms=None, conjecture=None, language="fof", time_limit_s=10, options=None, theory=None) -> dict:
    try:
        text = problem_text(problem, axioms, conjecture, language, theory)
        argv = vampire.build_argv(time_limit_s=time_limit_s, options=options)
    except LabError as e:
        return fail(str(e))
    out = vampire.run(argv, text)
    if not out.proof:
        return ok({"verdict": out.verdict, "core": None}, lean="no refutation, so no core: see `prove` for what Vampire said", note="a core is only defined when a proof was found")
    summ = proofs.summarise(proofs.parse_proof(out.proof))
    named: dict[str, str] = {}
    for line in text.splitlines():
        import re

        m = re.match(r"^\s*(?:fof|tff|cnf)\(\s*([\w$]+)\s*,\s*axiom\s*,\s*(.*)\)\s*\.\s*$", line)
        if m:
            named[m.group(1)] = m.group(2)
    core = summ["axioms_used"]
    return ok({"verdict": out.verdict, "core": core, "core_size": len(core), "of_total_axioms": len(named), "formulas": {n: named.get(n, "(from the problem file)")[:300] for n in core}, "unused": [n for n in named if n not in core][:50]},
              lean="the conjecture follows from the core alone: prove only those as Lean lemmas, and use them (and nothing else) in the final `simp only [..]`/`grind`/`calc`")


def clausify(problem=None, axioms=None, conjecture=None, language="fof", theory=None) -> dict:
    try:
        text = problem_text(problem, axioms, conjecture, language, theory)
        argv = vampire.build_argv(time_limit_s=10, proof=False, extra=vampire.CLAUSIFY_RAW)
        argv[argv.index("--mode") + 1] = "clausify"
    except LabError as e:
        return fail(str(e))
    return ok(_clausify_result(argv, text), lean="clauses are the normal form Vampire works on: useful to see what your formula really says (skolem functions appear as sK0, sK1, ...)")


def _clausify_result(argv, text) -> dict:
    from lab_common.limits import Limits, run_limited

    res = run_limited(argv, stdin=text, limits=Limits(wall_s=15, memory_bytes=3072 * 1024 * 1024))
    body = res.stdout
    n = body.count("cnf(")
    # Vampire prints its parse errors on stdout (a "parse error in ..." line), other complaints on stderr
    complaint = res.stderr.strip()[-300:] or ("" if n else body.strip()[-300:])
    return {"clause_count": n, "clauses": clip(body, 6000, "clauses"), "ok": res.returncode == 0 or n > 0, "stderr": complaint}


def check_syntax(problem=None, axioms=None, conjecture=None, language="fof", theory=None) -> dict:
    r = clausify(problem, axioms, conjecture, language, theory)
    if not r.get("ok"):
        return r
    res = r["result"]
    if res["clause_count"] == 0 and res["stderr"]:
        return ok({"parses": False, "message": res["stderr"]}, lean="fix the formula: variables start with a capital letter, constants and predicates with a lowercase one, quantifiers are ![X]: and ?[X]:")
    return ok({"parses": True, "clause_count": res["clause_count"]})


def explain_proof(proof: str, show: int = 60) -> dict:
    try:
        steps = proofs.parse_proof(proof)
    except LabError as e:
        return fail(str(e))
    if not steps:
        return fail("no proof steps found", "paste the text between '% SZS output start Proof' and '% SZS output end Proof'")
    s = proofs.summarise(steps, show=max(1, min(show, 200)))
    return ok(s, lean=proofs.lean_guidance(s))


def options_table() -> dict:
    rows = []
    for k, v in vampire.OPTIONS.items():
        rows.append({"option": k, "takes": v.get("values") or (f"whole number {v['min']}..{v['max']}" if v["kind"] == "range" else "ratio age:weight"), "what_it_does": v["doc"]})
    return ok({"options": rows, "modes": {"default": "Vampire's own default strategy for the time limit", "casc": "the competition mode: a schedule of different strategies one after another inside the time limit (use for hard problems)"},
               "how_to_set": "pass options={'avatar': 'off', 'age_weight_ratio': '1:10'} to prove, unsat_core or find_countermodel"})


def theories_table() -> dict:
    rows = []
    for name, t in theories.THEORIES.items():
        rows.append({"theory": name, "symbols": t["symbols"], "means": t["about"], "mathlib_class": t["lean"], "axioms": [{"name": f"{name}_{n}", "formula": f} for n, f in t["axioms"]]})
    return ok({"theories": rows, "how_to_use": "pass theory='group' (or a list such as ['group'], never two that share symbols with different meanings) to prove, find_countermodel, check_consistency, unsat_core, clausify or check_syntax; add your own axioms with `axioms`, and the claim as `conjecture`, using the symbol names listed here",
               "reading_a_model": "in a model, mul(a,b) is the product, e the identity, inv(a) the inverse, and element k of the Lean script's Fin n is Vampire's k+1-th element"})
