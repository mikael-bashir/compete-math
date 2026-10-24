"""Run at image build time against the REAL Vampire and Z3: every option we allow exists, the documented examples give the documented answers."""
from __future__ import annotations

import subprocess
import sys

from . import core, vampire
from .client import call


def expect(name: str, cond: bool, detail: object = "") -> None:
    print(("ok   " if cond else "FAIL ") + name, "" if cond else detail)
    if not cond:
        sys.exit(1)


def main() -> None:
    v = subprocess.run([vampire.BIN, "--version"], capture_output=True, text=True, timeout=20)
    print(v.stdout.strip() or v.stderr.strip())
    expect("vampire runs", v.returncode == 0, v)
    shown = subprocess.run([vampire.BIN, "--show_options", "on"], capture_output=True, text=True, timeout=30).stdout
    for opt in vampire.OPTIONS:
        expect(f"vampire has the option --{opt}", f"--{opt}" in shown, "not in `vampire --show_options on`: remove it from lab_atp/vampire.py OPTIONS")

    expect("vampire has the option --unused_predicate_definition_removal (clausify uses it)", "--unused_predicate_definition_removal" in shown)
    r = core.prove(axioms=["![X]: (p(X) => q(X))", "p(a)"], conjecture="q(a)")
    expect("prove: q(a) follows", r["ok"] and r["result"]["verdict"] == "proved" and r["result"]["axioms_used"] == ["ax1", "ax2"], r)
    r = core.prove(axioms=["![X]: (p(X) => q(X))", "p(a)"], conjecture="q(b)", time_limit_s=5)
    expect("prove: q(b) does not follow", r["ok"] and r["result"]["verdict"] in ("countermodel", "satisfiable", "timeout", "gave_up"), r)
    for opts in ({"avatar": "off"}, {"saturation_algorithm": "discount"}, {"sos": "on"}, {"age_weight_ratio": "1:10"}, {"selection": 1011}, {"literal_comparison_mode": "predicate"}, {"backward_demodulation": "off"}, {"equality_proxy": "off"}):
        r = core.prove(axioms=["p(a)"], conjecture="p(a)", options=opts, time_limit_s=5)
        expect(f"prove accepts {opts}", r["ok"] and r["result"]["verdict"] == "proved", r)
    r = core.prove(axioms=["p(a)"], conjecture="p(a)", strategy="casc", time_limit_s=5)
    expect("prove: casc mode answers", r["ok"] and r["result"]["verdict"] == "proved", r)
    r = core.find_countermodel(axioms=["![X,Y]: f(X,Y) = f(Y,X)"], conjecture="![X,Y,Z]: f(f(X,Y),Z) = f(X,f(Y,Z))")
    expect("find_countermodel: commutative but not associative", r["ok"] and r["result"]["verdict"] == "countermodel" and r["result"]["domain_size"], r)
    r = core.check_consistency(axioms=["![X]: p(X)", "?[X]: ~p(X)"])
    expect("check_consistency: contradictory axioms", r["ok"] and r["result"]["consistent"] is False, r)
    r = core.check_consistency(axioms=["p(a)", "~p(b)"])
    expect("check_consistency: consistent axioms", r["ok"] and r["result"]["consistent"] is True, r)
    r = core.unsat_core(axioms=["![X]: (p(X) => q(X))", "![X]: (r(X) => s(X))", "p(a)"], conjecture="q(a)")
    expect("unsat_core: ax1 and ax3, not ax2", r["ok"] and r["result"]["core"] == ["ax1", "ax3"] and r["result"]["unused"] == ["ax2"], r)
    r = core.clausify(axioms=["![X]: (p(X) => q(X))"], conjecture="q(a)")
    expect("clausify shows both clauses (the implication and the negated goal)", r["ok"] and r["result"]["clause_count"] == 2 and "q(X0) | ~p(X0)" in r["result"]["clauses"] and "~q(a)" in r["result"]["clauses"], r)
    # ---- named theories, exact sizes, and the Lean scripts made from models (the claims in the tool descriptions) ----
    r = core.theories_table()
    expect("theories lists eight theories", r["ok"] and len(r["result"]["theories"]) == 8, r)
    r = core.prove(theory="group", axioms=["![X]: (mul(X,X) = e)"], conjecture="![X,Y]: (mul(X,Y) = mul(Y,X))", time_limit_s=20)
    expect("prove: a group of exponent 2 is commutative", r["ok"] and r["result"]["verdict"] == "proved", r)
    r = core.find_countermodel(theory="group", conjecture="![X,Y]: (mul(X,Y) = mul(Y,X))")
    res = r.get("result", {})
    expect("find_countermodel: the smallest non-abelian group has order 6", r["ok"] and res.get("verdict") == "countermodel" and res.get("domain_size") == 6, r)
    expect("... and comes with a Lean script", "theorem conjecture_fails" in res.get("lean_check", "") and "theorem ax_group_assoc_holds" in res.get("lean_check", ""), res.get("lean_check_unavailable") or res.keys())
    r = core.find_countermodel(theory="group", conjecture="![X,Y]: (mul(X,Y) = mul(Y,X))", size=8)
    expect("find_countermodel: size=8 gives a non-abelian group of order 8", r["ok"] and r["result"]["verdict"] == "countermodel" and r["result"]["domain_size"] == 8, r)
    r = core.find_countermodel(theory="group", conjecture="![X,Y]: (mul(X,Y) = mul(Y,X))", size=5, time_limit_s=30)
    expect("find_countermodel: every group of order 5 is abelian, so size=5 has no countermodel and says so", r["ok"] and r["result"].get("no_model_of_size") == 5 and "NO model with exactly 5" in r["lean"], r)
    r = core.find_countermodel(theory="comm_ring", conjecture="![X]: (mul(X,X) = X)")
    expect("find_countermodel: a commutative ring where x*x != x has 3 elements (Z/3)", r["ok"] and r["result"].get("domain_size") == 3 and "add_tbl" in r["result"].get("lean_check", ""), r)
    r = core.find_countermodel(theory="partial_order", conjecture="![X,Y]: (le(X,Y) | le(Y,X))")
    expect("find_countermodel: an order that is not total, with a predicate table", r["ok"] and "def le_b" in r["result"].get("lean_check", ""), r)
    r = core.unsat_core(theory="group", axioms=["![X]: (mul(X,X) = e)"], conjecture="![X,Y]: (mul(X,Y) = mul(Y,X))")
    expect("unsat_core: names the user axiom and group axioms", r["ok"] and "ax1" in (r["result"].get("core") or []) and any(c.startswith("group_") for c in r["result"]["core"]), r)
    r = core.check_consistency(theory="ring")
    expect("check_consistency: the ring axioms have a finite model", r["ok"] and r["result"]["consistent"] is True, r)
    r = core.check_syntax(axioms=["p(X"])
    expect("check_syntax refuses p(X", r["ok"] and r["result"]["parses"] is False, r)
    r = call("smt_check", smtlib2="(declare-const x Int) (declare-const y Int) (assert (= (+ (* 3 x) (* 5 y)) 1)) (assert (> x 0))")
    expect("smt_check: sat", r.get("ok") and r["result"]["status"] == "sat", r)
    r = call("sat_check", clauses=[[1, 2], [-1, 2], [1, -2], [-1, -2]])
    expect("sat_check: unsat", r.get("ok") and r["result"]["status"] == "unsat", r)
    print("ATP self-test passed")


if __name__ == "__main__":
    main()
