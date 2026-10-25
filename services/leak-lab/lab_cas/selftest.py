"""Run at image build time: the CAS tools must give the answers their descriptions promise, through the real worker and limits."""
from __future__ import annotations

import sys

from .client import call


def expect(name: str, cond: bool, detail: object = "") -> None:
    print(("ok   " if cond else "FAIL ") + name, "" if cond else detail)
    if not cond:
        sys.exit(1)


def main() -> None:
    r = call("mod_order", a=2, m=233)
    expect("mod_order(2, 233) = 29", r.get("ok") and r["result"]["order"] == 29, r)
    r = call("factor", n=1631)
    expect("factor(1631) = 7 * 233", r.get("ok") and [f["prime"] for f in r["result"]["factors"]] == [7, 233], r)
    r = call("map_cycles", map="collatz_shortcut", max_length=10)
    expect("collatz cycles up to length 10 include {1, 2}", r.get("ok") and any(c["smallest"] == 1 and c["length"] == 2 for c in r["result"]["cycles"]), r)
    r = call("ideal_certificate", goal="x^2 = 1", hypotheses=["x = y", "y^2 = 1"], variables=["x", "y"], max_degree=2)
    expect("ideal_certificate finds (x + y) * h1 + h2", r.get("ok") and r["result"]["found"] and "(x + y) * h1" in r["lean"], r)
    r = call("evaluate", expression="__import__('os').system('id')")
    expect("an injection attempt is refused", r.get("ok") is False, r)
    r = call("scan_predicate", predicate="isprime(n) or n % 6 != 5", variable="n", lo=1, hi=200)
    expect("scan_predicate finds 35", r.get("ok") and r["result"]["counterexamples"][0] == 35, r)
    print("CAS self-test passed")


if __name__ == "__main__":
    main()
