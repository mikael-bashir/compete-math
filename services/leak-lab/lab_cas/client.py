"""Run a CAS operation under limits and return its answer; this is what the MCP tools call."""
from __future__ import annotations

import json
import os
import sys

from lab_common.limits import MiB, Limits, run_limited
from lab_common.shape import RESULT_BUDGET_CHARS, clip, fail

from .ops import OPS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the directory that holds lab_common and this package, wherever the server was started from


def call(op: str, **args) -> dict:
    if op not in OPS:
        return fail(f"unknown operation '{op}'")
    wall = OPS[op][1]
    res = run_limited([sys.executable, "-m", "lab_cas.worker"], stdin=json.dumps({"op": op, "args": args}), cwd=ROOT, limits=Limits(wall_s=wall, memory_bytes=1536 * MiB))
    if res.timed_out:
        return fail(f"{op} used its {wall:.0f}-second budget and was stopped", "ask for something smaller: a narrower range, a smaller number, a lower depth")
    if res.returncode != 0 or not res.stdout.strip():
        why = "ran out of memory or CPU" if res.returncode in (-9, -24, -11) else (res.stderr.strip().splitlines() or ["no output"])[-1][:200]
        return fail(f"{op} did not finish ({why})", "ask for something smaller")
    try:
        out = json.loads(res.stdout)
    except json.JSONDecodeError:
        return fail(f"{op} produced output that is not JSON")
    text = json.dumps(out, default=str)
    if len(text) > RESULT_BUDGET_CHARS * 2:
        return fail("the answer is far larger than the result budget", "ask for fewer rows (a smaller 'show' or a narrower range)")
    return out
