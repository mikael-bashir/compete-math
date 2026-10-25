"""One Z3 operation in a child process (same protocol as lab_cas.worker): {"op", "args"} on stdin, the answer as JSON on stdout."""
from __future__ import annotations

import json
import sys

from lab_common.arith import LabError
from lab_common.shape import fail

from . import smt

OPS = {"smt_check": (smt.smt_check, 70), "sat_check": (smt.sat_check, 40)}


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
    except Exception as e:  # noqa: BLE001
        return fail(f"{type(e).__name__}: {str(e)[:300]}")


def main() -> None:
    req = json.loads(sys.stdin.read())
    sys.stdout.write(json.dumps(run(req["op"], req.get("args", {})), default=str))


if __name__ == "__main__":
    main()
