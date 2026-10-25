"""Exact number theory and modular arithmetic. Every function returns the lab's answer shape (lab_common.shape) and never raises."""
from __future__ import annotations

import math
from fractions import Fraction
from typing import Any

from lab_common import arith, safe_expr
from lab_common.arith import LabError
from lab_common.shape import fail, fit, ok

BIG_DIGITS = 400  # an integer with more digits than this is shown as its first and last digits and its length


def show_int(v: Any) -> Any:
    if isinstance(v, bool):
        return v
    if isinstance(v, Fraction):
        return f"{show_int(v.numerator)}/{v.denominator}" if v.denominator != 1 else show_int(v.numerator)
    if isinstance(v, int) and len(str(abs(v))) > BIG_DIGITS:
        s = str(abs(v))
        return f"{'-' if v < 0 else ''}{s[:40]}...{s[-40:]} ({len(s):,} digits)"
    return v


def evaluate(expression: str, variables: dict[str, int] | None = None) -> dict:
    try:
        v = safe_expr.evaluate(expression, variables)
    except LabError as e:
        return fail(str(e), "the language has whole numbers, + - * / // % **, comparisons, and the lab's functions (see the tool description)")
    except RecursionError:
        return fail("expression too deep")
    res: dict[str, Any] = {"value": show_int(v)}
    if isinstance(v, int) and not isinstance(v, bool):
        res["bits"] = abs(v).bit_length()
        res["mod_small"] = {str(m): v % m for m in (2, 3, 4, 5, 7, 8, 9, 11, 13, 16)}
    return ok(res, lean="for a closed numeric identity: `example : <lhs> = <rhs> := by norm_num` (or `by decide` when the numbers are small)")


def factor(n: int) -> dict:
    if n < 2:
        return fail("factor needs an integer n >= 2")
    import sympy

    f = sympy.factorint(n)
    items = sorted(f.items())
    return ok(
        {"n": show_int(n), "factors": [{"prime": show_int(p), "exponent": e, "verified_prime": arith.is_prime(p) if p < 3 * 10**24 else bool(sympy.isprime(p))} for p, e in items],
         "squarefree": all(e == 1 for _, e in items), "distinct_primes": len(items)},
        lean="`Nat.Prime p` for each prime: `by norm_num`; the product: `example : n = p1^e1 * p2^e2 := by norm_num`. Kernel-only, no tactic beyond norm_num needed.",
        note="sympy.factorint (trial division, Pollard rho, p-1, ECM) under this call's CPU and memory limit; a number that is too hard is refused, not guessed.",
    )


def primes(operation: str, n: int | None = None, lo: int | None = None, hi: int | None = None, limit: int = 100) -> dict:
    op = operation
    if op == "is_prime":
        if n is None:
            return fail("is_prime needs n")
        if n < 3 * 10**24:
            return ok({"n": show_int(n), "is_prime": arith.is_prime(n), "proof": "deterministic Miller-Rabin (exact below 3.3e24)"}, lean="`Nat.Prime n` by `norm_num`; `¬ Nat.Prime n` by `norm_num` as well")
        import sympy

        return ok({"n": show_int(n), "is_prime": bool(sympy.isprime(n)), "proof": "sympy.isprime (BPSW; no known counterexample)"}, note="for n above 3.3e24 this is a strong probable-prime test, not a certificate")
    if op in ("next", "prev"):
        if n is None:
            return fail(f"{op} needs n")
        import sympy

        return ok({"n": show_int(n), op: show_int(sympy.nextprime(n) if op == "next" else sympy.prevprime(n))})
    if op in ("count", "list"):
        if lo is None or hi is None or lo > hi:
            return fail(f"{op} needs lo <= hi")
        if hi > 10**7 or hi - lo > 10**7:
            return fail("the range is limited to 10,000,000", "ask for a narrower range, or sample")
        sieve = bytearray([1]) * (hi + 1)
        sieve[0:2] = b"\x00\x00"[: min(2, hi + 1)]
        for i in range(2, math.isqrt(hi) + 1):
            if sieve[i]:
                sieve[i * i :: i] = bytearray(len(sieve[i * i :: i]))
        ps = [i for i in range(max(lo, 2), hi + 1) if sieve[i]]
        if op == "count":
            return ok({"lo": lo, "hi": hi, "count": len(ps)})
        return ok({"lo": lo, "hi": hi, "count": len(ps), "primes": ps[: max(1, min(limit, 500))], "shown": min(len(ps), max(1, min(limit, 500)))})
    return fail(f"unknown operation '{operation}'", "operation is one of: is_prime, next, prev, count, list")


def arithmetic(n: int) -> dict:
    if n < 1:
        return fail("n must be a positive integer")
    try:
        f = arith.factor_small(n)
    except LabError as e:
        return fail(str(e))
    return ok(
        {"n": n, "factorisation": {str(p): e for p, e in sorted(f.items())}, "totient": arith.totient(n), "tau": arith.tau(n), "sigma": arith.sigma(n),
         "omega": len(f), "mobius": arith.mobius(n), "radical": arith.radical(n), "v2": arith.valuation(n, 2), "binary": bin(n)[2:], "popcount": arith.popcount(n)},
        lean="`Nat.totient n = t`: `by decide` for small n (or `by simp [Nat.totient]`); factorisation: `by norm_num`",
    )


def base_digits(n: int, base: int = 10) -> dict:
    if base < 2 or base > 1 << 20:
        return fail("base must be between 2 and 1,048,576")
    d = arith.digits(n, base)
    return ok(
        {"n": show_int(n), "base": base, "digits_least_significant_first": fit(d, 3000), "length": len(d), "digit_sum": sum(d), "popcount": arith.popcount(n) if base == 2 else None},
        lean="`Nat.digits b n = [...]` (least significant first, as here): `by norm_num`; digit sum: `(Nat.digits b n).sum = s := by norm_num`",
    )


def mod_pow(base: int, exponent: int, modulus: int) -> dict:
    if modulus < 1:
        return fail("modulus must be >= 1")
    if exponent < 0:
        try:
            return ok({"value": pow(base, exponent, modulus)})
        except ValueError:
            return fail(f"{base} has no inverse modulo {modulus}")
    return ok({"value": pow(base, exponent, modulus), "base": base, "exponent": show_int(exponent), "modulus": modulus},
              lean=f"`example : ({base} : ZMod {modulus}) ^ {exponent} = {pow(base, exponent, modulus)} := by decide` (small exponents) — or `Nat.pow_mod` with `norm_num` for a ℕ statement `{base}^{exponent} % {modulus} = {pow(base, exponent, modulus)}`")


def power_cycle(base: int, modulus: int, show: int = 64) -> dict:
    if not 2 <= modulus <= 10**9:
        return fail("modulus must be between 2 and 10^9")
    seen: dict[int, int] = {}
    seq: list[int] = []
    x = 1 % modulus
    while x not in seen:
        seen[x] = len(seq)
        seq.append(x)
        x = x * base % modulus
        if len(seq) > 2_000_000:
            return fail("the orbit is longer than 2,000,000 terms")
    pre, period = seen[x], len(seq) - seen[x]
    return ok({"base": base, "modulus": modulus, "preperiod": pre, "period": period, "first_terms": seq[: max(1, min(show, 500))], "sequence_is": "base^k mod modulus for k = 0, 1, 2, ..."},
              lean=(f"order: `(({base} : ZMod {modulus})) ^ {period} = 1 := by decide`; minimality: `∀ k < {period}, 0 < k → ({base} : ZMod {modulus}) ^ k ≠ 1` by `decide`" if pre == 0 else "the base is not a unit, so there is a preperiod"))


def mod_order(a: int, m: int) -> dict:
    try:
        o = arith.multiplicative_order(a, m)
    except LabError as e:
        return fail(str(e))
    phi = arith.totient(m)
    return ok({"a": a, "modulus": m, "order": o, "totient": phi, "order_factorisation": {str(p): e for p, e in arith.factor_small(o).items()}, "is_primitive_root": o == phi},
              lean=f"`orderOf ({a} : ZMod {m}) = {o}`: prove `({a} : ZMod {m}) ^ {o} = 1` and `∀ p ∈ primeFactors {o}, ({a} : ZMod {m}) ^ ({o} / p) ≠ 1` by `decide`, then `orderOf_eq_of_pow_and_pow_div_prime`")


def unit_group(modulus: int, generators: list[int] | None = None, test: int | None = None, show: int = 40) -> dict:
    """The group of units mod `modulus`, the subgroup generated by `generators`, its index, coset representatives, and membership of `test`."""
    if not 2 <= modulus <= 2_000_000:
        return fail("modulus must be between 2 and 2,000,000")
    phi = arith.totient(modulus)
    gens = [g % modulus for g in (generators or [])]
    if any(math.gcd(g, modulus) != 1 for g in gens):
        return fail("every generator must be a unit (coprime to the modulus)")
    sub = {1}
    frontier = [1]
    while frontier:
        nxt = []
        for x in frontier:
            for g in gens:
                y = x * g % modulus
                if y not in sub:
                    sub.add(y)
                    nxt.append(y)
        frontier = nxt
    index = phi // len(sub)
    reps, covered = [], set()
    if gens:
        for u in range(1, modulus):
            if math.gcd(u, modulus) != 1 or u in covered:
                continue
            reps.append(u)
            covered.update(u * s % modulus for s in sub)
            if len(reps) >= index:
                break
    cyclic = None
    prim = None
    if phi <= 200_000:
        for g in range(1, modulus):
            if math.gcd(g, modulus) == 1 and arith.multiplicative_order(g, modulus) == phi:
                prim = g
                break
        cyclic = prim is not None
    res: dict[str, Any] = {"modulus": modulus, "unit_group_order": phi, "cyclic": cyclic, "smallest_primitive_root": prim}
    if gens:
        res.update({"generators": gens, "subgroup_order": len(sub), "index": index, "coset_representatives": reps[: max(1, min(show, 200))]})
        if test is not None:
            res["test"] = test % modulus
            res["test_in_subgroup"] = (test % modulus) in sub
    return ok(res, lean="subgroup/coset claims over a small modulus are finite statements about `ZMod m`: `∀ k < o, (g : ZMod m)^k ≠ t` by `decide`. Keep m small (kernel evaluation), or split by prime power.")


def solve_congruence(a: int, b: int, m: int) -> dict:
    if m < 1:
        return fail("modulus must be >= 1")
    g = math.gcd(a, m)
    if b % g:
        return ok({"solvable": False, "gcd": g}, lean=f"no solution: `¬ ∃ x : ℤ, {a} * x ≡ {b} [ZMOD {m}]` because gcd {g} does not divide {b}")
    m2 = m // g
    x0 = (b // g) * pow(a // g, -1, m2) % m2 if m2 > 1 else 0
    return ok({"solvable": True, "gcd": g, "solutions_mod": m2, "x_mod_m2": x0, "all_solutions_mod_m": [x0 + k * m2 for k in range(g)] if g <= 64 else "g > 64: x = x0 + k*m2 for k in 0..g-1"},
              lean=f"`example : {a} * {x0} ≡ {b} [ZMOD {m}] := by decide` (or `Int.emod_emod_of_dvd` / `norm_num [Int.ModEq]`)")


def crt(residues: list[int], moduli: list[int]) -> dict:
    if len(residues) != len(moduli) or not moduli:
        return fail("residues and moduli must be lists of the same positive length")
    if any(m < 1 for m in moduli):
        return fail("moduli must be >= 1")
    x, mod = 0, 1
    for r, m in zip(residues, moduli):
        g = math.gcd(mod, m)
        if (r - x) % g:
            return ok({"consistent": False, "failed_at": {"residue": r, "modulus": m}}, lean="inconsistent system: two congruences disagree modulo their gcd")
        lcm = mod // g * m
        t = ((r - x) // g * pow(mod // g, -1, m // g) % (m // g)) if m // g > 1 else 0
        x, mod = (x + mod * t) % lcm, lcm
    return ok({"consistent": True, "x": show_int(x), "modulo": show_int(mod)}, lean="`Nat.chineseRemainder` for coprime moduli; or state the congruences and close with `omega` for small numbers")


def solve_polynomial_mod(coefficients: list[int], modulus: int, limit: int = 64) -> dict:
    if not 1 <= modulus <= 2_000_000:
        return fail("modulus must be between 1 and 2,000,000")
    if not coefficients or all(c % modulus == 0 for c in coefficients):
        return fail("give the coefficients lowest degree first, not all zero mod the modulus")
    cs = [c % modulus for c in coefficients]
    roots = []
    for x in range(modulus):
        v = 0
        for c in reversed(cs):
            v = (v * x + c) % modulus
        if v == 0:
            roots.append(x)
    return ok({"coefficients_low_to_high": coefficients, "modulus": modulus, "root_count": len(roots), "roots": roots[: max(1, min(limit, 500))]},
              lean="no roots: `∀ x : ZMod m, f x ≠ 0 := by decide` (small m); roots: `decide` on the explicit values")
