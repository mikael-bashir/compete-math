"""Run a child process under hard limits.

Every computation of a Leak Lab tool runs in a child process of its own, never in the server: a CAS call that never ends, a prover that eats
memory, a loop that writes a file forever can then cost one child and nothing else. The limits are set by the kernel (setrlimit) and by the
parent's wall clock (the whole process group is killed), so they do not depend on the child behaving.
"""
from __future__ import annotations

import os
import resource
import signal
import subprocess
import sys
import time
from dataclasses import dataclass

MiB = 1024 * 1024
# In the container (Linux) a limit that cannot be set stops the child before it runs: no limit, no run. On a developer's macOS some limits
# (RLIMIT_AS, RLIMIT_NPROC) do not exist or are refused, so there the rest still apply and the missing ones are skipped.
STRICT = sys.platform.startswith("linux")


@dataclass(frozen=True)
class Limits:
    wall_s: float = 20.0  # the parent kills the child's process group after this long
    cpu_s: int | None = None  # RLIMIT_CPU; None = wall_s + 2
    memory_bytes: int = 1536 * MiB  # RLIMIT_AS
    file_bytes: int = 4 * MiB  # RLIMIT_FSIZE: the largest file the child may write
    open_files: int = 64
    processes: int = 64  # RLIMIT_NPROC: a fork bomb stops here
    out_bytes: int = 4 * MiB  # captured stdout/stderr are cut here


@dataclass
class Result:
    returncode: int | None  # None = killed by the wall clock
    stdout: str
    stderr: str
    timed_out: bool
    seconds: float
    truncated: bool


def _preexec(limits: Limits):
    def apply() -> None:
        os.setsid()  # its own process group, so the parent can kill every descendant
        cpu = limits.cpu_s if limits.cpu_s is not None else int(limits.wall_s) + 2
        wanted = [
            (resource.RLIMIT_CPU, cpu),
            (resource.RLIMIT_AS, limits.memory_bytes),
            (resource.RLIMIT_FSIZE, limits.file_bytes),
            (resource.RLIMIT_NOFILE, limits.open_files),
            (resource.RLIMIT_CORE, 0),
        ]
        # RLIMIT_NPROC counts every process of the user: in the container that is the server and its children, on a developer's laptop it is
        # everything they have open, so it is only applied where it means what it says
        if STRICT and hasattr(resource, "RLIMIT_NPROC"):
            wanted.append((resource.RLIMIT_NPROC, limits.processes))
        for res, val in wanted:
            try:
                resource.setrlimit(res, (val, val))
            except (ValueError, OSError):
                if STRICT:
                    raise

    return apply


def run_limited(argv: list[str], *, stdin: str = "", limits: Limits = Limits(), cwd: str | None = None, env: dict[str, str] | None = None) -> Result:
    """Run argv with stdin text under `limits`; never raises for a failing child. A missing program raises FileNotFoundError."""
    start = time.monotonic()
    child_env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1", **(env or {})}
    proc = subprocess.Popen(
        argv,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
        env=child_env,
        preexec_fn=_preexec(limits),
        text=True,
        errors="replace",
    )
    timed_out = False
    try:
        out, err = proc.communicate(stdin, timeout=limits.wall_s)
    except subprocess.TimeoutExpired:
        timed_out = True
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        out, err = proc.communicate()
    finally:
        try:  # anything the child left running in its group goes too
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
    truncated = len(out) > limits.out_bytes or len(err) > limits.out_bytes
    return Result(
        returncode=None if timed_out else proc.returncode,
        stdout=out[: limits.out_bytes],
        stderr=err[: limits.out_bytes],
        timed_out=timed_out,
        seconds=round(time.monotonic() - start, 3),
        truncated=truncated,
    )
