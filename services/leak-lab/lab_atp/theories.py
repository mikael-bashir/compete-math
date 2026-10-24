"""Named theories: the axioms of common structures, ready to hand to the provers, with their Lean (Mathlib) counterparts.

Each theory has symbols with FIXED names, so the driver never has to write boilerplate and a found model can be read back:
  mul/2 (the product), e/0 (identity), inv/1 (inverse), add/2, zero/0, neg/1, one/0, le/2 (order), meet/2, join/2.
An axiom is (name, TPTP first-order formula); the formulas are checked in tests against the real Vampire (a group is not commutative, and so on).
"""
from __future__ import annotations

from lab_common.arith import LabError

_SEMIGROUP = [("assoc", "![X,Y,Z]: (mul(mul(X,Y),Z) = mul(X,mul(Y,Z)))")]
_MONOID = _SEMIGROUP + [("left_identity", "![X]: (mul(e,X) = X)"), ("right_identity", "![X]: (mul(X,e) = X)")]
_GROUP = _MONOID + [("left_inverse", "![X]: (mul(inv(X),X) = e)"), ("right_inverse", "![X]: (mul(X,inv(X)) = e)")]
_ABELIAN = _GROUP + [("commutative", "![X,Y]: (mul(X,Y) = mul(Y,X))")]
_RING = [
    ("add_assoc", "![X,Y,Z]: (add(add(X,Y),Z) = add(X,add(Y,Z)))"),
    ("add_comm", "![X,Y]: (add(X,Y) = add(Y,X))"),
    ("add_zero", "![X]: (add(X,zero) = X)"),
    ("add_neg", "![X]: (add(X,neg(X)) = zero)"),
    ("mul_assoc", "![X,Y,Z]: (mul(mul(X,Y),Z) = mul(X,mul(Y,Z)))"),
    ("one_mul", "![X]: (mul(one,X) = X)"),
    ("mul_one", "![X]: (mul(X,one) = X)"),
    ("left_distrib", "![X,Y,Z]: (mul(X,add(Y,Z)) = add(mul(X,Y),mul(X,Z)))"),
    ("right_distrib", "![X,Y,Z]: (mul(add(X,Y),Z) = add(mul(X,Z),mul(Y,Z)))"),
]
_ORDER = [
    ("refl", "![X]: le(X,X)"),
    ("antisymm", "![X,Y]: ((le(X,Y) & le(Y,X)) => X = Y)"),
    ("trans", "![X,Y,Z]: ((le(X,Y) & le(Y,Z)) => le(X,Z))"),
]
_LATTICE = [
    ("meet_comm", "![X,Y]: (meet(X,Y) = meet(Y,X))"), ("join_comm", "![X,Y]: (join(X,Y) = join(Y,X))"),
    ("meet_assoc", "![X,Y,Z]: (meet(meet(X,Y),Z) = meet(X,meet(Y,Z)))"), ("join_assoc", "![X,Y,Z]: (join(join(X,Y),Z) = join(X,join(Y,Z)))"),
    ("absorb_meet", "![X,Y]: (meet(X,join(X,Y)) = X)"), ("absorb_join", "![X,Y]: (join(X,meet(X,Y)) = X)"),
]

THEORIES: dict[str, dict] = {
    "semigroup": {"axioms": _SEMIGROUP, "symbols": "mul/2", "lean": "Semigroup", "about": "an associative product"},
    "monoid": {"axioms": _MONOID, "symbols": "mul/2, e/0", "lean": "Monoid", "about": "an associative product with a two-sided identity e"},
    "group": {"axioms": _GROUP, "symbols": "mul/2, e/0, inv/1", "lean": "Group", "about": "a monoid in which every element has an inverse inv(X)"},
    "abelian_group": {"axioms": _ABELIAN, "symbols": "mul/2, e/0, inv/1", "lean": "CommGroup", "about": "a group whose product is commutative"},
    "ring": {"axioms": _RING, "symbols": "add/2, zero/0, neg/1, mul/2, one/0", "lean": "Ring", "about": "an abelian group under add with an associative product mul with identity one, distributing over add"},
    "comm_ring": {"axioms": _RING + [("mul_comm", "![X,Y]: (mul(X,Y) = mul(Y,X))")], "symbols": "add/2, zero/0, neg/1, mul/2, one/0", "lean": "CommRing", "about": "a ring with commutative product"},
    "partial_order": {"axioms": _ORDER, "symbols": "le/2 (a predicate)", "lean": "PartialOrder", "about": "a reflexive, antisymmetric, transitive relation le"},
    "lattice": {"axioms": _LATTICE, "symbols": "meet/2, join/2", "lean": "Lattice", "about": "an algebraic lattice: meet and join commutative, associative, with the absorption laws"},
}


def theory_axioms(theory: str | list[str] | None) -> list[tuple[str, str]]:
    """The axioms of one or several named theories as [(name, formula)], names prefixed with the theory so that an unsat core says where each came from."""
    if not theory:
        return []
    names = [theory] if isinstance(theory, str) else list(theory)
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for t in names:
        if t not in THEORIES:
            raise LabError(f"unknown theory '{t}': the theories are {sorted(THEORIES)} (see the `theories` tool)")
        for n, f in THEORIES[t]["axioms"]:
            key = f"{t}_{n}"
            if key not in seen:
                seen.add(key)
                out.append((key, f))
    return out
