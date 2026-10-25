"""How a tool answers. One shape for every tool, so the driver never has to guess where the answer is.

    {"ok": true,  "result": ..., "lean": "<how to make this a kernel-checked fact>", "note": "<caveats>"}
    {"ok": false, "error": "<what went wrong>", "hint": "<what to try instead>"}

A tool never raises to its caller: an error is an answer the driver can read and act on. Nothing here is a proof; `lean` says how to turn the
answer into one.
"""
from __future__ import annotations

from typing import Any

# The bridge cuts any tool result at 20,000 characters. A tool keeps its own answer well under that, so what the driver reads is what the
# tool meant to say and not the middle of it cut out by the bridge.
RESULT_BUDGET_CHARS = 12000


def ok(result: Any, *, lean: str = "", note: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {"ok": True, "result": result}
    if lean:
        out["lean"] = lean
    if note:
        out["note"] = note
    return out


def fail(error: str, hint: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {"ok": False, "error": error}
    if hint:
        out["hint"] = hint
    return out


def clip(text: str, limit: int = RESULT_BUDGET_CHARS, what: str = "output") -> str:
    """Keep the first and the last part of a long text and say what was left out."""
    if len(text) <= limit:
        return text
    head = limit * 2 // 3
    tail = limit - head
    return f"{text[:head]}\n[... {len(text) - head - tail:,} characters of {what} left out ...]\n{text[-tail:]}"


def fit(value: Any, limit: int = RESULT_BUDGET_CHARS) -> Any:
    """Shrink a long list or string inside a result so that the whole answer stays under the budget; says how much was cut."""
    import json

    if len(json.dumps(value, default=str)) <= limit:
        return value
    if isinstance(value, list):
        lo, hi = 0, len(value)
        while lo < hi:  # the longest prefix that fits
            mid = (lo + hi + 1) // 2
            if len(json.dumps(value[:mid], default=str)) <= limit:
                lo = mid
            else:
                hi = mid - 1
        return {"first": value[:lo], "shown": lo, "total": len(value), "cut": True}
    if isinstance(value, str):
        return clip(value, limit)
    return value
