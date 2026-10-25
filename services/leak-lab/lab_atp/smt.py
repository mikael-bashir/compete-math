"""SMT-LIB and SAT through Z3 (run inside a limited child process by lab_atp.worker)."""
from __future__ import annotations

from typing import Any

from lab_common.arith import LabError
from lab_common.shape import clip, fail, fit, ok

MAX_TEXT = 200_000


def smt_check(smtlib2: str, timeout_ms: int = 10000, want_model: bool = True, unsat_core: bool = False) -> dict:
    import z3

    if len(smtlib2) > MAX_TEXT:
        return fail(f"the SMT-LIB text is longer than {MAX_TEXT:,} characters")
    if not 100 <= timeout_ms <= 60000:
        return fail("timeout_ms must be between 100 and 60000")
    s = z3.Solver()
    s.set("timeout", timeout_ms)
    if unsat_core:
        s.set(unsat_core=True)
    try:
        s.from_string(smtlib2)
    except z3.Z3Exception as e:
        return fail(f"Z3 could not read the SMT-LIB text: {str(e)[:300]}", "write declarations then (assert ...) commands; (check-sat) is optional")
    r = s.check()
    res: dict[str, Any] = {"status": str(r), "assertions": len(s.assertions())}
    if r == z3.sat and want_model:
        res["model"] = clip(str(s.model()), 4000, "model")
    elif r == z3.unsat and unsat_core:
        res["unsat_core"] = [str(c) for c in s.unsat_core()]
    elif r == z3.unknown:
        res["reason"] = s.reason_unknown()
    return ok(res, lean=_lean_hint(str(r)), note="Z3's answer is not a Lean proof. 'unsat' means the assertions contradict each other; to use it, find the argument (omega for linear integer arithmetic, nlinarith/polyrith-style certificates, interval_cases) and verify that in Lean.")


def _lean_hint(status: str) -> str:
    if status == "sat":
        return "a model is a witness: plug its values into the statement and close with `norm_num`/`decide`; that is a Lean proof of the existential"
    if status == "unsat":
        return "linear integer or rational arithmetic that is unsatisfiable is usually `omega` or `linarith`; nonlinear needs `nlinarith [..]` with the right products, or a certificate from ideal_certificate"
    return "no conclusion"


def sat_check(clauses: list[list[int]], max_models: int = 1) -> dict:
    """DIMACS-style CNF: each clause is a list of non-zero integers, a negative one is a negated variable."""
    import z3

    if not clauses or len(clauses) > 200_000 or any(not c or any((not isinstance(x, int)) or x == 0 for x in c) for c in clauses):
        return fail("give 1 to 200,000 clauses, each a non-empty list of non-zero integers")
    nv = max(abs(x) for c in clauses for x in c)
    if nv > 100_000:
        return fail("at most 100,000 variables")
    vs = {i: z3.Bool(f"x{i}") for i in range(1, nv + 1)}
    s = z3.Solver()
    s.set("timeout", 20000)
    for c in clauses:
        s.add(z3.Or(*[vs[x] if x > 0 else z3.Not(vs[-x]) for x in c]))
    r = s.check()
    res: dict[str, Any] = {"status": str(r), "variables": nv, "clauses": len(clauses)}
    if r == z3.sat:
        m = s.model()
        res["model_true_variables"] = fit([i for i in vs if z3.is_true(m.eval(vs[i], model_completion=True))], 3000)
    return ok(res, lean=_lean_hint(str(r)), note="a SAT answer is a search result. A satisfying assignment is a witness; 'unsat' has no certificate here, so state the finite fact in Lean and let `decide` (small) or a case split re-derive it")
