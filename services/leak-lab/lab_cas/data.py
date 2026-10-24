"""From data to conjecture: scan a predicate over a range, tabulate an expression, histogram its residues, guess a sequence's law."""
from __future__ import annotations

import time
from collections import Counter
from fractions import Fraction
from typing import Any

from lab_common import safe_expr
from lab_common.arith import LabError
from lab_common.shape import fail, fit, ok

from .numtheory import show_int


def scan_predicate(predicate: str, variable: str, lo: int, hi: int, step: int = 1, show: int = 10, want: str = "counterexamples") -> dict:
    """Evaluate a yes/no expression for variable = lo, lo+step, ..., hi. want = 'counterexamples' (where it is false) or 'witnesses' (where it is true)."""
    if want not in ("counterexamples", "witnesses"):
        return fail("want must be 'counterexamples' or 'witnesses'")
    if not variable.isidentifier() or step < 1 or hi < lo or (hi - lo) // step > 50_000_000:
        return fail("need an identifier, step >= 1, lo <= hi and at most 50,000,000 values")
    try:
        f = safe_expr.compile_expr(predicate, (variable,))
        f(lo)
    except LabError as e:
        return fail(str(e), "see the tool description for the functions the language offers")
    except Exception as e:  # noqa: BLE001
        return fail(f"the predicate failed at {variable}={lo}: {e}")
    deadline = time.monotonic() + 15.0
    tested = trues = 0
    hits: list[int] = []
    errors: list[tuple[int, str]] = []
    last = lo
    for x in range(lo, hi + 1, step):
        if tested & 2047 == 0 and tested and time.monotonic() > deadline:
            break
        try:
            v = bool(f(x))
        except LabError as e:
            if len(errors) < 3:
                errors.append((x, str(e)))
            tested += 1
            last = x
            continue
        tested += 1
        last = x
        trues += v
        if v == (want == "witnesses") and len(hits) < max(1, min(show, 200)):
            hits.append(x)
    complete = last + step > hi
    return ok(
        {"predicate": predicate, variable: f"{lo}..{hi} step {step}", "tested": tested, "tested_up_to": last, "complete": complete, "true_count": trues, "false_count": tested - trues - len(errors),
         "errors": errors, want: hits, "none_found": not hits and not errors},
        lean=("no counterexample in a finite range is evidence, not a theorem; its finite form is `∀ n < N, P n` by `decide` (kernel guard: keep numbers under 5 digits) or `interval_cases n <;> omega`/`norm_num`"
              if want == "counterexamples" else "a witness is a proof of `∃ n, P n`: `⟨w, by norm_num⟩` / `⟨w, by decide⟩`"),
        note=None if complete else "the 15-second budget ran out: 'tested_up_to' is how far it got",
    )


def tabulate(expression: str, variable: str, lo: int, hi: int, step: int = 1, modulus: int | None = None) -> dict:
    if not variable.isidentifier() or step < 1 or hi < lo or (hi - lo) // step > 100_000:
        return fail("need an identifier, step >= 1, lo <= hi and at most 100,001 values")
    try:
        f = safe_expr.compile_expr(expression, (variable,))
        rows = []
        for x in range(lo, hi + 1, step):
            v = f(x)
            rows.append([x, show_int(v % modulus if modulus and isinstance(v, int) else v)])
    except LabError as e:
        return fail(str(e))
    return ok({"expression": expression, "modulus": modulus, "rows": fit(rows, 9000)}, note="rows are [x, value]; a table is for looking at, not for proving")


def residue_histogram(expression: str, variable: str, lo: int, hi: int, modulus: int, step: int = 1) -> dict:
    """How often each residue mod `modulus` occurs among expression(x) for x in the range, and which residues never occur."""
    if not 2 <= modulus <= 100_000 or not variable.isidentifier() or step < 1 or hi < lo or (hi - lo) // step > 5_000_000:
        return fail("need 2 <= modulus <= 100,000, an identifier, step >= 1, lo <= hi and at most 5,000,000 values")
    try:
        f = safe_expr.compile_expr(expression, (variable,))
        cnt: Counter[int] = Counter()
        n = 0
        deadline = time.monotonic() + 15.0
        for x in range(lo, hi + 1, step):
            v = f(x)
            if not isinstance(v, int):
                return fail("the expression must produce a whole number")
            cnt[v % modulus] += 1
            n += 1
            if n & 4095 == 0 and time.monotonic() > deadline:
                break
    except LabError as e:
        return fail(str(e))
    missed = [r for r in range(modulus) if r not in cnt]
    top = cnt.most_common(5)
    return ok(
        {"values_counted": n, "modulus": modulus, "residues_hit": len(cnt), "residues_missed": fit(missed, 1500), "missed_count": len(missed),
         "most_common": [{"residue": r, "times": c} for r, c in top], "least_common_hit": [{"residue": r, "times": c} for r, c in sorted(cnt.items(), key=lambda kv: kv[1])[:5]],
         "mean_per_residue": round(n / modulus, 3), "zero_is_hit": 0 in cnt},
        lean="'residue r is never hit' over a finite family is `∀ x ∈ Finset.range N, f x % m ≠ r` by `decide`; over ALL x it needs the structure behind the pattern (a subgroup argument, a valuation, a descent)",
        note="a missed residue is a lead. Expected number of missed residues for a random-looking family is modulus * exp(-mean_per_residue); compare before believing in structure",
    )


def _berlekamp_massey(seq: list[Fraction]) -> list[Fraction]:
    """Shortest linear recurrence a(n) = c1 a(n-1) + ... + cL a(n-L) over the rationals."""
    c: list[Fraction] = [Fraction(1)]
    b: list[Fraction] = [Fraction(1)]
    L, m, bd = 0, 1, Fraction(1)
    for n in range(len(seq)):
        d = seq[n] + sum(c[i] * seq[n - i] for i in range(1, L + 1))
        if d == 0:
            m += 1
        elif 2 * L <= n:
            t = c[:]
            coef = d / bd
            c = c + [Fraction(0)] * (len(b) + m - len(c))
            for i, bi in enumerate(b):
                c[i + m] -= coef * bi
            L, b, bd, m = n + 1 - L, t, d, 1
        else:
            coef = d / bd
            c = c + [Fraction(0)] * (len(b) + m - len(c))
            for i, bi in enumerate(b):
                c[i + m] -= coef * bi
            m += 1
    return [-x for x in c[1 : L + 1]]


def guess_sequence(terms: list[int], max_order: int = 8, modulus_scan: int = 64) -> dict:
    """Candidate laws for a sequence of integers: constant/periodic, polynomial (finite differences), linear recurrence, periodic mod m."""
    n = len(terms)
    if not 4 <= n <= 400 or any(not isinstance(t, int) or isinstance(t, bool) for t in terms):
        return fail("give between 4 and 400 whole numbers")
    found: dict[str, Any] = {}
    diffs, cur = [], terms[:]
    for deg in range(0, min(n - 2, 12)):
        if all(x == cur[0] for x in cur):
            found["polynomial"] = {"degree": deg, "check": f"the {deg}-th differences are constant ({cur[0]})", "terms_used": n}
            break
        cur = [b - a for a, b in zip(cur, cur[1:])]
        diffs.append(cur[:3])
    seq = [Fraction(t) for t in terms]
    rec = _berlekamp_massey(seq)
    L = len(rec)
    if L and 2 * L + 1 <= n and all(sum(rec[i] * seq[k - 1 - i] for i in range(L)) == seq[k] for k in range(L, n)):
        if L > max_order:
            found["linear_recurrence"] = {"order": L, "law": "order above max_order: probably noise or a periodic sequence", "spare_terms": n - 2 * L}
        else:
            law = " + ".join(f"({c})*a(n-{i + 1})" for i, c in enumerate(rec) if c != 0) or "0"
            found["linear_recurrence"] = {"order": L, "law": f"a(n) = {law}", "checked_on": n - L, "spare_terms": n - 2 * L}
    ratios = {seq[i + 1] / seq[i] for i in range(n - 1) if seq[i] != 0}
    if len(ratios) == 1 and all(seq[i] != 0 for i in range(n - 1)):
        found["geometric"] = {"ratio": str(next(iter(ratios)))}
    periodic = {}
    for m in range(2, min(modulus_scan, 1000) + 1):
        r = [t % m for t in terms]
        for per in range(1, n // 3 + 1):
            for pre in range(0, n // 3):
                if all(r[i] == r[i + per] for i in range(pre, n - per)) and n - pre >= 3 * per:
                    periodic[m] = {"preperiod": pre, "period": per}
                    break
            if m in periodic:
                break
    if periodic:
        found["periodic_mod"] = {str(m): v for m, v in list(periodic.items())[:12]}
    return ok(
        {"terms": n, "found": found or "nothing simple", "differences_head": diffs[:4]},
        lean="a guessed law is a conjecture. State it as `∀ n, a (n+2) = c1 * a (n+1) + c2 * a n` and prove it by induction, or by `ring`/`omega` if `a` has a closed form; check the first terms with `decide`/`norm_num` first",
        note="Berlekamp-Massey needs 2*order + 1 terms to be convincing: 'spare_terms' says how many extra terms the law predicted correctly",
    )
