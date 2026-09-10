"""Extract theorem/lemma statements from Lean 4 source text.

This is a syntactic scanner, not a semantic one — it never elaborates the
file (that would require the project's full toolchain + dependencies built,
which is a multi-GB, multi-hour operation per library and not what Tengoku
needs). It finds `theorem`/`lemma` declarations and captures everything from
the keyword through the type signature, stopping at the top-level `:=` that
starts the proof — tracking paren/bracket/brace depth so a `:=` inside a
default-argument value (e.g. `(n : Nat := 0)`) doesn't end the capture early.

The proof body itself is discarded on purpose: Tengoku stores statements
only, meant to be re-attempted later, not proofs already done elsewhere.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_DECL_KEYWORD_RE = re.compile(
    r"^\s*(?:@\[[^\]]*\]\s*)?"  # optional attribute, e.g. @[simp]
    r"(?:private\s+|protected\s+|noncomputable\s+)*"
    r"(theorem|lemma)\s+"
    r"([A-Za-z_][A-Za-z0-9_'.]*)",
    re.MULTILINE,
)

_OPEN = {"(": ")", "[": "]", "{": "}"}
_CLOSE = {v: k for k, v in _OPEN.items()}


@dataclass
class ExtractedDeclaration:
    name: str
    statement: str
    line: int


def _strip_line_comments(text: str) -> str:
    """Blank out `--` line comments so they can't hide a fake `:=` or
    confuse bracket depth. Block comments (`/- ... -/`) are left alone —
    they're rare inside a signature and handling nesting correctly isn't
    worth the complexity for this heuristic pass."""
    out_lines = []
    for line in text.split("\n"):
        idx = line.find("--")
        out_lines.append(line if idx == -1 else line[:idx])
    return "\n".join(out_lines)


def extract_declarations(source: str) -> list[ExtractedDeclaration]:
    """Return every theorem/lemma declaration found in `source`."""
    text = _strip_line_comments(source)
    results: list[ExtractedDeclaration] = []

    for match in _DECL_KEYWORD_RE.finditer(text):
        name = match.group(2)
        start = match.start()
        line_no = text.count("\n", 0, start) + 1

        # Walk forward from just after the name, tracking bracket depth, to
        # find the top-level `:=` that starts the proof.
        depth = 0
        i = match.end()
        end = None
        while i < len(text):
            ch = text[i]
            if ch in _OPEN:
                depth += 1
            elif ch in _CLOSE:
                depth = max(0, depth - 1)
            elif depth == 0 and text.startswith(":=", i):
                end = i
                break
            elif depth == 0 and ch == "\n" and text[i:].lstrip().startswith(("theorem ", "lemma ")):
                # Next declaration started before we found `:=` (e.g. a
                # statement with no proof body captured, or our scan missed
                # the boundary) — bail out rather than swallow the next decl.
                end = i
                break
            i += 1

        if end is None:
            continue  # unterminated — skip rather than guess

        statement = text[start:end].strip()
        # Skip declarations that are just `theorem`/`lemma` inside a string
        # literal or doc example rather than real code (heuristic: a real
        # declaration's statement must contain a top-level `:` separating
        # the binders from the type).
        if ":" not in statement.split(":=")[0]:
            continue
        results.append(ExtractedDeclaration(name=name, statement=statement, line=line_no))

    return results
