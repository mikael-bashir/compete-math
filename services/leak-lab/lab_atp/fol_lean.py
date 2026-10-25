"""Translate the first-order fragment of TPTP (FOF formulas) into Lean over a finite domain `Fin n`, so that a finite model Vampire found can be checked by `decide`.

Grammar read (the TPTP one, where a quantifier governs one unitary formula, so `![X]: p(X) & q` is `(![X]: p(X)) & q`):

    formula  := unitary [ ('<=>' | '=>' | '<=') unitary ] | unitary ( '&' unitary )* | unitary ( '|' unitary )*
    unitary  := '(' formula ')' | '~' unitary | ('!' | '?') '[' Vars ']' ':' unitary | atom
    atom     := term ('=' | '!=') term | name ['(' term, ... ')'] | '$true' | '$false'

Variables start with a capital letter. Symbols become `<name>_tbl` (functions), `<name>_c` (constants), `<name>_b` (predicates, as Bool tables, used as `<name>_b x y = true`).
"""
from __future__ import annotations

import re

from lab_common.arith import LabError

_TOKEN = re.compile(r"\s*(<=>|=>|<=|!=|[()\[\],:&|~!?=]|\$true|\$false|'[^']*'|[A-Za-z_][A-Za-z0-9_]*)")
_LEAN_RESERVED = {"fun", "at", "in", "do", "if", "then", "else", "let", "have", "show", "from", "by", "end", "open", "match", "with", "forall", "exists", "theorem", "lemma", "def", "example", "instance", "class", "structure", "variable", "section", "namespace", "mut", "where", "calc", "this", "true", "false", "Type", "Prop", "Sort", "of", "sorry", "return", "for", "while", "try", "catch", "deriving", "extends", "universe", "local", "macro", "syntax", "elab", "import", "export", "private", "protected", "partial", "unsafe", "set_option", "attribute", "abbrev", "inductive", "opaque", "axiom"}


def _tokens(text: str) -> list[str]:
    out, pos = [], 0
    text = text.strip().rstrip(".")
    while pos < len(text):
        m = _TOKEN.match(text, pos)
        if not m:
            raise LabError(f"cannot read formula at: {text[pos:pos + 20]!r}")
        out.append(m.group(1))
        pos = m.end()
    return out


class _P:
    def __init__(self, toks: list[str], n: int, symbols: dict[str, int], preds: set[str]):
        self.t, self.i, self.n, self.symbols, self.preds = toks, 0, n, symbols, preds
        self.bound: list[str] = []

    def peek(self) -> str | None:
        return self.t[self.i] if self.i < len(self.t) else None

    def eat(self, tok: str | None = None) -> str:
        cur = self.peek()
        if cur is None or (tok is not None and cur != tok):
            raise LabError(f"expected {tok!r} but found {cur!r}")
        self.i += 1
        return cur

    def var(self, name: str) -> str:
        if name not in self.bound:
            raise LabError(f"variable {name} is not bound by any quantifier. In TPTP a quantifier governs only the NEXT unit, so write ![X,Y]: (A & B) => C as (![X,Y]: ((A & B) => C)): put the whole body in parentheses.")
        v = name.lower()
        return f"{v}_" if v in _LEAN_RESERVED else v

    def formula(self) -> str:
        left = self.unitary()
        op = self.peek()
        if op in ("&", "|"):
            parts = [left]
            while self.peek() == op:
                self.eat()
                parts.append(self.unitary())
            return "(" + (" ∧ " if op == "&" else " ∨ ").join(parts) + ")"
        if op in ("<=>", "=>", "<="):
            self.eat()
            right = self.unitary()
            return {"<=>": f"({left} ↔ {right})", "=>": f"({left} → {right})", "<=": f"({right} → {left})"}[op]
        return left

    def unitary(self) -> str:
        tok = self.peek()
        if tok == "(":
            self.eat("(")
            f = self.formula()
            self.eat(")")
            return f
        if tok == "~":
            self.eat()
            return f"¬{self.unitary()}"
        if tok in ("!", "?"):
            self.eat()
            self.eat("[")
            names = [self.eat()]
            while self.peek() == ",":
                self.eat()
                names.append(self.eat())
            self.eat("]")
            self.eat(":")
            self.bound.extend(names)
            body = self.unitary()
            for _ in names:
                self.bound.pop()
            vs = " ".join(v.lower() + ("_" if v.lower() in _LEAN_RESERVED else "") for v in names)
            return f"({'∀' if tok == '!' else '∃'} {vs} : Fin {self.n}, {body})"
        if tok == "$true":
            self.eat()
            return "True"
        if tok == "$false":
            self.eat()
            return "False"
        return self.atom()

    def term(self) -> str:
        name = self.eat()
        if name[0].isupper():
            return self.var(name)
        if self.peek() == "(":
            self.eat("(")
            args = [self.term()]
            while self.peek() == ",":
                self.eat()
                args.append(self.term())
            self.eat(")")
            self.symbols.setdefault(name, len(args))
            return f"({name}_tbl {' '.join(args)})"
        self.symbols.setdefault(name, 0)
        return f"{name}_c"

    def atom(self) -> str:
        save = self.i
        name = self.peek()
        # predicate: a lowercase name followed by '(' or by a connective, and not followed by '=' / '!='
        if name and name[0].islower():
            j = self.i + 1
            depth = 0
            end = j
            if j < len(self.t) and self.t[j] == "(":
                while end < len(self.t):
                    if self.t[end] == "(":
                        depth += 1
                    elif self.t[end] == ")":
                        depth -= 1
                        if depth == 0:
                            end += 1
                            break
                    end += 1
            nxt = self.t[end] if end < len(self.t) else None
            if nxt not in ("=", "!="):
                self.eat()
                args: list[str] = []
                if self.peek() == "(":
                    self.eat("(")
                    args.append(self.term())
                    while self.peek() == ",":
                        self.eat()
                        args.append(self.term())
                    self.eat(")")
                self.preds.add(name)
                self.symbols.setdefault(name, len(args))
                return f"({name}_b {' '.join(args)} = true)" if args else f"({name}_b = true)"
        self.i = save
        left = self.term()
        op = self.peek()
        if op not in ("=", "!="):
            raise LabError("expected = or != in an atom")
        self.eat()
        right = self.term()
        return f"({left} = {right})" if op == "=" else f"({left} ≠ {right})"


def fof_to_lean(formula: str, n: int, symbols: dict[str, int] | None = None, preds: set[str] | None = None) -> str:
    """One FOF formula as a Lean proposition over Fin n. `symbols` collects name -> arity, `preds` the predicate names."""
    symbols = symbols if symbols is not None else {}
    preds = preds if preds is not None else set()
    toks = _tokens(formula)
    p = _P(toks, n, symbols, preds)
    out = p.formula()
    if p.peek() is not None:
        raise LabError(f"unexpected {p.peek()!r} after the formula")
    return out[1:-1] if out.startswith("(") and out.endswith(")") and _balanced_outer(out) else out


def _balanced_outer(s: str) -> bool:
    depth = 0
    for k, ch in enumerate(s):
        depth += ch == "("
        depth -= ch == ")"
        if depth == 0 and k < len(s) - 1:
            return False
    return True
