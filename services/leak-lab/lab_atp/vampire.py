"""Vampire: argument building, a hard-limited run, and a reader for what it prints (SZS status, proof, finite model, statistics)."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any

from lab_common.arith import LabError
from lab_common.limits import MiB, Limits, run_limited

BIN = os.environ.get("VAMPIRE_BIN", "vampire")

# The advanced options a driver may set. Each is checked against a fixed set of values or a numeric range, so that a value can never be a file
# name or a second option. selftest.sh checks at image build time that every long name here is an option of the installed Vampire.
CHOICE = "choice"
RANGE = "range"
OPTIONS: dict[str, dict[str, Any]] = {
    "avatar": {"kind": CHOICE, "values": ["on", "off"], "doc": "AVATAR: split clauses into components and let a SAT solver pick the branch (Vampire's default is on). Turn off to compare."},
    "saturation_algorithm": {"kind": CHOICE, "values": ["lrs", "otter", "discount", "fmb", "inst_gen"], "doc": "Given-clause loop. lrs (default) limits memory by a resource estimate; discount never uses passive clauses to simplify; otter does; fmb builds finite models; inst_gen is instantiation-based."},
    "age_weight_ratio": {"kind": "ratio", "doc": "How often the oldest clause is picked versus the lightest, as 'age:weight', for example '1:10' (default 1:1). More weight means more focused, less age means less breadth."},
    "selection": {"kind": RANGE, "min": -1011, "max": 1011, "doc": "Literal selection function number (for example 10, 11, 1010, 1011; negative means maximal-literal variants). Changes which literals inferences use."},
    "sos": {"kind": CHOICE, "values": ["off", "on", "all", "theory"], "doc": "Set-of-support strategy: restrict inferences to clauses that descend from the conjecture ('on'), or from the conjecture and theory axioms ('theory')."},
    "equality_proxy": {"kind": CHOICE, "values": ["off", "R", "RS", "RST", "RSTC"], "doc": "Replace equality by a binary predicate plus axioms. Occasionally helps problems that are mostly equational."},
    "backward_demodulation": {"kind": CHOICE, "values": ["all", "off", "preordered"], "doc": "Rewrite existing clauses with new equations. 'off' is sometimes faster on huge problems."},
    "literal_comparison_mode": {"kind": CHOICE, "values": ["standard", "predicate", "reverse"], "doc": "Ordering used to pick maximal literals. 'predicate' and 'reverse' can unblock stuck problems."},
    "theory_axioms": {"kind": CHOICE, "values": ["on", "off", "some"], "doc": "Add axioms for built-in theories (arithmetic, arrays) when the problem uses them in tff syntax."},
    "fmb_start_size": {"kind": RANGE, "min": 1, "max": 64, "doc": "Smallest domain size the finite model builder tries first (only for find_countermodel / saturation_algorithm fmb)."},
}
# clausify shows the clauses of YOUR formulas, so it must not let Vampire's preprocessing delete a predicate that occurs with one sign only (it would show a tautology)
CLAUSIFY_RAW = ["--unused_predicate_definition_removal", "off"]
MODES = {
    "default": ["--mode", "vampire"],
    "casc": ["--mode", "casc"],
}
SZS_LINE = re.compile(r"^%\s*SZS status\s+(\w+)(?:\s+for\s+(\S+))?", re.M)
PROOF_BLOCK = re.compile(r"^%\s*SZS output start (Proof|CNFRefutation|Refutation)[^\n]*\n(.*?)^%\s*SZS output end \1", re.M | re.S)
MODEL_BLOCK = re.compile(r"^%\s*SZS output start (FiniteModel|Saturation|Model)[^\n]*\n(.*?)^%\s*SZS output end \1", re.M | re.S)

VERDICT = {
    "Theorem": "proved", "Unsatisfiable": "proved_unsat", "ContradictoryAxioms": "axioms_contradictory",
    "CounterSatisfiable": "countermodel", "Satisfiable": "satisfiable",
    "Timeout": "timeout", "ResourceOut": "resource_out", "GaveUp": "gave_up", "Unknown": "unknown",
    "InputError": "input_error", "UserError": "input_error", "Error": "error", "Forced": "error", "Inappropriate": "error",
}


def validate_options(opts: dict[str, Any] | None) -> list[str]:
    """Turn {'avatar': 'off', 'selection': 1011} into ['--avatar', 'off', '--selection', '1011'], refusing anything outside the allow-list."""
    out: list[str] = []
    for key, val in (opts or {}).items():
        spec = OPTIONS.get(key)
        if spec is None:
            raise LabError(f"option '{key}' is not available; the available options are {sorted(OPTIONS)} (see vampire_options)")
        sval = str(val).strip()
        if spec["kind"] == CHOICE:
            if sval not in spec["values"]:
                raise LabError(f"option '{key}' takes one of {spec['values']}, not '{sval}'")
        elif spec["kind"] == RANGE:
            try:
                iv = int(sval)
            except ValueError:
                raise LabError(f"option '{key}' takes a whole number between {spec['min']} and {spec['max']}") from None
            if not spec["min"] <= iv <= spec["max"]:
                raise LabError(f"option '{key}' takes a whole number between {spec['min']} and {spec['max']}")
            sval = str(iv)
        elif spec["kind"] == "ratio":
            if not re.fullmatch(r"\d{1,3}:\d{1,3}", sval):
                raise LabError("age_weight_ratio is 'age:weight', for example '1:10'")
        out += [f"--{key}", sval]
    return out


def build_argv(*, mode: str = "default", time_limit_s: int = 10, memory_mb: int = 2048, proof: bool = True, options: dict[str, Any] | None = None, input_syntax: str = "tptp", extra: list[str] | None = None) -> list[str]:
    if mode not in MODES:
        raise LabError(f"mode must be one of {sorted(MODES)}")
    if not 1 <= time_limit_s <= 120:
        raise LabError("time_limit_s must be between 1 and 120")
    if not 64 <= memory_mb <= 4096:
        raise LabError("memory_mb must be between 64 and 4096")
    if input_syntax not in ("tptp", "smtlib2"):
        raise LabError("input_syntax must be tptp or smtlib2")
    argv = [BIN, *MODES[mode], "--time_limit", f"{time_limit_s}s", "--memory_limit", str(memory_mb), "--input_syntax", input_syntax]
    if proof:
        argv += ["--proof", "tptp"]
    return argv + validate_options(options) + list(extra or [])


@dataclass
class Outcome:
    verdict: str
    szs: str | None
    problem_name: str | None
    proof: str | None
    model: str | None
    seconds: float
    exit_code: int | None
    stats: dict[str, Any] = field(default_factory=dict)
    stderr_tail: str = ""
    timed_out_by_wall_clock: bool = False


def parse_output(stdout: str, stderr: str = "") -> tuple[str, str | None, str | None, str | None, str | None, dict[str, Any]]:
    m = None
    for m in SZS_LINE.finditer(stdout):
        pass  # the last status line wins (a portfolio may print several)
    szs, name = (m.group(1), m.group(2)) if m else (None, None)
    verdict = VERDICT.get(szs or "", "unknown" if szs else "no_answer")
    pm = PROOF_BLOCK.search(stdout)
    mm = MODEL_BLOCK.search(stdout)
    stats: dict[str, Any] = {}
    for key, pat in (("time_elapsed_s", r"Time elapsed:\s*([\d.]+)\s*s"), ("active_clauses", r"Active clauses:\s*(\d+)"), ("generated_clauses", r"Generated clauses:\s*(\d+)"),
                     ("memory_used_kb", r"Memory used \[KB\]:\s*(\d+)"), ("sat_clauses_avatar", r"SAT solver clauses:\s*(\d+)")):
        g = re.search(pat, stdout)
        if g:
            stats[key] = float(g.group(1)) if "." in g.group(1) else int(g.group(1))
    return verdict, szs, name, (pm.group(2).strip() if pm else None), (mm.group(2).strip() if mm else None), stats


def run(argv: list[str], problem: str, *, wall_s: float | None = None) -> Outcome:
    tl = 10
    for i, a in enumerate(argv):
        if a == "--time_limit" and i + 1 < len(argv):
            tl = int(argv[i + 1].rstrip("s"))
    mem = 2048
    for i, a in enumerate(argv):
        if a == "--memory_limit" and i + 1 < len(argv):
            mem = int(argv[i + 1])
    res = run_limited(argv, stdin=problem, limits=Limits(wall_s=wall_s or tl + 5, cpu_s=int((wall_s or tl + 5) * 4), memory_bytes=(mem + 1024) * MiB, file_bytes=8 * MiB, open_files=128, processes=64, out_bytes=3 * MiB))
    verdict, szs, name, proof, model, stats = parse_output(res.stdout, res.stderr)
    if res.timed_out and verdict in ("no_answer", "unknown"):
        verdict = "timeout"
    return Outcome(verdict, szs, name, proof, model, res.seconds, res.returncode, stats, "\n".join(res.stderr.strip().splitlines()[-3:])[:400], res.timed_out)


def model_domain_size(model: str | None) -> int | None:
    if not model:
        return None
    sizes = [int(x) for x in re.findall(r"fmb_\$i_(\d+)", model)]
    if sizes:
        return max(sizes)
    g = re.search(r"[Ff]inite [Mm]odel(?: of size)?\s*(\d+)", model)
    return int(g.group(1)) if g else None
