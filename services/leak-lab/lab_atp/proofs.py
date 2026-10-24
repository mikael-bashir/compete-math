"""Reading a TSTP proof (what Vampire prints with --proof tptp): which axioms it used, which rules, and a step list a person can follow."""
from __future__ import annotations

import re
from collections import Counter
from typing import Any

from lab_common.arith import LabError

HEAD = re.compile(r"^(fof|cnf|tff|thf)\(\s*([\w$]+)\s*,\s*(\w+)\s*,", re.S)
MAX_PROOF_CHARS = 400_000


def split_statements(text: str) -> list[str]:
    """Split on the '.' that ends a statement at parenthesis depth 0 (formulas contain dots only inside quotes, which TSTP proofs do not use)."""
    out, depth, cur = [], 0, []
    in_quote = False
    for ch in text:
        if ch == "'":
            in_quote = not in_quote
        if not in_quote:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            elif ch == "." and depth == 0:
                s = "".join(cur).strip()
                if s:
                    out.append(s)
                cur = []
                continue
        cur.append(ch)
    tail = "".join(cur).strip()
    if tail and not tail.startswith("%"):
        out.append(tail)
    return out


def _top_level_args(body: str) -> list[str]:
    args, depth, cur, in_quote = [], 0, [], False
    for ch in body:
        if ch == "'":
            in_quote = not in_quote
        if not in_quote:
            if ch in "([":
                depth += 1
            elif ch in ")]":
                depth -= 1
            elif ch == "," and depth == 0:
                args.append("".join(cur).strip())
                cur = []
                continue
        cur.append(ch)
    args.append("".join(cur).strip())
    return args


def parse_proof(text: str) -> list[dict[str, Any]]:
    if len(text) > MAX_PROOF_CHARS:
        raise LabError(f"the proof is longer than {MAX_PROOF_CHARS:,} characters")
    lines = [ln for ln in text.splitlines() if not ln.lstrip().startswith("%")]
    steps = []
    for st in split_statements("\n".join(lines)):
        h = HEAD.match(st)
        if not h:
            continue
        inner = st[st.index("(") + 1 : st.rindex(")")]
        args = _top_level_args(inner)
        name, role = args[0], args[1]
        formula = args[2] if len(args) > 2 else ""
        annot = ",".join(args[3:]) if len(args) > 3 else ""
        step: dict[str, Any] = {"name": name, "role": role, "formula": re.sub(r"\s+", " ", formula)}
        f = re.search(r"file\(\s*'?[^,]*'?\s*,\s*'?([\w$]+)'?\s*\)", annot)  # Vampire 5.1 writes file('<stdin>','ax1'): the name is quoted
        if f:
            step["source_axiom"] = f.group(1)
        inf = re.search(r"inference\(\s*([\w$]+)\s*,\s*\[(.*?)\]\s*,\s*\[(.*?)\]\s*\)", annot, re.S)
        if inf:
            step["rule"] = inf.group(1)
            step["from"] = [p.strip() for p in inf.group(3).split(",") if p.strip()]
        elif "introduced(" in annot:
            step["rule"] = re.search(r"introduced\(\s*([\w$]+)", annot).group(1) if re.search(r"introduced\(\s*([\w$]+)", annot) else "introduced"
        steps.append(step)
    return steps


def summarise(steps: list[dict[str, Any]], show: int = 60) -> dict[str, Any]:
    rules = Counter(s.get("rule", "input") for s in steps)
    used = sorted({s["source_axiom"] for s in steps if "source_axiom" in s and s["role"] != "conjecture"})  # the goal cites its own name; it is not an axiom
    conj = [s["name"] for s in steps if s["role"] in ("conjecture", "negated_conjecture")]
    return {
        "steps": len(steps), "axioms_used": used, "conjecture_steps": conj[:5], "rules": dict(rules.most_common()),
        "uses_avatar_splitting": any(r.startswith("avatar") for r in rules), "uses_equality_reasoning": any(r in rules for r in ("superposition", "demodulation", "forward_demodulation", "backward_demodulation", "equality_resolution", "equality_factoring")),
        "readable_steps": [f"{s['name']}: {s['formula'][:160]}  [{s.get('rule', s['role'])}{' from ' + ', '.join(s['from'][:4]) if s.get('from') else ''}]" for s in steps[:show]],
    }


def lean_guidance(summary: dict[str, Any]) -> str:
    """What to try in Lean given the shape of the refutation. The proof itself is never trusted or pasted: Lean must re-derive the result."""
    used = summary["axioms_used"]
    parts = [f"The refutation used {len(used)} axiom(s): {', '.join(used) if used else '(none named)'}. Prove those as Lean lemmas first (each by norm_num, simp, omega, ring or decide as fits), then close the goal from exactly them."]
    if summary["uses_equality_reasoning"]:
        parts.append("It rewrites with equations: in Lean that is `rw [..]`/`simp only [..]` with the used axioms, or `calc` chains; `grind` can replay pure equational reasoning.")
    else:
        parts.append("It is pure logic over the used axioms: `tauto`, `aesop`, or `grind` with those lemmas as hypotheses usually replays it.")
    if summary["uses_avatar_splitting"]:
        parts.append("AVATAR split the problem into cases: expect a `by_cases`/`rcases` in the Lean proof, one branch per component.")
    parts.append("Nothing in a Vampire proof is checked by Leak IV. Only the Lean you write and verify_full_script accepts counts; never use native_decide or bv_decide to shortcut a replay.")
    return " ".join(parts)
