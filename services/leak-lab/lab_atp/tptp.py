"""Building and checking TPTP problems. The driver writes formulas; this adds the boilerplate and refuses what could read files or run away."""
from __future__ import annotations

import re

from lab_common.arith import LabError

MAX_PROBLEM_CHARS = 200_000
MAX_FORMULAS = 400
_NAME = re.compile(r"^[a-z][A-Za-z0-9_]{0,40}$")
_INCLUDE = re.compile(r"(^|[\s.])include\s*\(", re.M)
_LANG = {"fof": "fof", "tff": "tff", "cnf": "cnf", "thf": "thf"}


def check_problem_text(text: str) -> None:
    """Refuse a TPTP text that is too big, has a NUL byte, or uses include(...) (which reads files from the machine)."""
    if len(text) > MAX_PROBLEM_CHARS:
        raise LabError(f"the problem is longer than {MAX_PROBLEM_CHARS:,} characters")
    if "\x00" in text:
        raise LabError("the problem contains a NUL byte")
    if _INCLUDE.search(text):
        raise LabError("include(...) is not allowed: write every axiom into the problem itself")


def build_problem(axioms: list[str], conjecture: str | None, language: str = "fof", names: list[str] | None = None) -> str:
    """Assemble 'fof(ax1, axiom, F1). ... fof(goal, conjecture, C).' from bare formulas.

    A formula is TPTP first-order syntax: `![X,Y]: (p(X) => q(Y))`, `?[X]: r(X)`, `a = b`, `~p`, `&`, `|`, `<=>`. For `tff` declare types first by
    passing them as axioms with role 'type' written in full, for example `tff(t1, type, f: $int > $int).` (a statement that already starts with
    `tff(`/`fof(`/`cnf(` is kept as it is).
    """
    if language not in _LANG:
        raise LabError("language must be fof, tff, cnf or thf")
    if len(axioms) > MAX_FORMULAS:
        raise LabError(f"at most {MAX_FORMULAS} axioms")
    lines = []
    for i, a in enumerate(axioms, 1):
        a = a.strip()
        if not a:
            continue
        if re.match(r"^(fof|tff|cnf|thf)\s*\(", a):
            lines.append(a if a.endswith(".") else a + ".")
            continue
        name = (names[i - 1] if names and i - 1 < len(names) else f"ax{i}")
        if not _NAME.match(name):
            raise LabError(f"axiom name '{name}' must start with a lowercase letter and use letters, digits and _")
        lines.append(f"{language}({name}, axiom, ({a.rstrip('.').strip()})).")
    if conjecture and conjecture.strip():
        c = conjecture.strip()
        lines.append(c if re.match(r"^(fof|tff|cnf|thf)\s*\(", c) else f"{language}(goal, conjecture, ({c.rstrip('.').strip()})).")
    text = "\n".join(lines) + "\n"
    check_problem_text(text)
    return text
