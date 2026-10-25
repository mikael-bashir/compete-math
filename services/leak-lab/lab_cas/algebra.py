"""Polynomial algebra, and certificates a Lean kernel can check.

The text a driver sends is never handed to sympy's own parser (which evaluates Python). It is read by the lab's whitelist reader: names that are
the declared variables, whole numbers, + - * and ** with a small non-negative whole exponent, parentheses. That is all a polynomial is.
"""
from __future__ import annotations

import ast
import itertools
from fractions import Fraction
from typing import Any

from lab_common.arith import LabError
from lab_common.shape import fail, fit, ok

MAX_EXP = 64


def _sym(variables: list[str]):
    import sympy

    if not variables or len(variables) > 8 or any(not (isinstance(v, str) and v.isidentifier()) for v in variables) or len(set(variables)) != len(variables):
        raise LabError("variables must be 1 to 8 distinct identifiers")
    return {v: sympy.Symbol(v) for v in variables}


def parse_poly(text: str, syms: dict[str, Any]):
    import sympy

    if len(text) > 3000:
        raise LabError("polynomial text longer than 3,000 characters")
    try:
        tree = ast.parse(text.strip().replace("^", "**"), mode="eval")  # Lean writes powers with ^
    except SyntaxError as e:
        raise LabError(f"syntax error in '{text[:60]}': {e.msg}") from None
    nodes = 0

    def ev(n: ast.AST):
        nonlocal nodes
        nodes += 1
        if nodes > 600:
            raise LabError("polynomial too large")
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, int) and not isinstance(n.value, bool):
            return sympy.Integer(n.value)
        if isinstance(n, ast.Name) and n.id in syms:
            return syms[n.id]
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.USub, ast.UAdd)):
            v = ev(n.operand)
            return -v if isinstance(n.op, ast.USub) else v
        if isinstance(n, ast.BinOp):
            if isinstance(n.op, ast.Add):
                return ev(n.left) + ev(n.right)
            if isinstance(n.op, ast.Sub):
                return ev(n.left) - ev(n.right)
            if isinstance(n.op, ast.Mult):
                return ev(n.left) * ev(n.right)
            if isinstance(n.op, ast.Pow):
                e = n.right
                if not (isinstance(e, ast.Constant) and isinstance(e.value, int) and 0 <= e.value <= MAX_EXP):
                    raise LabError(f"exponents must be whole numbers from 0 to {MAX_EXP}")
                return ev(n.left) ** e.value
            if isinstance(n.op, ast.Div) and isinstance(n.right, ast.Constant) and isinstance(n.right.value, int) and n.right.value != 0:
                return ev(n.left) / n.right.value  # division by a whole-number constant: rational coefficients
        raise LabError(f"not a polynomial expression: {ast.dump(n)[:60]} (allowed: variables {sorted(syms)}, whole numbers, + - * ** and / by a constant)")

    return sympy.expand(ev(tree))


def _equation(text: str, syms: dict[str, Any]):
    """'lhs = rhs' -> lhs - rhs (a bare polynomial means polynomial = 0)."""
    if "==" in text or "<=" in text or ">=" in text:
        raise LabError("write an equation with a single '='")
    if "=" in text:
        lhs, rhs = text.split("=", 1)
        return parse_poly(lhs, syms) - parse_poly(rhs, syms), parse_poly(lhs, syms), parse_poly(rhs, syms)
    p = parse_poly(text, syms)
    return p, p, parse_poly("0", syms)


def lean_poly(p) -> str:
    import sympy

    return str(sympy.sstr(p, order="lex")).replace("**", "^")


def polynomial(operation: str, expressions: list[str], variables: list[str], order: str = "lex") -> dict:
    import sympy

    syms = _sym(variables)
    polys = [parse_poly(e, syms) for e in expressions]
    gens = list(syms.values())
    op = operation
    if op == "expand":
        return ok({"expanded": lean_poly(polys[0])}, lean="`example (x y : ℤ) : <lhs> = <rhs> := by ring`")
    if op == "factor":
        f = sympy.factor(polys[0])
        return ok({"factored": str(f).replace("**", "^"), "irreducible_over": "ℚ (sympy.factor)"}, lean="`example (x : ℤ) : <expanded> = <factored> := by ring`  (the identity is checked by `ring`, which is kernel-only)")
    if op == "gcd" and len(polys) == 2:
        return ok({"gcd": lean_poly(sympy.gcd(polys[0], polys[1]))})
    if op == "resultant" and len(polys) == 2 and len(gens) >= 1:
        return ok({"resultant_wrt_first_variable": lean_poly(sympy.resultant(polys[0], polys[1], gens[0]))})
    if op == "discriminant":
        return ok({"discriminant_wrt_first_variable": lean_poly(sympy.discriminant(polys[0], gens[0]))})
    if op == "groebner":
        if order not in ("lex", "grlex", "grevlex"):
            return fail("order must be lex, grlex or grevlex")
        gb = sympy.groebner(polys, *gens, order=order)
        return ok({"order": order, "basis": [lean_poly(g) for g in gb.exprs][:60], "size": len(gb.exprs)}, note="a Gröbner basis is evidence about the ideal, not a Lean proof; ask `ideal_certificate` for coefficients that `linear_combination` can check")
    return fail(f"unknown operation or wrong number of expressions for '{operation}'", "operation is one of: expand, factor, gcd (2 expressions), resultant (2), discriminant, groebner")


def _monomials(nvars: int, degree: int):
    out = []
    for d in range(degree + 1):
        for exps in itertools.product(range(d + 1), repeat=nvars):
            if sum(exps) == d:
                out.append(exps)
    return out


def _solve_linear(rows: list[list[Fraction]], rhs: list[Fraction], ncols: int):
    """Exact Gauss-Jordan elimination: one solution of rows * x = rhs, or None."""
    m = [r[:] + [b] for r, b in zip(rows, rhs)]
    piv: list[int] = []
    r = 0
    for c in range(ncols):
        p = next((i for i in range(r, len(m)) if m[i][c] != 0), None)
        if p is None:
            continue
        m[r], m[p] = m[p], m[r]
        inv = 1 / m[r][c]
        m[r] = [x * inv for x in m[r]]
        for i in range(len(m)):
            if i != r and m[i][c] != 0:
                f = m[i][c]
                m[i] = [a - f * b for a, b in zip(m[i], m[r])]
        piv.append(c)
        r += 1
        if r == len(m):
            break
    for i in range(r, len(m)):
        if m[i][ncols] != 0:
            return None
    x = [Fraction(0)] * ncols
    for i, c in enumerate(piv):
        x[c] = m[i][ncols]
    return x


def ideal_certificate(goal: str, hypotheses: list[str], variables: list[str], max_degree: int = 3) -> dict:
    """Find polynomials c_i of total degree <= max_degree with goal.lhs - goal.rhs = sum c_i * (h_i.lhs - h_i.rhs), checked exactly."""
    import sympy

    syms = _sym(variables)
    if not 0 <= max_degree <= 8 or not 1 <= len(hypotheses) <= 12:
        return fail("max_degree must be 0..8 and there must be 1..12 hypotheses")
    g, _, _ = _equation(goal, syms)
    hs = [_equation(h, syms)[0] for h in hypotheses]
    gens = list(syms.values())
    mons = _monomials(len(gens), max_degree)
    if len(mons) * len(hs) > 2500:
        return fail(f"{len(mons) * len(hs)} unknown coefficients is too many (limit 2,500)", "lower max_degree or give fewer hypotheses")
    cols: list[tuple[int, tuple[int, ...]]] = [(i, mo) for i in range(len(hs)) for mo in mons]
    # each column is the polynomial mono * h_i, as a dict monomial -> coefficient
    col_polys = []
    for i, mo in cols:
        mono = sympy.Mul(*[v**e for v, e in zip(gens, mo)])
        col_polys.append(sympy.Poly(sympy.expand(mono * hs[i]), *gens).as_dict())
    goal_poly = sympy.Poly(g, *gens).as_dict()
    keys = sorted(set(goal_poly) | {k for d in col_polys for k in d})
    rows = [[Fraction(int(d.get(k, 0).p), int(d.get(k, 0).q)) if k in d else Fraction(0) for d in col_polys] for k in keys]
    rhs = [Fraction(int(goal_poly[k].p), int(goal_poly[k].q)) if k in goal_poly else Fraction(0) for k in keys]
    sol = _solve_linear(rows, rhs, len(cols))
    if sol is None:
        deg_goal = sympy.Poly(g, *gens).total_degree() if g != 0 else 0
        deg_hyps = [sympy.Poly(h, *gens).total_degree() for h in hs if h != 0 and sympy.Poly(h, *gens).total_degree() > 0]
        needed = max(0, deg_goal - min(deg_hyps)) if deg_hyps else 0
        result = {"found": False, "max_degree": max_degree, "goal_degree": deg_goal, "multipliers_usually_need_degree_at_least": needed}
        if max_degree < needed:
            cap = " The tool allows at most 8: if more is needed, first prove smaller facts and substitute (for example that each variable satisfies t^3 = 7t + 6, then reduce powers of t), so that the final goal has lower degree." if needed > 8 else ""
            return ok(result, note=f"max_degree {max_degree} is too low for this goal: the goal has degree {deg_goal} and the lowest-degree hypothesis has degree {min(deg_hyps)}, so the multipliers usually need degree {needed} or more. Try max_degree={min(needed, 8)}.{cap}")
        return ok(result, note=f"the goal is not in the span of the hypotheses with multipliers of degree <= {max_degree} (it may be true anyway: try a higher degree, or the goal may not lie in the ideal)")
    coeffs = [sympy.Integer(0)] * len(hs)
    for (i, mo), val in zip(cols, sol):
        if val:
            coeffs[i] += sympy.Rational(val.numerator, val.denominator) * sympy.Mul(*[v**e for v, e in zip(gens, mo)])
    check = sympy.expand(g - sum(c * h for c, h in zip(coeffs, hs)))
    if check != 0:
        return fail("internal check failed: the certificate does not reproduce the goal")
    terms = [f"({lean_poly(sympy.expand(c))}) * h{i + 1}" for i, c in enumerate(coeffs) if c != 0]
    return ok(
        {"found": True, "multipliers": {f"h{i + 1}": lean_poly(sympy.expand(c)) for i, c in enumerate(coeffs)}, "verified_exactly": "goal - sum(c_i * h_i) expands to 0"},
        lean=f"`linear_combination {' + '.join(terms) if terms else '0'}`  — name the hypotheses h1 … h{len(hs)} in the order given; `linear_combination` is checked by `ring`, so it needs a commutative ring (use ℤ or ℚ, not ℕ: cast first with `push_cast`/`zify`)",
    )
