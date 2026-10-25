"""Leak Lab CAS: the MCP server. Every tool is a thin call into lab_cas.client, which runs the operation in a limited child process.

The docstrings below ARE the interface: FastMCP sends each one to the driver as the tool's description, and each `Field(description=...)` as the
description of one argument. They follow one template so the driver can read any of them the same way:

    one line saying what the tool is for
    USE WHEN / NOT FOR   when to reach for it, and what to use instead
    LIMITS               the budget and the bounds, so the driver knows what it will be refused
    RETURNS              the shape of the answer
    LEAN                 how to turn the answer into something Leak IV can check
    EXAMPLE              one real call and what it shows

tests/test_docstrings.py reads this file and fails if a tool misses a section or an argument misses its description.
"""
from __future__ import annotations

import os
from typing import Annotated, Any

from fastmcp import FastMCP
from pydantic import Field

from .client import call

INSTRUCTIONS = """\
LEAK LAB (CAS): exact arithmetic and experiments for finding out what is true BEFORE you try to prove it. It is a calculator, not a judge.

WHAT NOTHING HERE CAN DO: prove anything. A result of this server is an observation. Only Leak IV (verify_full_script) makes a statement a fact.
Every answer carries a `lean` field that says how to turn it into a statement Lean's kernel can check with ordinary Mathlib tactics (norm_num,
decide on small numbers, omega, simp, ring, linear_combination, interval_cases). Never use native_decide or anything that trusts the compiler.

THE LOOP THIS IS BUILT FOR: look at data (map_scan, tabulate, residue_histogram, power_cycle) -> notice a pattern -> state it as a conjecture
in one line -> try to break it (scan_predicate over a large range, map_cycles for short cycles) -> if it survives, find WHY (unit_group, mod_order,
map_cylinders, ideal_certificate) -> write the reason as Lean and verify it.

EXPRESSIONS (evaluate, scan_predicate, tabulate, residue_histogram) are written in a small safe language: whole numbers, fractions (1/3), the
operators + - * / // % ** and comparisons, `and` `or` `not`, `a if c else b`, and these functions: abs min max gcd lcm isqrt pow(a,b,m) inv(a,m)
v2(n) vp(n,p) popcount bitlen digitsum(n,base) isprime totient tau sigma omega mobius rad binomial factorial fib order(a,m) collatz_steps(n)
int(x). Nothing else exists: no import, no attributes, no strings, no loops. Powers and shifts are bounded (a result may have at most 1,000,000 bits).

EVERY CALL has a time and memory budget and runs in its own process; a call that is too big is stopped and says so. Ask for less and widen
only when the small answer was interesting. Lists in answers are cut and say how many were left out.
"""

mcp = FastMCP("Leak-Lab-CAS", instructions=INSTRUCTIONS)

Int = int  # for readability in the signatures below


@mcp.tool
def evaluate(
    expression: Annotated[str, Field(description="An expression in the lab language, e.g. '2**61 - 1', 'order(2, 233)', '(3**13 - 1)//2 % 7'. Variables only if you pass `variables`.")],
    variables: Annotated[dict[str, int] | None, Field(description="Whole-number values for the names used in the expression, e.g. {'n': 27}. Omit when there are none.")] = None,
) -> dict[str, Any]:
    """Evaluate one exact arithmetic expression (integers and fractions, never floating point).

    USE WHEN you need the exact value of a closed numeric expression, or want to spot-check a formula at a point.
    NOT FOR many values of one formula (use `tabulate`), factoring (use `factor`) or searching a range (use `scan_predicate`).

    LIMITS: 10 s and 1.5 GiB; an expression has at most 400 syntax nodes; a power or shift may not produce more than 1,000,000 bits; a result
    with more than 400 digits is shown as its first and last 40 digits and its digit count.
    RETURNS: result.value (exact; a fraction prints as 'p/q'), result.bits, and result.mod_small (the value mod 2,3,4,5,7,8,9,11,13,16).
    LEAN: a closed numeric identity is `example : <lhs> = <rhs> := by norm_num` (or `by decide` when the numbers are small).
    EXAMPLE: evaluate("3**5 + 1") -> value 244; result.mod_small shows 244 is 4 mod 8.
    """
    return call("evaluate", expression=expression, variables=variables)


@mcp.tool
def factor(
    n: Annotated[int, Field(description="The integer to factor, at least 2. Up to roughly 60 digits is realistic; harder numbers are stopped by the time limit, not guessed.", ge=2)],
) -> dict[str, Any]:
    """Factor an integer into primes, with a primality check of every factor.

    USE WHEN you need the prime factorisation of a specific number (a gap 2^K - 3^j, a cofactor, a modulus), for instance to choose a prime modulus
    that rules a pattern out. NOT FOR many small factorisations (`arithmetic` is cheaper and gives totient/sigma too) or for primality alone (`primes`).

    LIMITS: 25 s. Uses trial division, Pollard rho, p-1 and ECM; a number with two large prime factors will time out. Every returned prime is
    re-checked (exactly below 3.3e24).
    RETURNS: result.factors = [{prime, exponent, verified_prime}], result.squarefree, result.distinct_primes.
    LEAN: `Nat.Prime p` for each prime is `by norm_num`; the product is `example : n = p1^e1 * p2^e2 := by norm_num`. Both are kernel-only.
    EXAMPLE: factor(1631) -> 7 * 233 (1631 is 2^13 - 3^8, the gap behind the modulus 233).
    """
    return call("factor", n=n)


@mcp.tool
def primes(
    operation: Annotated[str, Field(description="One of: 'is_prime' (needs n), 'next' / 'prev' (needs n: the next or previous prime), 'count' (needs lo, hi: how many primes lie in [lo, hi]), 'list' (needs lo, hi: the primes themselves).")],
    n: Annotated[int | None, Field(description="The number for is_prime, next and prev.")] = None,
    lo: Annotated[int | None, Field(description="Lower end of the range for count and list.")] = None,
    hi: Annotated[int | None, Field(description="Upper end of the range for count and list; at most 10,000,000.")] = None,
    limit: Annotated[int, Field(description="How many primes 'list' returns at most (1 to 500).", ge=1, le=500)] = 100,
) -> dict[str, Any]:
    """Primality, neighbouring primes, and prime counts or lists in a range.

    USE WHEN you need to know if a number is prime, want the next prime after a bound, or want primes in a short interval.
    NOT FOR factoring (use `factor`) or asking about many numbers by a property (use `scan_predicate` with isprime).

    LIMITS: 20 s; a range may reach 10,000,000. is_prime is exact below 3.3e24 (Miller-Rabin with 12 fixed bases) and a strong probable-prime test above.
    RETURNS: for is_prime: result.is_prime and how it was decided; for next/prev: the prime; for count: result.count; for list: result.primes (cut at `limit`) and result.count.
    LEAN: `Nat.Prime n` and `¬ Nat.Prime n` are both `by norm_num`.
    EXAMPLE: primes("is_prime", n=233) -> true; primes("count", lo=1, hi=1000) -> 168.
    """
    return call("primes", operation=operation, n=n, lo=lo, hi=hi, limit=limit)


@mcp.tool
def arithmetic(
    n: Annotated[int, Field(description="A positive integer up to 10^12.", ge=1, le=10**12)],
) -> dict[str, Any]:
    """The standard arithmetic functions of one number: factorisation, totient, divisor count and sum, Mobius, radical, 2-adic valuation, binary form.

    USE WHEN you want the multiplicative profile of a number at a glance (a modulus, a gap, a cycle length).
    NOT FOR numbers above 10^12 (use `factor`) or for a property across a range (use `scan_predicate`).

    LIMITS: 10 s; trial division only, hence n <= 10^12.
    RETURNS: result.{factorisation, totient, tau, sigma, omega, mobius, radical, v2, binary, popcount}.
    LEAN: `Nat.totient n = t` is `by decide` for small n; the factorisation is `by norm_num`.
    EXAMPLE: arithmetic(233) -> prime; totient 232, tau 2, sigma 234.
    """
    return call("arithmetic", n=n)


@mcp.tool
def base_digits(
    n: Annotated[int, Field(description="The number whose digits you want (its absolute value is used).")],
    base: Annotated[int, Field(description="The base, from 2 to 1,048,576. Default 10; use 2 to see the binary shape of a Collatz-like orbit.", ge=2, le=1048576)] = 10,
) -> dict[str, Any]:
    """The digits of a number in any base, with digit sum and (in base 2) popcount.

    USE WHEN the question is about digits, carries, or binary structure (Kummer-style carry arguments, digit sums, parity patterns).
    NOT FOR many numbers at once (use `tabulate` with digitsum or popcount).

    LIMITS: 10 s. RETURNS: result.digits_least_significant_first (the order Mathlib's Nat.digits uses), result.length, result.digit_sum, result.popcount (base 2).
    LEAN: `Nat.digits b n = [...]` is `by norm_num`; a digit sum is `(Nat.digits b n).sum = s := by norm_num`.
    EXAMPLE: base_digits(27, base=2) -> [1,1,0,1,1], digit sum 4.
    """
    return call("base_digits", n=n, base=base)


@mcp.tool
def mod_pow(
    base: Annotated[int, Field(description="The base a: the number that is raised to the power.")],
    exponent: Annotated[int, Field(description="The exponent k. Negative means the modular inverse power (the base must then be a unit).")],
    modulus: Annotated[int, Field(description="The modulus m, at least 1.", ge=1)],
) -> dict[str, Any]:
    """Compute base**exponent mod modulus exactly, for huge exponents.

    USE WHEN you need one modular power. NOT FOR the whole cycle of powers (use `power_cycle`) or the order of an element (use `mod_order`).

    LIMITS: 10 s; the exponent may have many thousands of digits. RETURNS: result.value in [0, modulus).
    LEAN: `example : ((a : ℕ) ^ k) % m = v := by norm_num` for moderate k; for ZMod, `(a : ZMod m)^k = v := by decide` when k is small.
    EXAMPLE: mod_pow(2, 10**18, 233) -> value of 2^(10^18) mod 233 (2 has order 29 there).
    """
    return call("mod_pow", base=base, exponent=exponent, modulus=modulus)


@mcp.tool
def power_cycle(
    base: Annotated[int, Field(description="The base a whose powers a^0, a^1, a^2, ... are listed mod m.")],
    modulus: Annotated[int, Field(description="The modulus m, from 2 to 10^9.", ge=2, le=10**9)],
    show: Annotated[int, Field(description="How many leading powers to list (1 to 500).", ge=1, le=500)] = 64,
) -> dict[str, Any]:
    """The sequence of powers of a number modulo m: its preperiod, its period, and the first terms.

    USE WHEN you want to SEE how 2^k or 3^k behaves mod m (period, which residues occur) before arguing about it.
    NOT FOR the multiplicative order alone (use `mod_order`) or subgroup structure and cosets (use `unit_group`).

    LIMITS: 20 s; orbits longer than 2,000,000 terms are refused.
    RETURNS: result.{preperiod, period, first_terms}. A base that is a unit has preperiod 0 and its period is its order.
    LEAN: order claims are `(a : ZMod m)^period = 1 := by decide` plus `∀ k < period, 0 < k → (a : ZMod m)^k ≠ 1` by `decide` (small m).
    EXAMPLE: power_cycle(2, 233, show=10) -> period 29, terms 1,2,4,8,16,32,64,128,23,46.
    """
    return call("power_cycle", base=base, modulus=modulus, show=show)


@mcp.tool
def mod_order(
    a: Annotated[int, Field(description="The element; it must be coprime to the modulus.")],
    m: Annotated[int, Field(description="The modulus, from 2 to 10^12.", ge=2, le=10**12)],
) -> dict[str, Any]:
    """The multiplicative order of a modulo m, with the factorisation of the order and whether a is a primitive root.

    USE WHEN you need ord_m(a): the length of the cycle of powers, or to test whether a generates all units.
    NOT FOR the group structure around it (use `unit_group`).

    LIMITS: 10 s; m is factored by trial division, hence at most 10^12.
    RETURNS: result.{order, totient, order_factorisation, is_primitive_root}; an error if gcd(a, m) != 1.
    LEAN: `orderOf (a : ZMod m) = o` via `orderOf_eq_of_pow_and_pow_div_prime`: prove a^o = 1 and a^(o/p) != 1 for each prime p | o, all by `decide` for small m.
    EXAMPLE: mod_order(2, 233) -> order 29 (a proper divisor of 232, so 2 is not a primitive root).
    """
    return call("mod_order", a=a, m=m)


@mcp.tool
def unit_group(
    modulus: Annotated[int, Field(description="The modulus m, from 2 to 2,000,000.", ge=2, le=2000000)],
    generators: Annotated[list[int] | None, Field(description="Units whose subgroup you want, e.g. [2, 3]. Omit to see only the group itself.")] = None,
    test: Annotated[int | None, Field(description="An element to test for membership in the subgroup generated by `generators`.")] = None,
    show: Annotated[int, Field(description="How many coset representatives to list (1 to 200).", ge=1, le=200)] = 40,
) -> dict[str, Any]:
    """The group of units mod m: its order, whether it is cyclic, and the subgroup generated by chosen elements with its index and cosets.

    USE WHEN a pattern lives in a quotient: 'do 2 and 3 generate everything mod p?', 'which coset does this term fall in?', 'are the terms of a sum in
    distinct cosets of <2>?'. This is the structure behind residue-class obstructions.
    NOT FOR a single order (use `mod_order`) or the raw sequence of powers (use `power_cycle`).

    LIMITS: 30 s; m <= 2,000,000. The subgroup is built by closure, so its order must fit in memory (it always does at this size).
    RETURNS: result.{unit_group_order, cyclic, smallest_primitive_root}; with generators also subgroup_order, index, coset_representatives, and test_in_subgroup.
    LEAN: statements about a subgroup of ZMod m are finite: `∀ k < o, (g : ZMod m)^k ≠ t` by `decide` (keep m small), or argue with `orderOf` and `Subgroup.index`.
    EXAMPLE: unit_group(233, [2], test=3) -> order 232, <2> has order 29 and index 8, and 3 is not in <2>.
    """
    return call("unit_group", modulus=modulus, generators=generators, test=test, show=show)


@mcp.tool
def solve_congruence(
    a: Annotated[int, Field(description="Coefficient a in a*x = b (mod m).")],
    b: Annotated[int, Field(description="Right-hand side b.")],
    m: Annotated[int, Field(description="The modulus, at least 1.", ge=1)],
) -> dict[str, Any]:
    """Solve the linear congruence a*x = b (mod m): whether it is solvable, the number of solutions, and the smallest one.

    USE WHEN you need to know which residue classes satisfy a linear condition. NOT FOR systems (use `crt`) or higher degree (use `solve_polynomial_mod`).

    LIMITS: 10 s. RETURNS: result.{solvable, gcd, solutions_mod, x_mod_m2, all_solutions_mod_m}: x = x_mod_m2 (mod m/gcd) gives every solution.
    LEAN: a solution is `a * x ≡ b [ZMOD m]` by `decide`; unsolvability follows from gcd not dividing b (`Int.gcd_dvd_iff`/`omega`).
    EXAMPLE: solve_congruence(6, 4, 10) -> gcd 2, x = 4 (mod 5), so x in {4, 9} mod 10.
    """
    return call("solve_congruence", a=a, b=b, m=m)


@mcp.tool
def crt(
    residues: Annotated[list[int], Field(description="The residues r_1, ..., r_k.")],
    moduli: Annotated[list[int], Field(description="The moduli m_1, ..., m_k (same length as residues; they need not be coprime).")],
) -> dict[str, Any]:
    """Chinese remainder theorem: combine congruences x = r_i (mod m_i) into one, or report that they are inconsistent.

    USE WHEN you have several congruence conditions on one unknown and want the single combined class. NOT FOR one congruence a*x = b (use `solve_congruence`).

    LIMITS: 10 s. RETURNS: result.{consistent, x, modulo}; when inconsistent, which pair failed.
    LEAN: for coprime moduli `Nat.chineseRemainder`; for small numbers state the congruences and close with `omega`.
    EXAMPLE: crt([2, 3], [4, 9]) -> x = 30 (mod 36).
    """
    return call("crt", residues=residues, moduli=moduli)


@mcp.tool
def solve_polynomial_mod(
    coefficients: Annotated[list[int], Field(description="Coefficients of f, LOWEST degree first: [c0, c1, c2] means c0 + c1*x + c2*x^2.")],
    modulus: Annotated[int, Field(description="The modulus, from 1 to 2,000,000.", ge=1, le=2000000)],
    limit: Annotated[int, Field(description="How many roots to list at most (1 to 500).", ge=1, le=500)] = 64,
) -> dict[str, Any]:
    """All roots of a polynomial modulo m, found by checking every residue.

    USE WHEN you need the residues where a polynomial vanishes mod m (squares, cube roots, obstructions to a Diophantine equation).
    NOT FOR large moduli (above 2,000,000) or roots over the integers (use `polynomial` with factor).

    LIMITS: 25 s. RETURNS: result.{root_count, roots}.
    LEAN: 'no root mod m' is `∀ x : ZMod m, f x ≠ 0 := by decide` for small m; otherwise factor m and combine with `crt`.
    EXAMPLE: solve_polynomial_mod([1, 0, 1], 13) -> x^2 + 1 = 0 (mod 13) has roots 5 and 8.
    """
    return call("solve_polynomial_mod", coefficients=coefficients, modulus=modulus, limit=limit)


_MAP = "A map. A name ('collatz' = n/2 or 3n+1; 'collatz_shortcut' = n/2 or (3n+1)/2), a family like '5n+1', '3n-1' or '3n+3' (add '_shortcut' to halve after the odd step), or {'modulus': m, 'pieces': [[a, b, d], ...]} meaning: on n = r (mod m) go to (a*n + b)/d with (a, b, d) = pieces[r]."


@mcp.tool
def map_orbit(
    map: Annotated[str | dict, Field(description=_MAP)],
    start: Annotated[int, Field(description="The starting integer (negative allowed).")],
    max_steps: Annotated[int, Field(description="Stop after this many steps (1 to 2,000,000).", ge=1, le=2000000)] = 10000,
    show: Annotated[int, Field(description="How many leading values to return (1 to 400).", ge=1, le=400)] = 60,
) -> dict[str, Any]:
    """Iterate an integer map from a start value: the orbit, its peak, and the cycle it falls into if it reaches one.

    USE WHEN you want to see one trajectory (its residues, its excursions), or confirm that a specific start reaches 1 or a given cycle.
    NOT FOR statistics over a range (use `map_scan`) or for the structure of all trajectories (use `map_cylinders`).

    LIMITS: 20 s; an orbit whose values exceed 200,000 bits is stopped.
    RETURNS: result.{steps_taken, reached_cycle, cycle{starts_at_step, length, elements, smallest}, peak, first_values, last_values, parities_or_classes}.
    LEAN: one concrete orbit is a finite computation: `decide`/`norm_num [Function.iterate_succ]` for small N and n. Do not use decide on big numbers.
    EXAMPLE: map_orbit("collatz", 27) -> 111 steps, peak 9232, ends in the cycle 4,2,1.
    """
    return call("map_orbit", map=map, start=start, max_steps=max_steps, show=show)


@mcp.tool
def map_scan(
    map: Annotated[str | dict, Field(description=_MAP)],
    lo: Annotated[int, Field(description="First starting value, at least 1.", ge=1)],
    hi: Annotated[int, Field(description="Last starting value.")],
    until: Annotated[str, Field(description="When a start is 'done': 'below_start' (the first step where the value is smaller than the start: the stopping time) or 'target:<integer>' (the first time the orbit hits that value, e.g. 'target:1').")] = "below_start",
    step_cap: Annotated[int, Field(description="Give up on a start after this many steps; it is then listed as unresolved.", ge=1, le=100000)] = 5000,
    modulus_report: Annotated[int, Field(description="Report mean and max steps by start residue modulo this number (1 to 256).", ge=1, le=256)] = 16,
    records: Annotated[int, Field(description="How many record-setting starts to list (1 to 50).", ge=1, le=50)] = 12,
) -> dict[str, Any]:
    """Stopping-time statistics of an integer map over a range of starts: records, histogram, the residue classes that take longest, unresolved starts.

    USE WHEN you want data about WHICH starts are slow and why (compare residue classes), or to look for starts that do not resolve at all.
    NOT FOR a single orbit (use `map_orbit`) or a proof-oriented description of the classes (use `map_cylinders`).

    LIMITS: 25 s of work and a 12 s loop budget; `tested_up_to` and `completed` say how far it got. The range is not capped but time is.
    RETURNS: result.{tested_up_to, completed, mean_steps, max_steps, argmax, record_holders, not_resolved_within_step_cap, highest_value_reached, steps_histogram_by_bit_length, by_residue_class}.
    LEAN: this is an observation. A finite fact such as 'every n in [1, N] has stopping time <= S' is checkable by `decide` (small N) or `interval_cases`.
    EXAMPLE: map_scan("collatz_shortcut", 1, 100000) -> max stopping time and its start, and which classes mod 16 are slowest.
    """
    return call("map_scan", map=map, lo=lo, hi=hi, until=until, step_cap=step_cap, modulus_report=modulus_report, records=records)


@mcp.tool
def map_cylinders(
    map: Annotated[str | dict, Field(description=_MAP)],
    depth: Annotated[int, Field(description="How many steps of the itinerary to follow (1 to 24).", ge=1, le=24)],
    stop_when_contracting: Annotated[bool, Field(description="True: stop following a class as soon as its affine map has slope < 1 (the orbit has provably come down). False: follow every class to full depth.")] = True,
    show: Annotated[int, Field(description="How many classes to list (1 to 200); contracting ones first, then the smallest slopes.", ge=1, le=200)] = 40,
) -> dict[str, Any]:
    """The tree of residue classes of an integer map: for each class, the exact affine map the orbit follows, and what fraction of integers provably come down.

    USE WHEN you want the modular structure: 'n = R (mod M) goes to slope*n + offset after k steps' (the Terras/Everett picture), the density of starts
    already settled at depth k, and the classes still open. This is the right tool for residue-class arguments.
    NOT FOR actual orbits (use `map_orbit`) or for cycles (use `map_cycles`).

    LIMITS: 25 s; depth <= 24; the walk refuses more than 3,000,000 nodes. Exact rational arithmetic throughout.
    RETURNS: result.{classes, classes_with_slope_below_1, density_coming_down_within_depth (a fraction), classes_still_open, density_still_open, smallest_open_slope, classes_shown[{word, class, slope, offset, contracting}]}.
    LEAN: for a class, prove `∀ n, n % M = R → T^[k] n = (P * n + c) / D` by unfolding k steps (`Nat.add_mul_div_left`, `omega`); the density is a finite count over `Fin M`.
    EXAMPLE: map_cylinders("collatz_shortcut", 14) -> 876 classes; 7825/8192 of all integers come down within 14 steps; 734 classes remain open.
    """
    return call("map_cylinders", map=map, depth=depth, stop_when_contracting=stop_when_contracting, show=show)


@mcp.tool
def map_cycles(
    map: Annotated[str | dict, Field(description=_MAP)],
    max_length: Annotated[int, Field(description="Find every periodic orbit whose itinerary has at most this many steps (1 to 22).", ge=1, le=22)],
    include_negative: Annotated[bool, Field(description="True: also report cycles through zero and negative integers (3n+1 has the cycles of -1, -5 and -17). False: positive integers only.")] = True,
    show: Annotated[int, Field(description="How many cycles to list (1 to 100).", ge=1, le=100)] = 30,
) -> dict[str, Any]:
    """All periodic orbits of an integer map up to a given length, by solving the cycle equation for every itinerary.

    USE WHEN you ask 'is there a cycle of length <= L?' (the Steiner / Bohm-Sontacchi equation n*(M - P) = M*Q - P*R solved per word and checked by iterating), or
    when you compare cycle structure across maps (3n+1, 3n-1, 5n+1, your own pieces).
    NOT FOR long cycles (the number of words doubles with each step) or for orbits that never repeat.

    LIMITS: 30 s; max_length <= 22; at most 3,000,000 words.
    RETURNS: result.{cycle_count, words_examined, cycles[{length, smallest, orbit_from_smallest}]}. The list is COMPLETE for the length asked: any other cycle is longer.
    LEAN: each listed cycle is a finite check by `decide`; 'no other cycle up to length L' is a statement per word, closed by `omega` on the cycle equation, or by `decide` over `Fin (2^L)`.
    EXAMPLE: map_cycles("collatz_shortcut", 14) -> the cycles {1,2}, {-1}, {0}, {-5,-7,-10}, and an 11-cycle through -136.
    """
    return call("map_cycles", map=map, max_length=max_length, include_negative=include_negative, show=show)


@mcp.tool
def polynomial(
    operation: Annotated[str, Field(description="One of: 'expand', 'factor', 'gcd' (two expressions), 'resultant' (two), 'discriminant', 'groebner'. Resultant and discriminant are taken in the FIRST variable.")],
    expressions: Annotated[list[str], Field(description="The polynomial(s), e.g. ['x^4 - 3*x^2 + 2']. Use ^ or **; only the declared variables, whole numbers, + - * and powers up to 64; '/ 2' by a constant is allowed.")],
    variables: Annotated[list[str], Field(description="The variable names, e.g. ['x'] or ['x', 'y'] (1 to 8).")],
    order: Annotated[str, Field(description="Monomial order for groebner: 'lex', 'grlex' or 'grevlex'.")] = "lex",
) -> dict[str, Any]:
    """Exact polynomial algebra over the rationals: expand, factor, gcd, resultant, discriminant, Groebner basis.

    USE WHEN you want to see the factorisation of a polynomial family (a quartic in s^2 that splits), eliminate a variable, or understand an ideal.
    NOT FOR proving an identity from hypotheses (use `ideal_certificate`, which returns coefficients Lean can check).

    LIMITS: 25 s. Input is read by a whitelist reader, never evaluated as Python. RETURNS: the requested object as text in Lean syntax (x^2, not x**2).
    LEAN: an identity `p = q` is `by ring`; a factorisation is checked the same way; a Groebner basis is evidence about the ideal, not a Lean proof.
    EXAMPLE: polynomial("factor", ["x^4 - 3*x^2 + 2"], ["x"]) -> (x - 1)*(x + 1)*(x^2 - 2).
    """
    return call("polynomial", operation=operation, expressions=expressions, variables=variables, order=order)


@mcp.tool
def ideal_certificate(
    goal: Annotated[str, Field(description="The equation to derive, written 'lhs = rhs' (single '='), e.g. 'x^2 = 1'.")],
    hypotheses: Annotated[list[str], Field(description="The equations you may use, each 'lhs = rhs' (or a bare polynomial meaning '= 0'). They become h1, h2, ... in this order. 1 to 12.")],
    variables: Annotated[list[str], Field(description="The variable names used, e.g. ['x', 'y'] (1 to 8).")],
    max_degree: Annotated[int, Field(description="Highest total degree allowed for each multiplier polynomial (0 to 8). Start at 2; raise it if nothing is found.", ge=0, le=8)] = 3,
) -> dict[str, Any]:
    """Find multipliers c_i with goal = sum c_i * h_i, checked exactly; the answer is a Lean `linear_combination` line.

    USE WHEN the target equation follows from some equations by multiplying and adding (the shape polyrith handles). It returns coefficients, and
    Leak IV's `ring` checks them: this is how a CAS insight becomes a kernel-checked fact with no new trusted component.
    NOT FOR inequalities, for equations that need division, or for goals that need case analysis.

    LIMITS: 40 s; at most 2,500 unknown coefficients (hypotheses x monomials up to max_degree). Solved by exact linear algebra over the rationals, then re-expanded as a check.
    RETURNS: result.found, result.multipliers{h1: poly, ...}, and the ready line in `lean`. found=false means no certificate of that degree exists (not that the goal is false); when max_degree is below what the goal's degree needs (a goal of degree d usually needs multipliers of degree d - 1, at most 8 here) the note says so and names the degree to try.
    LEAN: `linear_combination (c1) * h1 + (c2) * h2`. It is checked by `ring`, so the type must be a commutative ring (ℤ or ℚ; cast ℕ first with `zify`/`push_cast`).
    EXAMPLE: ideal_certificate("x^2 = 1", ["x = y", "y^2 = 1"], ["x", "y"], 2) -> (x + y) * h1 + (1) * h2.
    """
    return call("ideal_certificate", goal=goal, hypotheses=hypotheses, variables=variables, max_degree=max_degree)


@mcp.tool
def scan_predicate(
    predicate: Annotated[str, Field(description="A yes/no expression in the lab language over one variable, e.g. 'totient(n) % 4 == 0' or 'vp(3**n - 1, 2) <= n'. See the server instructions for the functions.")],
    variable: Annotated[str, Field(description="The name of the variable in the predicate, e.g. 'n'.")],
    lo: Annotated[int, Field(description="First value of the variable.")],
    hi: Annotated[int, Field(description="Last value of the variable; at most 50,000,000 values in the range.")],
    step: Annotated[int, Field(description="Step between values (1 tests every integer).", ge=1)] = 1,
    show: Annotated[int, Field(description="How many counterexamples or witnesses to list (1 to 200).", ge=1, le=200)] = 10,
    want: Annotated[str, Field(description="'counterexamples' lists values where the predicate is FALSE (testing a conjecture); 'witnesses' lists values where it is TRUE (hunting for an example).")] = "counterexamples",
) -> dict[str, Any]:
    """Test a conjecture on a range: evaluate a predicate for every value and report counterexamples (or witnesses).

    USE WHEN you have stated a conjecture 'for all n in a family, P(n)' and want to try to break it fast, or you search for the first n with a property.
    State the conjecture in one line BEFORE you scan. NOT FOR a statistic over many values (use `residue_histogram`) or orbits of a map (use `map_scan`).

    LIMITS: 25 s call, 15 s loop; about 2,000,000 evaluations per second for simple predicates. `tested_up_to` and `complete` say how far it got.
    RETURNS: result.{tested, tested_up_to, complete, true_count, false_count, counterexamples|witnesses, errors, none_found}.
    LEAN: no counterexample on a range is evidence, not a theorem; its finite form `∀ n < N, P n` is `decide` for small N (mind the 5-digit kernel guard) or `interval_cases n <;> omega`.
    EXAMPLE: scan_predicate("isprime(n) or n % 6 != 5", "n", 1, 2000) -> counterexamples 35, 65, 77... (composites that are 5 mod 6).
    """
    return call("scan_predicate", predicate=predicate, variable=variable, lo=lo, hi=hi, step=step, show=show, want=want)


@mcp.tool
def tabulate(
    expression: Annotated[str, Field(description="An expression in the lab language over one variable, e.g. 'collatz_steps(n)' or '3**n % 233'.")],
    variable: Annotated[str, Field(description="The variable name used in the expression, e.g. 'n'.")],
    lo: Annotated[int, Field(description="First value.")],
    hi: Annotated[int, Field(description="Last value; at most 100,001 values in the range.")],
    step: Annotated[int, Field(description="Step between values.", ge=1)] = 1,
    modulus: Annotated[int | None, Field(description="If given, each value is reduced modulo this number before it is shown.")] = None,
) -> dict[str, Any]:
    """A table of values of an expression: [x, f(x)] rows, optionally reduced mod m.

    USE WHEN you want to look at the first terms of a sequence before guessing its law (then pass the values to `guess_sequence`).
    NOT FOR large searches (use `scan_predicate`) or residue statistics (use `residue_histogram`).

    LIMITS: 15 s; at most 100,001 rows; the answer is cut to fit and says how many rows were left out.
    RETURNS: result.rows = [[x, value], ...].
    LEAN: a table is for looking at, not for proving; any single row is `example : f x = v := by norm_num`.
    EXAMPLE: tabulate("3**n % 233", "n", 0, 12) -> 1, 3, 9, 27, 81, 10, 30, 90, 37, 111, 100, 67, 201.
    """
    return call("tabulate", expression=expression, variable=variable, lo=lo, hi=hi, step=step, modulus=modulus)


@mcp.tool
def residue_histogram(
    expression: Annotated[str, Field(description="An integer-valued expression in the lab language over one variable, e.g. 'popcount(n)' or 'n*n + 1'.")],
    variable: Annotated[str, Field(description="The variable name used in the expression.")],
    lo: Annotated[int, Field(description="First value of the variable.")],
    hi: Annotated[int, Field(description="Last value; at most 5,000,000 values in the range.")],
    modulus: Annotated[int, Field(description="Residues are counted modulo this number, from 2 to 100,000.", ge=2, le=100000)],
    step: Annotated[int, Field(description="Step between values.", ge=1)] = 1,
) -> dict[str, Any]:
    """Which residues mod m the values of an expression hit, how often, and which they never hit.

    USE WHEN you suspect an obstruction ('this family is never 0 mod 233') and want the evidence, with the expected count for pure chance beside it.
    NOT FOR a single value (use `evaluate`) or for true/false questions (use `scan_predicate`).

    LIMITS: 25 s; at most 5,000,000 values.
    RETURNS: result.{values_counted, residues_hit, residues_missed, missed_count, most_common, least_common_hit, mean_per_residue, zero_is_hit}, and a note giving the number of misses chance alone would produce.
    LEAN: 'residue r is never hit' over a finite family is `∀ x ∈ Finset.range N, f x % m ≠ r` by `decide`; over all x it needs the reason (a subgroup, a valuation, a descent).
    EXAMPLE: residue_histogram("n*n", "n", 0, 1000, 13) -> squares mod 13 miss residues 2,5,6,7,8,11.
    """
    return call("residue_histogram", expression=expression, variable=variable, lo=lo, hi=hi, modulus=modulus, step=step)


@mcp.tool
def guess_sequence(
    terms: Annotated[list[int], Field(description="The first terms of a sequence of integers, in order (4 to 400 of them). More terms make a guess more convincing.")],
    max_order: Annotated[int, Field(description="Largest linear-recurrence order to report (1 to 12).", ge=1, le=12)] = 8,
    modulus_scan: Annotated[int, Field(description="Check for periodicity modulo every m up to this number (2 to 1000).", ge=2, le=1000)] = 64,
) -> dict[str, Any]:
    """Guess the law behind a sequence: polynomial, linear recurrence, geometric, or eventually periodic modulo some m.

    USE WHEN you have computed terms (from `tabulate`, `map_scan`, your own thinking) and want candidate laws to turn into conjectures.
    NOT FOR proving the law, and not for sequences with no algebraic structure.

    LIMITS: 15 s. The recurrence uses Berlekamp-Massey over the rationals and is reported only when the terms over-determine it (2*order + 1 <= terms); `spare_terms` says how many extra terms it predicted correctly.
    RETURNS: result.found with any of {polynomial{degree}, linear_recurrence{order, law, spare_terms}, geometric{ratio}, periodic_mod{m: {preperiod, period}}}.
    LEAN: a guessed law is a conjecture: state `∀ n, a (n+2) = c1 * a (n+1) + c2 * a n` and prove it by induction (or by `ring` if there is a closed form); check the first terms by `decide` first.
    EXAMPLE: guess_sequence([0,1,1,2,3,5,8,13,21,34,55,89]) -> a(n) = (1)*a(n-1) + (1)*a(n-2), 8 spare terms.
    """
    return call("guess_sequence", terms=terms, max_order=max_order, modulus_scan=modulus_scan)


def main() -> None:
    mcp.run(transport="sse", host=os.environ.get("LAB_HOST", "0.0.0.0"), port=int(os.environ.get("LAB_PORT", "8021")))


if __name__ == "__main__":
    main()
