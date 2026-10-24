"""The ATP tools' logic, separate from the MCP layer so that it can be tested without FastMCP or a Vampire binary (tests point VAMPIRE_BIN at a stand-in)."""
from __future__ import annotations

from typing import Any

from lab_common.arith import LabError
from lab_common.shape import clip, fail, fit, ok

from . import proofs, tptp, vampire


def problem_text(problem: str | None, axioms: list[str] | None, conjecture: str | None, language: str) -> str:
    if problem and (axioms or conjecture):
        raise LabError("give either `problem` (a full TPTP text) or `axioms` (+ `conjecture`), not both")
    if problem:
        tptp.check_problem_text(problem)
        return problem if problem.endswith("\n") else problem + "\n"
    if not axioms and not conjecture:
        raise LabError("give `problem`, or `axioms` and a `conjecture`")
    return tptp.build_problem(axioms or [], conjecture, language)


def _common(out: vampire.Outcome) -> dict[str, Any]:
    d: dict[str, Any] = {"verdict": out.verdict, "szs_status": out.szs, "seconds": out.seconds, "stats": out.stats}
    if out.verdict in ("no_answer", "error", "input_error"):
        d["vampire_said"] = out.stderr_tail or "(nothing on stderr)"
    return d


def prove(problem=None, axioms=None, conjecture=None, language="fof", strategy="default", time_limit_s=10, options=None, show_proof=True) -> dict:
    try:
        text = problem_text(problem, axioms, conjecture, language)
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


def find_countermodel(problem=None, axioms=None, conjecture=None, language="fof", time_limit_s=20, start_size=1, options=None) -> dict:
    opts = {"saturation_algorithm": "fmb", "fmb_start_size": start_size, **(options or {})}
    try:
        text = problem_text(problem, axioms, conjecture, language)
        argv = vampire.build_argv(mode="default", time_limit_s=time_limit_s, options=opts, proof=False)
    except LabError as e:
        return fail(str(e))
    out = vampire.run(argv, text)
    res = _common(out)
    if out.model:
        res["domain_size"] = vampire.model_domain_size(out.model)
        res["model"] = clip(out.model, 5000, "model")
    lean = {
        "countermodel": "a finite structure where the axioms hold and the conjecture fails. In Lean: define the structure on `Fin n` (or `ZMod n`), prove each axiom by `decide`, and the negation of the conjecture by `decide`. That refutes the claim for good.",
        "satisfiable": "a finite model of the axioms (they are consistent). In Lean it is an instance on `Fin n`/`ZMod n` checked by `decide`.",
        "proved": "no countermodel exists: the conjecture follows from the axioms. Run `prove` to get the refutation proof.",
        "proved_unsat": "the axioms are contradictory (no model exists).",
    }.get(out.verdict, "no model was found within the limit: that does not mean none exists (models can be larger or infinite). Try a longer limit or a different start size.")
    return ok(res, lean=lean)


def check_consistency(problem=None, axioms=None, language="fof", time_limit_s=20) -> dict:
    try:
        text = problem_text(problem, axioms, None, language)
    except LabError as e:
        return fail(str(e))
    half = max(1, time_limit_s // 2)
    fmb = vampire.run(vampire.build_argv(time_limit_s=half, options={"saturation_algorithm": "fmb"}, proof=False), text)
    if fmb.verdict in ("satisfiable", "countermodel"):
        return ok({"consistent": True, "evidence": "finite model found", "domain_size": vampire.model_domain_size(fmb.model), "model": clip(fmb.model or "", 3000, "model"), "seconds": fmb.seconds},
                  lean="the axioms hold in a finite structure, so they cannot contradict each other; in Lean give the structure on `Fin n` and check each axiom by `decide`")
    ref = vampire.run(vampire.build_argv(time_limit_s=time_limit_s - half or 1), text)
    if ref.verdict in ("proved", "proved_unsat", "axioms_contradictory"):
        return ok({"consistent": False, "evidence": "Vampire derived a contradiction", "axioms_used": proofs.summarise(proofs.parse_proof(ref.proof or ""))["axioms_used"] if ref.proof else [], "seconds": ref.seconds},
                  lean="the axioms are inconsistent: some of them are false in the intended structure. Find which with unsat_core, then fix the encoding.")
    return ok({"consistent": None, "evidence": "neither a finite model nor a contradiction was found", "first_attempt": fmb.verdict, "second_attempt": ref.verdict}, lean="undecided: infinite models are possible (for example arithmetic)")


def unsat_core(problem=None, axioms=None, conjecture=None, language="fof", time_limit_s=10, options=None) -> dict:
    try:
        text = problem_text(problem, axioms, conjecture, language)
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


def clausify(problem=None, axioms=None, conjecture=None, language="fof") -> dict:
    try:
        text = problem_text(problem, axioms, conjecture, language)
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


def check_syntax(problem=None, axioms=None, conjecture=None, language="fof") -> dict:
    r = clausify(problem, axioms, conjecture, language)
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
