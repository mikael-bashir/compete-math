"""One CAS operation in a child process: reads {"op": ..., "args": {...}} on stdin, writes the answer as JSON on stdout.

The server starts this under lab_common.limits (CPU, memory, file size, process count, wall clock), so a runaway computation costs one child.
"""
from __future__ import annotations

import json
import sys
import traceback

from lab_common.arith import LabError
from lab_common.shape import fail

from .ops import OPS


def run(op: str, args: dict) -> dict:
    if op not in OPS:
        return fail(f"unknown operation '{op}'")
    try:
        return OPS[op][0](**args)
    except LabError as e:
        return fail(str(e))
    except TypeError as e:
        return fail(f"bad arguments for {op}: {e}")
    except MemoryError:
        return fail("out of memory", "ask for something smaller")
    except RecursionError:
        return fail("expression too deeply nested")
    except Exception as e:  # noqa: BLE001 - the child must always answer
        return fail(f"{type(e).__name__}: {e}", traceback.format_exc(limit=1).strip().splitlines()[-1][:200])


def main() -> None:
    req = json.loads(sys.stdin.read())
    out = run(req["op"], req.get("args", {}))
    sys.stdout.write(json.dumps(out, default=str))


if __name__ == "__main__":
    main()
