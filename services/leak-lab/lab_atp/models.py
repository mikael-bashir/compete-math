"""Reading a finite model out of Vampire's finite-model-builder output, and writing it as a Lean script that Leak IV can check with `decide`."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from lab_common.arith import LabError

from . import fol_lean

MAX_LEAN_SIZE = 24  # a table of a binary function has size^2 entries and `decide` walks size^3 triples: beyond this the script is too slow to be useful

_ELT = r"'fmb_\$i_(\d+)'"


@dataclass
class Model:
    size: int
    constants: dict[str, int] = field(default_factory=dict)  # name -> element index (0-based)
    functions: dict[str, dict[tuple[int, ...], int]] = field(default_factory=dict)
    predicates: dict[str, dict[tuple[int, ...], bool]] = field(default_factory=dict)

    def arity(self, name: str) -> int | None:
        if name in self.constants:
            return 0
        for table in (self.functions, self.predicates):
            if name in table:
                for k in table[name]:
                    return len(k)
        return None


def parse_model(text: str) -> Model | None:
    """Vampire's `% SZS output start FiniteModel` block as a Model, or None if the text holds no model."""
    sizes = [int(x) for x in re.findall(r"declare_\$i\d+',type," + _ELT, text)]
    if not sizes:
        sizes = [int(x) for x in re.findall(r"tff\('declare_\$i(\d+)'", text)]
    if not sizes:
        return None
    m = Model(size=max(sizes))
    for name, const, idx in re.findall(r"tff\((\w+)_definition,axiom,\s*(\w+)\s*=\s*" + _ELT + r"\)", text):
        m.constants[const] = int(idx) - 1
    for fname, body in re.findall(r"tff\(function_(\w+),axiom,(.*?)\n\)\.", text, re.S):
        table: dict[tuple[int, ...], int] = {}
        for args, val in re.findall(r"\w+\(([^()]*)\)\s*=\s*" + _ELT, body):
            key = tuple(int(x) - 1 for x in re.findall(_ELT, args))
            table[key] = int(val) - 1
        m.functions[fname] = table
    for pname, body in re.findall(r"tff\(predicate_(\w+),axiom,(.*?)\n\)\.", text, re.S):
        ptable: dict[tuple[int, ...], bool] = {}
        for neg, args in re.findall(r"(~?)\s*" + re.escape(pname) + r"\(([^()]*)\)", body):
            key = tuple(int(x) - 1 for x in re.findall(_ELT, args))
            ptable[key] = neg == ""
        if not ptable:  # a proposition: `p` or `~p`
            ptable[()] = not body.strip().startswith("~")
        m.predicates[pname] = ptable
    return m


def _nest(size: int, arity: int, get) -> str:
    def rec(prefix: tuple[int, ...]) -> str:
        if len(prefix) == arity:
            return get(prefix)
        return "![" + ", ".join(rec(prefix + (i,)) for i in range(size)) + "]"

    return rec(())


def _complete(table: dict, size: int, arity: int, what: str) -> None:
    need = size**arity
    if len(table) != need:
        raise LabError(f"the model is incomplete for {what}: {len(table)} of {need} entries")


def tables_lean(m: Model, names: set[str] | None = None) -> list[str]:
    """Lean definitions of the model's constants, functions and predicates (only those in `names`, if given)."""
    out: list[str] = []
    n = m.size
    for c, idx in sorted(m.constants.items()):
        if (names is None or c in names) and not c.startswith("sK"):
            out.append(f"def {c}_c : Fin {n} := {idx}")
    for f, t in sorted(m.functions.items()):
        if names is not None and f not in names:
            continue
        k = len(next(iter(t))) if t else 0
        _complete(t, n, k, f)
        sig = " → ".join([f"Fin {n}"] * (k + 1))
        out.append(f"def {f}_tbl : {sig} := {_nest(n, k, lambda key, t=t: str(t[key]))}")
    for p, t in sorted(m.predicates.items()):
        if names is not None and p not in names:
            continue
        k = len(next(iter(t))) if t else 0
        _complete(t, n, k, p)
        sig = " → ".join([f"Fin {n}"] * k + ["Bool"])
        out.append(f"def {p}_b : {sig} := {_nest(n, k, lambda key, t=t: 'true' if t[key] else 'false')}")
    return out


def lean_skeleton(m: Model, axioms: list[tuple[str, str]], conjecture: str | None) -> str:
    """A complete Lean script: the model's tables, a `decide` proof that each axiom holds, and a `decide` proof that the conjecture fails."""
    if m.size > MAX_LEAN_SIZE:
        raise LabError(f"the model has {m.size} elements; a Lean check is only generated up to {MAX_LEAN_SIZE}")
    symbols: dict[str, int] = {}
    preds: set[str] = set()
    props = [(name, fol_lean.fof_to_lean(f, m.size, symbols, preds)) for name, f in axioms]
    goal = fol_lean.fof_to_lean(conjecture, m.size, symbols, preds) if conjecture else None
    for s, ar in symbols.items():
        have = m.arity(s)
        if have is not None and have != ar:
            raise LabError(f"symbol {s} has arity {have} in the model and {ar} in the formulas")
    # a symbol used in the formulas that the model leaves out (it was unconstrained) is given the value 0 / false
    missing = [s for s in symbols if m.arity(s) is None]
    for s in missing:
        ar = symbols[s]
        if s in preds:
            m.predicates[s] = {k: False for k in _all_keys(m.size, ar)}
        elif ar == 0:
            m.constants[s] = 0
        else:
            m.functions[s] = {k: 0 for k in _all_keys(m.size, ar)}
    lines = [f"/-! A finite model found by Vampire's model builder. Its {m.size} elements are `Fin {m.size}`; element k here is Vampire's `fmb_$i_{{k+1}}`. -/"]
    lines += tables_lean(m, set(symbols))
    lines.append("")
    for name, prop in props:
        lines.append(f"theorem ax_{name}_holds : {prop} := by decide")
    if goal is not None:
        lines.append(f"theorem conjecture_fails : ¬ ({goal}) := by decide")
    return "\n".join(lines) + "\n"


def _all_keys(size: int, arity: int):
    import itertools

    return itertools.product(range(size), repeat=arity)


def summarise(m: Model, limit: int = 12) -> dict:
    """A compact view for the driver: constants and the tables of small functions (large tables are in the Lean script)."""
    out: dict = {"size": m.size, "constants": {c: i for c, i in m.constants.items() if not c.startswith("sK")}}
    for f, t in m.functions.items():
        if m.size <= limit:
            k = len(next(iter(t))) if t else 0
            out.setdefault("functions", {})[f] = (
                [t[(i,)] for i in range(m.size)] if k == 1 else [[t[(i, j)] for j in range(m.size)] for i in range(m.size)] if k == 2 else f"arity {k}: see the Lean script"
            )
    for p, t in m.predicates.items():
        if m.size <= limit:
            k = len(next(iter(t))) if t else 0
            out.setdefault("predicates", {})[p] = (
                [i for i in range(m.size) if t.get((i,))] if k == 1 else [[int(t[(i, j)]) for j in range(m.size)] for i in range(m.size)] if k == 2 else f"arity {k}"
            )
    return out
