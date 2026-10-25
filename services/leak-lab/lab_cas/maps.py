"""Dynamics of integer maps given by residue classes: n -> (a*n + b)/d on n = r (mod m).

Collatz is one such map (and so are 5n+1, 3n-1, 3n+3, and anything you can write as pieces per residue class). The tools here are exact: orbits,
statistics over a range, the tree of residue classes with the affine map each follows ("cylinders"), the density of classes that provably come
down within k steps, and every periodic orbit whose word has a given length (the cycle equation n*(M - P) = M*Q - P*R solved for each word).
"""
from __future__ import annotations

import math
import re
import time
from fractions import Fraction
from typing import Any

from lab_common.arith import LabError
from lab_common.shape import fail, fit, ok

PRESETS = {
    "collatz": {"modulus": 2, "pieces": [[1, 0, 2], [3, 1, 1]]},
    "collatz_shortcut": {"modulus": 2, "pieces": [[1, 0, 2], [3, 1, 2]]},
}
_FAMILY = re.compile(r"^(\d+)n([+-]\d+)(_shortcut)?$")
MAX_BITS = 200_000


class Spec:
    def __init__(self, modulus: int, pieces: list[list[int]]):
        self.m, self.pieces = modulus, [tuple(p) for p in pieces]

    def step(self, n: int) -> int:
        a, b, d = self.pieces[n % self.m]
        return (a * n + b) // d

    def describe(self) -> dict:
        return {"modulus": self.m, "pieces": [list(p) for p in self.pieces], "meaning": "n = r (mod m) maps to (a*n + b)/d, with (a, b, d) = pieces[r]"}


def parse_map(spec: Any) -> Spec:
    """A preset name ('collatz', 'collatz_shortcut'), a family like '5n+1' or '3n-1_shortcut', or {'modulus': m, 'pieces': [[a,b,d], ...]}."""
    if isinstance(spec, str):
        s = spec.strip().lower().replace(" ", "")
        if s in PRESETS:
            spec = PRESETS[s]
        else:
            mt = _FAMILY.match(s)
            if not mt:
                raise LabError(f"unknown map '{spec}'", )
            q, c, short = int(mt.group(1)), int(mt.group(2)), bool(mt.group(3))
            if short and (q + c) % 2:
                raise LabError(f"'{s}': q*n + c is not even on odd n (q + c = {q + c}), so the shortcut form is not a map of integers; drop '_shortcut'")
            spec = {"modulus": 2, "pieces": [[1, 0, 2], [q, c, 2 if short else 1]]}
    if not isinstance(spec, dict) or "modulus" not in spec or "pieces" not in spec:
        raise LabError("a map is a name, a family like '5n+1', or {'modulus': m, 'pieces': [[a, b, d], ...]}")
    m, pieces = spec["modulus"], spec["pieces"]
    if not isinstance(m, int) or not 1 <= m <= 4096 or not isinstance(pieces, list) or len(pieces) != m:
        raise LabError("'pieces' must be a list with one [a, b, d] per residue class 0..modulus-1 (modulus at most 4096)")
    for r, p in enumerate(pieces):
        if not (isinstance(p, (list, tuple)) and len(p) == 3 and all(isinstance(x, int) and not isinstance(x, bool) for x in p)) or p[2] < 1:
            raise LabError(f"piece {r} must be [a, b, d] with whole numbers and d >= 1")
        a, b, d = p
        if (a * r + b) % d or (a * m) % d:
            raise LabError(f"piece {r} = {list(p)} is not integer-valued on the class n = {r} (mod {m}): need d | a*{r}+b and d | a*{m}")
    return Spec(m, [list(p) for p in pieces])


def map_orbit(map: Any, start: int, max_steps: int = 10_000, show: int = 60) -> dict:
    sp = parse_map(map)
    if max_steps < 1 or max_steps > 2_000_000:
        return fail("max_steps must be between 1 and 2,000,000")
    n, seen, orbit = start, {}, []
    peak, cycle = start, None
    for i in range(max_steps + 1):
        if n in seen:
            first = seen[n]
            cyc = orbit[first:]
            cycle = {"starts_at_step": first, "length": len(cyc), "elements": fit(cyc, 1500), "smallest": min(cyc)}
            break
        seen[n] = i
        orbit.append(n)
        peak = max(peak, n)
        if abs(n).bit_length() > MAX_BITS:
            return fail("the orbit exceeded 200,000 bits")
        n = sp.step(n)
    k = max(1, min(show, 400))
    return ok(
        {"map": sp.describe(), "start": start, "steps_taken": len(orbit) - 1, "reached_cycle": cycle is not None, "cycle": cycle,
         "peak": peak, "first_values": orbit[:k], "last_values": orbit[-min(10, len(orbit)):] if len(orbit) > k else [],
         "parities_or_classes": [x % sp.m for x in orbit[: min(k, 120)]]},
        lean="a concrete orbit is a finite computation: `example : (fun k => if Even k then k / 2 else 3 * k + 1)^[N] n = 1 := by decide` for small N and n (or `norm_num [Function.iterate_succ]`); long orbits: use `simp` with `Nat.iterate`, not `decide` on big numbers",
        note=None if cycle else "no cycle seen within max_steps (the orbit may still reach one)",
    )


def map_scan(map: Any, lo: int, hi: int, until: str = "below_start", step_cap: int = 5000, modulus_report: int = 16, records: int = 12) -> dict:
    """Stopping-time statistics for lo..hi. until = 'below_start' (first n_k < n_0) or 'target:<value>' (first time the orbit hits it)."""
    sp = parse_map(map)
    if lo < 1 or hi < lo:
        return fail("need 1 <= lo <= hi")
    target = None
    if until.startswith("target:"):
        try:
            target = int(until.split(":", 1)[1])
        except ValueError:
            return fail("until must be 'below_start' or 'target:<integer>'")
    elif until != "below_start":
        return fail("until must be 'below_start' or 'target:<integer>'")
    if not 1 <= modulus_report <= 256:
        return fail("modulus_report must be between 1 and 256")
    deadline = time.monotonic() + 12.0
    count = max_steps = 0
    arg_max = lo
    total = 0
    survivors: list[int] = []
    rec: list[tuple[int, int]] = []
    hist: dict[int, int] = {}
    by_class = [[0, 0, 0] for _ in range(modulus_report)]  # n, sum steps, max steps
    peak_n, peak = lo, lo
    done_to = lo - 1
    for n0 in range(lo, hi + 1):
        if n0 & 1023 == 0 and time.monotonic() > deadline:
            break
        n, steps, p = n0, 0, n0
        while steps < step_cap:
            if (target is None and n < n0) or (target is not None and n == target):
                break
            n = sp.step(n)
            steps += 1
            if n > p:
                p = n
        else:
            survivors.append(n0)
            done_to = n0
            count += 1
            continue
        done_to = n0
        count += 1
        total += steps
        hist[steps.bit_length()] = hist.get(steps.bit_length(), 0) + 1
        if steps > max_steps:
            max_steps, arg_max = steps, n0
            rec.append((n0, steps))
        c = by_class[n0 % modulus_report]
        c[0] += 1
        c[1] += steps
        c[2] = max(c[2], steps)
        if p > peak:
            peak, peak_n = p, n0
    completed = done_to == hi
    return ok(
        {"map": sp.describe(), "range": [lo, hi], "tested_up_to": done_to, "completed": completed, "numbers_tested": count, "criterion": until,
         "mean_steps": round(total / max(1, count - len(survivors)), 3), "max_steps": max_steps, "argmax": arg_max,
         "record_holders": [{"n": n, "steps": s} for n, s in rec[-records:]], "not_resolved_within_step_cap": fit(survivors, 800), "step_cap": step_cap,
         "highest_value_reached": peak if peak < 10**40 else f"{len(str(peak))} digits", "reached_from": peak_n,
         "steps_histogram_by_bit_length": {f"<2^{k}": v for k, v in sorted(hist.items())},
         "by_residue_class": [{"r": r, "n": c[0], "mean_steps": round(c[1] / c[0], 2) if c[0] else None, "max_steps": c[2]} for r, c in enumerate(by_class)]},
        note=None if completed else "the time budget ran out before the range was finished; 'tested_up_to' says how far it got",
        lean="a statistic is an observation, never a proof; to use it, state the finite fact (for example 'every n in [1, N] reaches 1 within S steps') and let `decide` or `interval_cases` check a small N",
    )


def _words(sp: Spec, depth: int, *, stop_when_contracting: bool, node_cap: int = 3_000_000):
    """Depth-first walk over the feasible words. Yields (word, M, R, P, Q, expanded) with n0 = R + M*s and n_k = P*s + Q."""
    deadline = time.monotonic() + 15.0
    count = 0
    stack: list[tuple[tuple[int, ...], int, int, int, int]] = [((), 1, 0, 1, 0)]
    while stack:
        word, M, R, P, Q = stack.pop()
        k = len(word)
        contracting = P < M  # slope P/M < 1
        done = k >= depth or (stop_when_contracting and contracting and k > 0)
        count += 1
        if count > node_cap or (count & 4095 == 0 and time.monotonic() > deadline):
            raise LabError(f"too many words (stopped at {count:,}); lower the depth")
        yield word, M, R, P, Q, done
        if done:
            continue
        for b in range(sp.m - 1, -1, -1):
            g = math.gcd(P, sp.m)
            if (b - Q) % g:
                continue
            m2 = sp.m // g
            s0 = ((b - Q) // g * pow(P // g, -1, m2)) % m2 if m2 > 1 else 0
            M2, R2, P2, Q2 = M * m2, R + M * s0, P * m2, P * s0 + Q
            a, c, d = sp.pieces[b]
            if (a * P2) % d or (a * Q2 + c) % d:
                raise LabError("this map is not regular on words (a class does not map to a single affine function)")
            stack.append((word + (b,), M2, R2, a * P2 // d, (a * Q2 + c) // d))


def _form(M: int, R: int, P: int, Q: int) -> tuple[Fraction, Fraction]:
    return Fraction(P, M), Fraction(M * Q - P * R, M)  # n_k = slope * n_0 + offset


def _fr(x: Fraction) -> str:
    return str(x.numerator) if x.denominator == 1 else f"{x.numerator}/{x.denominator}"


def map_cylinders(map: Any, depth: int, stop_when_contracting: bool = True, show: int = 40) -> dict:
    sp = parse_map(map)
    if not 1 <= depth <= 24:
        return fail("depth must be between 1 and 24")
    try:
        rows, stopped, open_classes = [], Fraction(0), Fraction(0)
        n_words = n_stop = 0
        slope_open_min = None
        for word, M, R, P, Q, done in _words(sp, depth, stop_when_contracting=stop_when_contracting):
            if not done and len(word) < depth:
                continue
            n_words += 1
            slope, off = _form(M, R, P, Q)
            if slope < 1:
                n_stop += 1
                stopped += Fraction(1, M)
            else:
                open_classes += Fraction(1, M)
                slope_open_min = slope if slope_open_min is None else min(slope_open_min, slope)
            rows.append({"word": "".join(map_digit(b, sp.m) for b in word), "class": f"n = {R} (mod {M})", "slope": _fr(slope), "offset": _fr(off), "contracting": slope < 1, "_s": slope})
    except LabError as e:
        return fail(str(e))
    rows.sort(key=lambda r: (not r["contracting"], r["_s"]))
    for r in rows:
        r.pop("_s")
    shown = rows[: max(1, min(show, 200))]
    return ok(
        {"map": sp.describe(), "depth": depth, "classes": n_words, "stop_when_contracting": stop_when_contracting,
         "classes_with_slope_below_1": n_stop, "density_coming_down_within_depth": _fr(stopped), "density_as_float": float(stopped),
         "classes_still_open": n_words - n_stop, "density_still_open": _fr(open_classes), "smallest_open_slope": _fr(slope_open_min) if slope_open_min is not None else None,
         "classes_shown": shown, "meaning": "if n = R (mod M) then after len(word) steps the value is slope*n + offset exactly; slope < 1 means the orbit has gone below its start (for n large enough)"},
        lean="for a class: `∀ n, n % M = R → T^[k] n = (P * n + c) / D` where slope = P/D... prove by unfolding k steps with `Nat.add_mul_div_left`/`omega`; the closed form is checked by `ring`/`omega`, never by this tool",
    )


def map_digit(b: int, m: int) -> str:
    return str(b) if m <= 10 else f"[{b}]"


def map_cycles(map: Any, max_length: int, include_negative: bool = True, show: int = 30) -> dict:
    """Every periodic orbit whose itinerary has length <= max_length, found by solving the cycle equation for each word."""
    sp = parse_map(map)
    if not 1 <= max_length <= 22:
        return fail("max_length must be between 1 and 22")
    cycles: dict[tuple[int, ...], list[int]] = {}
    words = 0
    try:
        for word, M, R, P, Q, _done in _words(sp, max_length, stop_when_contracting=False):
            if not word:
                continue
            words += 1
            if M == P:
                continue  # slope 1: the equation is degenerate
            num, den = M * Q - P * R, M - P
            if num % den:
                continue
            n0 = num // den
            if (n0 - R) % M or (n0 <= 0 and not include_negative):
                continue
            orbit, x = [], n0
            for _ in range(len(word)):
                orbit.append(x)
                x = sp.step(x)
            if x != n0:
                continue
            key = tuple(sorted(set(orbit)))
            cycles.setdefault(key, orbit)
    except LabError as e:
        return fail(str(e))
    out = sorted(cycles.values(), key=lambda c: (min(c) <= 0, abs(min(c, key=abs)), len(c)))
    return ok(
        {"map": sp.describe(), "max_length": max_length, "words_examined": words, "cycle_count": len(out),
         "cycles": fit([{"length": len(c), "smallest": min(c), "orbit_from_smallest": c[c.index(min(c)):] + c[: c.index(min(c))]} for c in out[: max(1, min(show, 100))]], 4000),
         "meaning": f"these are ALL periodic orbits that return after at most {max_length} steps of this map (including fixed points); any other periodic orbit is longer",
         "cycle_equation": "for a word with n_0 = R + M s and n_k = P s + Q: n_0 = (M Q - P R)/(M - P) must be an integer congruent to R mod M"},
        lean="a listed cycle is a finite check (`decide` on the iterates); that there is NO other short cycle is a statement over all words of that length: state it per word class with `omega` on the cycle equation, or per length by `decide` over `Fin (2^k)`",
    )
