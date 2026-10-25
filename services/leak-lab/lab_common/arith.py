"""Exact integer arithmetic with no dependencies: the functions the expression language offers, and what the CAS tools build on.

Everything here is bounded: a function that could run for ever refuses an argument that is too large instead.
"""
from __future__ import annotations

import math

SMALL_PRIMES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)
MAX_BITS = 1_000_000  # no result of ** or << may have more bits than this
TRIAL_LIMIT = 10**12  # arithmetic functions that factor (totient, divisors, ...) refuse larger arguments


class LabError(ValueError):
    """An argument the lab refuses, with a message the driver can act on."""


def is_prime(n: int) -> bool:
    """Deterministic Miller-Rabin: exact for n < 3.3e24 (the first 12 primes as bases), which covers every n this lab factors."""
    if n < 2:
        return False
    for p in SMALL_PRIMES:
        if n % p == 0:
            return n == p
    d, s = n - 1, 0
    while d % 2 == 0:
        d //= 2
        s += 1
    for a in SMALL_PRIMES:
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(s - 1):
            x = x * x % n
            if x == n - 1:
                break
        else:
            return False
    return True


def factor_small(n: int) -> dict[int, int]:
    """Prime factorisation by trial division; refuses n above TRIAL_LIMIT (use the CAS `factor` tool, which has Pollard rho and ECM)."""
    if n < 1:
        raise LabError("factorisation needs a positive integer")
    if n > TRIAL_LIMIT:
        raise LabError(f"{n} is larger than {TRIAL_LIMIT:,}: this function only trial-divides; use the factor tool for larger numbers")
    out: dict[int, int] = {}
    for p in (2, 3):
        while n % p == 0:
            out[p] = out.get(p, 0) + 1
            n //= p
    f = 5
    while f * f <= n:
        for p in (f, f + 2):
            while n % p == 0:
                out[p] = out.get(p, 0) + 1
                n //= p
        f += 6
    if n > 1:
        out[n] = out.get(n, 0) + 1
    return out


def totient(n: int) -> int:
    r = n
    for p in factor_small(n):
        r -= r // p
    return r


def tau(n: int) -> int:
    r = 1
    for e in factor_small(n).values():
        r *= e + 1
    return r


def sigma(n: int) -> int:
    r = 1
    for p, e in factor_small(n).items():
        r *= (p ** (e + 1) - 1) // (p - 1)
    return r


def omega(n: int) -> int:
    return len(factor_small(n))


def mobius(n: int) -> int:
    f = factor_small(n)
    return 0 if any(e > 1 for e in f.values()) else (-1) ** len(f)


def radical(n: int) -> int:
    r = 1
    for p in factor_small(n):
        r *= p
    return r


def valuation(n: int, p: int) -> int:
    """The exponent of the prime p in n (n != 0)."""
    if n == 0:
        raise LabError("the valuation of 0 is infinite")
    if p < 2:
        raise LabError("the base of a valuation must be at least 2")
    n, c = abs(n), 0
    while n % p == 0:
        n //= p
        c += 1
    return c


def popcount(n: int) -> int:
    return bin(abs(n)).count("1")


def digit_sum(n: int, base: int = 10) -> int:
    if base < 2:
        raise LabError("the base must be at least 2")
    n, s = abs(n), 0
    while n:
        n, r = divmod(n, base)
        s += r
    return s


def digits(n: int, base: int = 10) -> list[int]:
    """Digits of |n| in the given base, least significant first (the order Mathlib's Nat.digits uses)."""
    if base < 2:
        raise LabError("the base must be at least 2")
    n, out = abs(n), []
    while n:
        n, r = divmod(n, base)
        out.append(r)
    return out or [0]


def safe_pow(a: int, b: int, m: int | None = None) -> int:
    if m is not None:
        if m == 0:
            raise LabError("modulus 0")
        return pow(a, b, m)
    if b < 0:
        raise LabError("a negative exponent is not an integer; use modular inverse or write a fraction")
    if a in (0, 1, -1) or b == 0:
        return a**b
    if b * max(1, abs(a).bit_length() - 1) > MAX_BITS:
        raise LabError(f"{a}**{b} would have more than {MAX_BITS:,} bits")
    return a**b


def safe_shl(a: int, b: int) -> int:
    if b < 0 or (a != 0 and b + abs(a).bit_length() > MAX_BITS):
        raise LabError("shift out of range")
    return a << b


def binomial(n: int, k: int) -> int:
    if n < 0 or k < 0:
        raise LabError("binomial needs non-negative arguments")
    if n > 200_000:
        raise LabError("binomial: n is limited to 200,000")
    return math.comb(n, k)


def factorial(n: int) -> int:
    if not 0 <= n <= 20_000:
        raise LabError("factorial: n must be between 0 and 20,000")
    return math.factorial(n)


def fibonacci(n: int) -> int:
    if not 0 <= n <= 200_000:
        raise LabError("fib: n must be between 0 and 200,000")
    a, b = 0, 1
    for bit in bin(n)[2:]:  # fast doubling
        a, b = a * (2 * b - a), a * a + b * b
        if bit == "1":
            a, b = b, a + b
    return a


def multiplicative_order(a: int, m: int) -> int:
    """The least k >= 1 with a**k = 1 (mod m); needs gcd(a, m) = 1. Factors phi(m), so m must be below TRIAL_LIMIT."""
    if m < 2:
        raise LabError("the modulus must be at least 2")
    if math.gcd(a, m) != 1:
        raise LabError(f"{a} is not a unit modulo {m} (gcd {math.gcd(a, m)}), so it has no order")
    order = totient(m)
    for p, e in factor_small(order).items():
        for _ in range(e):
            if pow(a, order // p, m) == 1:
                order //= p
            else:
                break
    return order


def collatz_steps(n: int, cap: int = 100_000) -> int | None:
    """Steps of the 3n+1 map until 1, or None if it has not reached 1 after `cap` steps. n >= 1."""
    if n < 1:
        raise LabError("collatz_steps needs n >= 1")
    steps = 0
    while n != 1:
        n = n // 2 if n % 2 == 0 else 3 * n + 1
        steps += 1
        if steps > cap:
            return None
    return steps
