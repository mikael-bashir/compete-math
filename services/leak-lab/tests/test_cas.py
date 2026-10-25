import os
import sys
import unittest
from fractions import Fraction

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    import sympy  # noqa: F401

    HAVE_SYMPY = True
except ImportError:  # the container has it; a bare checkout may not
    HAVE_SYMPY = False

from lab_cas import algebra, data, maps, numtheory  # noqa: E402
from lab_cas.client import call  # noqa: E402
from lab_cas.ops import OPS  # noqa: E402


def result(d):
    assert d["ok"], d
    return d["result"]


class NumberTheory(unittest.TestCase):
    def test_the_modulus_233_facts_from_the_collatz_run(self):
        # an overnight run found these by hand: ord_233(2) = 29, 3 generates all 232 units, 3 is not in <2>, <2> has index 8
        self.assertEqual(result(numtheory.mod_order(2, 233))["order"], 29)
        self.assertEqual(result(numtheory.mod_order(3, 233))["order"], 232)
        g = result(numtheory.unit_group(233, [2], test=3))
        self.assertEqual((g["unit_group_order"], g["subgroup_order"], g["index"], g["test_in_subgroup"], g["cyclic"]), (232, 29, 8, False, True))
        self.assertEqual(result(numtheory.power_cycle(2, 233, 10))["first_terms"], [1, 2, 4, 8, 16, 32, 64, 128, 23, 46])

    def test_gap_2_13_minus_3_8(self):
        self.assertEqual(2**13 - 3**8, 1631)
        f = result(numtheory.factor(1631))["factors"]
        self.assertEqual([(x["prime"], x["exponent"]) for x in f], [(7, 1), (233, 1)])

    @unittest.skipUnless(HAVE_SYMPY, "needs sympy")
    def test_factor_large(self):
        f = result(numtheory.factor(2**67 - 1))["factors"]
        self.assertEqual([x["prime"] for x in f], [193707721, 761838257287])
        self.assertTrue(all(x["verified_prime"] for x in f))

    def test_primes(self):
        self.assertTrue(result(numtheory.primes("is_prime", n=233))["is_prime"])
        self.assertEqual(result(numtheory.primes("count", lo=1, hi=1000))["count"], 168)
        self.assertFalse(numtheory.primes("count", lo=1, hi=10**8)["ok"])
        self.assertFalse(numtheory.primes("nope")["ok"])

    def test_congruences(self):
        self.assertEqual(result(numtheory.crt([2, 3], [4, 9]))["x"], 30)
        self.assertFalse(result(numtheory.crt([1, 2], [4, 6]))["consistent"])
        r = result(numtheory.solve_congruence(6, 4, 10))
        self.assertEqual((r["gcd"], r["x_mod_m2"], r["all_solutions_mod_m"]), (2, 4, [4, 9]))
        self.assertFalse(result(numtheory.solve_congruence(2, 1, 4))["solvable"])
        self.assertEqual(result(numtheory.solve_polynomial_mod([1, 0, 1], 13))["roots"], [5, 8])

    def test_refusals_are_answers_not_exceptions(self):
        self.assertFalse(numtheory.mod_order(2, 8)["ok"])
        self.assertFalse(numtheory.unit_group(100, [2])["ok"])
        self.assertFalse(numtheory.evaluate("os.system('id')")["ok"])
        self.assertIn("hint", numtheory.evaluate("2**10**10"))

    def test_big_values_are_summarised(self):
        v = result(numtheory.evaluate("7**5000"))["value"]
        self.assertIn("digits)", v)


class Maps(unittest.TestCase):
    def test_collatz_27(self):
        r = result(maps.map_orbit("collatz", 27))
        self.assertEqual((r["steps_taken"] >= 111, r["peak"]), (True, 9232))
        self.assertEqual(r["cycle"]["smallest"], 1)

    def test_cycles_of_the_3n_plus_1_map_up_to_length_14(self):
        r = result(maps.map_cycles("collatz_shortcut", 14))
        found = {tuple(sorted(c["orbit_from_smallest"])) for c in r["cycles"]}
        self.assertEqual(found, {(1, 2), (0,), (-1,), (-10, -7, -5), tuple(sorted([-136, -68, -34, -17, -25, -37, -55, -82, -41, -61, -91]))})

    def test_other_families_match_the_literature(self):
        pos = lambda spec, n: sorted(c["smallest"] for c in result(maps.map_cycles(spec, n, include_negative=False))["cycles"] if c["smallest"] > 0)  # noqa: E731
        self.assertEqual(pos("5n+1", 14), [1, 13, 17])  # 5n+1 has the 7-cycle through 1 and two 10-cycles
        self.assertEqual(pos("3n-1_shortcut", 14), [1, 5, 17])  # 3n-1 has the cycles through 1, 5 and 17

    def test_density_of_classes_that_come_down(self):
        r = result(maps.map_cylinders("collatz_shortcut", 14))
        self.assertEqual((r["classes"], r["density_coming_down_within_depth"], r["classes_still_open"]), (876, "7825/8192", 734))
        # depth 1: n even comes down at once (n/2), n odd does not yet
        r1 = result(maps.map_cylinders("collatz_shortcut", 1))
        self.assertEqual(r1["density_coming_down_within_depth"], "1/2")

    def test_cylinder_forms_are_exact(self):
        # on n = 3 (mod 4): two odd steps, n -> (3n+1)/2 -> (3(3n+1)/2 + 1)/2 = (9n+5)/4
        r = result(maps.map_cylinders("collatz_shortcut", 2, stop_when_contracting=False))
        row = next(c for c in r["classes_shown"] if c["class"] == "n = 3 (mod 4)")
        self.assertEqual((row["slope"], row["offset"]), ("9/4", "5/4"))
        for n in (3, 7, 11, 27):
            m = maps.parse_map("collatz_shortcut")
            self.assertEqual(m.step(m.step(n)), Fraction(9 * n + 5, 4))

    def test_negative_cycles_can_be_left_out(self):
        pos = result(maps.map_cycles("collatz_shortcut", 14, include_negative=False))
        self.assertEqual([(c["length"], c["smallest"]) for c in pos["cycles"]], [(2, 1)])
        self.assertEqual(result(maps.map_cycles("collatz_shortcut", 14, include_negative=True))["cycle_count"], 5)

    def test_a_candidate_that_is_not_a_cycle_is_dropped_even_if_the_algebra_offers_it(self):
        # the cycle equation is re-checked by iterating; feed it a word whose candidate fails that check
        from unittest import mock

        bogus = iter([((1,), 2, 0, 3, 1, True)])  # n0 = (2*1 - 3*0)/(2 - 3) = -2, and -2 is not on a cycle of one step
        with mock.patch.object(maps, "_words", lambda *a, **k: bogus):
            r = result(maps.map_cycles("collatz_shortcut", 3))
        self.assertEqual(r["cycle_count"], 0)

    def test_every_cycle_listed_really_is_one(self):
        sp = maps.parse_map("7n+1")
        for c in result(maps.map_cycles("7n+1", 12))["cycles"]:
            x = c["smallest"]
            for _ in range(c["length"]):
                x = sp.step(x)
            self.assertEqual(x, c["smallest"])

    def test_bad_maps_are_explained(self):
        for bad in ["4n+1_shortcut", "nonsense", {"modulus": 2, "pieces": [[1, 0, 2]]}, {"modulus": 2, "pieces": [[1, 1, 2], [3, 1, 2]]}]:
            with self.subTest(bad):
                with self.assertRaises(Exception) as cm:
                    maps.parse_map(bad)
                self.assertTrue(str(cm.exception))

    def test_custom_pieces(self):
        # a map on three classes: n -> n/3 on 0 mod 3, else 2n+1 (not Collatz at all)
        spec = {"modulus": 3, "pieces": [[1, 0, 3], [2, 1, 1], [2, 1, 1]]}
        self.assertEqual(maps.parse_map(spec).step(9), 3)
        self.assertTrue(maps.map_orbit(spec, 4, 50)["ok"])

    def test_scan(self):
        r = result(maps.map_scan("collatz_shortcut", 2, 20000))  # 1 itself never goes below its start, so the scan starts at 2
        self.assertTrue(r["completed"])
        self.assertEqual(r["not_resolved_within_step_cap"], [])
        self.assertEqual(result(maps.map_scan("collatz_shortcut", 1, 3))["not_resolved_within_step_cap"], [1])
        self.assertEqual(len(r["by_residue_class"]), 16)
        self.assertFalse(maps.map_scan("collatz", 5, 1)["ok"])


@unittest.skipUnless(HAVE_SYMPY, "needs sympy")
class Algebra(unittest.TestCase):
    def test_certificate_is_checked_exactly(self):
        r = result(algebra.ideal_certificate("x^2 = 1", ["x = y", "y^2 = 1"], ["x", "y"], 2))
        self.assertTrue(r["found"])
        self.assertEqual(r["multipliers"], {"h1": "x + y", "h2": "1"})

    def test_a_wrong_certificate_is_never_returned(self):
        from unittest import mock

        # if the linear solver were ever wrong, the exact re-expansion must catch it
        with mock.patch.object(algebra, "_solve_linear", lambda rows, rhs, n: [algebra.Fraction(7)] * n):
            d = algebra.ideal_certificate("x^2 = 1", ["x = y", "y^2 = 1"], ["x", "y"], 2)
        self.assertFalse(d["ok"])
        self.assertIn("does not reproduce the goal", d["error"])

    def test_a_degree_that_is_too_low_is_said_before_the_driver_guesses(self):
        # found by a real run: the agent asked for max_degree 7 for a degree-9 goal and was only told "not found"
        hyps = ["x + y + z = 0", "x*y + y*z + z*x = -7", "x*y*z = 6"]
        low = algebra.ideal_certificate("x^9 + y^9 + z^9 = 19170", hyps, ["x", "y", "z"], 7)
        self.assertFalse(result(low)["found"])
        self.assertEqual(result(low)["multipliers_usually_need_degree_at_least"], 8)
        self.assertIn("Try max_degree=8", low["note"])
        self.assertTrue(result(algebra.ideal_certificate("x^9 + y^9 + z^9 = 19170", hyps, ["x", "y", "z"], 8))["found"])

    def test_when_more_than_the_cap_is_needed_it_says_to_lower_the_goal_first(self):
        hyps = ["x + y + z = 0", "x*y + y*z + z*x = -7", "x*y*z = 6"]
        d = algebra.ideal_certificate("x^11 + y^11 + z^11 = 175098", hyps, ["x", "y", "z"], 8)
        self.assertFalse(result(d)["found"])
        self.assertEqual(result(d)["multipliers_usually_need_degree_at_least"], 10)
        self.assertIn("allows at most 8", d["note"])
        self.assertIn("t^3 = 7t + 6", d["note"])

    def test_certificate_absent_is_not_a_claim_of_falsity(self):
        d = algebra.ideal_certificate("x = 2", ["x = 1"], ["x"], 3)
        self.assertFalse(result(d)["found"])
        self.assertIn("not in the span", d["note"])

    def test_polynomial_ops(self):
        self.assertEqual(result(algebra.polynomial("factor", ["x^4 - 3*x^2 + 2"], ["x"]))["factored"], "(x - 1)*(x + 1)*(x^2 - 2)")
        self.assertEqual(result(algebra.polynomial("groebner", ["x**2+y**2-1", "x-y"], ["x", "y"]))["size"], 2)
        self.assertFalse(algebra.polynomial("nonsense", ["x"], ["x"])["ok"])

    def test_the_reader_is_a_whitelist(self):
        syms = algebra._sym(["x", "y"])
        for bad in ["__import__('os')", "x.real", "x**100", "x/y", "x if y else 1", "[x]"]:
            with self.subTest(bad):
                with self.assertRaises(Exception):
                    algebra.parse_poly(bad, syms)


class DataTools(unittest.TestCase):
    def test_scan_finds_the_composites_5_mod_6(self):
        r = result(data.scan_predicate("isprime(n) or n % 6 != 5", "n", 1, 2000))
        self.assertEqual(r["counterexamples"][:5], [35, 65, 77, 95, 119])
        self.assertTrue(r["complete"])

    def test_scan_witness_mode_and_errors(self):
        self.assertEqual(result(data.scan_predicate("isprime(n) and n % 4 == 1", "n", 1, 100, want="witnesses", show=3))["witnesses"], [5, 13, 17])
        self.assertFalse(data.scan_predicate("open('x')", "n", 1, 10)["ok"])
        self.assertFalse(data.scan_predicate("n > 0", "n", 1, 10**10)["ok"])

    def test_residue_histogram_squares_mod_13(self):
        r = result(data.residue_histogram("n*n", "n", 0, 1000, 13))
        self.assertEqual(r["residues_missed"], [2, 5, 6, 7, 8, 11])
        self.assertTrue(r["zero_is_hit"])

    def test_guess_sequence(self):
        fib = result(data.guess_sequence([0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]))["found"]
        self.assertEqual(fib["linear_recurrence"]["law"], "a(n) = (1)*a(n-1) + (1)*a(n-2)")
        cubes = result(data.guess_sequence([n**3 for n in range(12)]))["found"]
        self.assertEqual(cubes["polynomial"]["degree"], 3)
        self.assertEqual(result(data.guess_sequence([3 * 2**k for k in range(10)]))["found"]["geometric"]["ratio"], "2")
        self.assertFalse(data.guess_sequence([1, 2, 3])["ok"])

    def test_tabulate(self):
        rows = result(data.tabulate("3**n % 233", "n", 0, 12))["rows"]
        self.assertEqual([v for _, v in rows], [1, 3, 9, 27, 81, 10, 30, 90, 37, 111, 100, 67, 201])


class ThroughTheWorker(unittest.TestCase):
    """The same answers, but through a child process under limits, as the server gives them."""

    def test_round_trip(self):
        self.assertEqual(result(call("mod_order", a=2, m=233))["order"], 29)

    def test_unknown_operation_and_bad_arguments_are_answers(self):
        self.assertFalse(call("nope")["ok"])
        self.assertFalse(call("mod_order", a=2)["ok"])  # a missing argument

    def test_an_injection_attempt_is_only_text(self):
        d = call("evaluate", expression="__import__('os').system('echo pwned > /tmp/lab_pwned')")
        self.assertFalse(d["ok"])
        self.assertFalse(os.path.exists("/tmp/lab_pwned"))

    def test_time_budget_stops_a_long_scan_and_says_how_far_it_got(self):
        d = call("scan_predicate", predicate="n < 0 or n == -1", variable="n", lo=1, hi=40_000_000)
        r = result(d)
        self.assertTrue(r["complete"] or r["tested_up_to"] > 100_000)

    def test_every_op_is_registered_with_a_budget(self):
        self.assertEqual(len(OPS), 22)
        self.assertTrue(all(0 < budget <= 60 for _, budget in OPS.values()))


if __name__ == "__main__":
    unittest.main()
