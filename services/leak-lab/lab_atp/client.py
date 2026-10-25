"""Z3 operations through a limited child process; Vampire runs are made directly with lab_atp.vampire.run (which is already a limited child)."""
from __future__ import annotations

import json
import os
import sys

from lab_common.limits import MiB, Limits, run_limited
from lab_common.shape import fail

from .worker import OPS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the directory that holds lab_common and this package, wherever the server was started from


def call(op: str, **args) -> dict:
    if op not in OPS:
        return fail(f"unknown operation '{op}'")
    wall = OPS[op][1]
    res = run_limited([sys.executable, "-m", "lab_atp.worker"], stdin=json.dumps({"op": op, "args": args}), cwd=ROOT, limits=Limits(wall_s=wall, memory_bytes=3072 * MiB))
    if res.timed_out:
        return fail(f"{op} used its {wall:.0f}-second budget and was stopped", "send a smaller problem or a lower timeout_ms")
    if res.returncode != 0 or not res.stdout.strip():
        return fail(f"{op} did not finish ({(res.stderr.strip().splitlines() or ['no output'])[-1][:200]})", "send a smaller problem")
    try:
        return json.loads(res.stdout)
    except json.JSONDecodeError:
        return fail(f"{op} produced output that is not JSON")
