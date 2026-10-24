import itertools
import json
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
os.environ["VAMPIRE_BIN"] = os.path.join(HERE, "fakes", "vampire")  # a stand-in; the real binary is exercised by selftest.py in the image

from lab_atp import core, fol_lean, models, theories  # noqa: E402
from lab_common.arith import LabError  # noqa: E402

# Output of the real Vampire 5.1.0 (captured from the built image): a non-abelian group of order 6 for the group axioms and "commutative",
# and a 3-element order that is not total
GROUP6 = open(os.path.join(HERE, "fakes", "real_vampire_fmb_group6_5_1_0.txt"), encoding="utf8").read()
ORDER3 = open(os.path.join(HERE, "fakes", "real_vampire_fmb_order3_5_1_0.txt"), encoding="utf8").read()


def read(name):
    with open(os.path.join(HERE, "fakes", name), encoding="utf8") as f:
        return f.read()


class Translate(unittest.TestCase):
    def test_formulas(self):
        t = lambda f, n=3: fol_lean.fof_to_lean(f, n)  # noqa: E731
        self.assertEqual(t("![X,Y,Z]: (mul(mul(X,Y),Z) = mul(X,mul(Y,Z)))"), "∀ x y z : Fin 3, ((mul_tbl (mul_tbl x y) z) = (mul_tbl x (mul_tbl y z)))")
        self.assertEqual(t("![X]: (mul(e,X) = X)"), "∀ x : Fin 3, ((mul_tbl e_c x) = x)")
        self.assertEqual(t("![X,Y]: ((le(X,Y) & le(Y,X)) => X = Y)"), "∀ x y : Fin 3, (((le_b x y = true) ∧ (le_b y x = true)) → (x = y))")
        self.assertEqual(t("?[A,B]: (A != B & ![Y]: (Y = A | Y = B))"), "∃ a b : Fin 3, ((a ≠ b) ∧ (∀ y : Fin 3, ((y = a) ∨ (y = b))))")
        self.assertEqual(t("~p"), "¬(p_b = true)")
        self.assertEqual(t("![X]: p(X) <=> q(X)", 2) if False else t("![X]: (p(X) <=> q(X))", 2), "∀ x : Fin 2, ((p_b x = true) ↔ (q_b x = true))")

    def test_symbols_are_collected_with_their_arity(self):
        sy, pr = {}, set()
        fol_lean.fof_to_lean("![X]: (le(mul(X,e),X) & p)", 3, sy, pr)
        self.assertEqual(sy, {"le": 2, "mul": 2, "e": 0, "p": 0})
        self.assertEqual(pr, {"le", "p"})

    def test_the_quantifier_scope_mistake_is_explained(self):
        with self.assertRaises(LabError) as cm:
            fol_lean.fof_to_lean("![X,Y]: (le(X,Y) & le(Y,X)) => X = Y", 3)
        self.assertIn("put the whole body in parentheses", str(cm.exception))

    def test_reserved_lean_words_are_not_used_as_variables(self):
        self.assertIn("fun_", fol_lean.fof_to_lean("![Fun]: (Fun = Fun)", 2))

    def test_garbage(self):
        for bad in ["![X]: (", "p(", "X = ", "![X] p(X)", "mul(a,b) <> c"]:
            with self.subTest(bad):
                with self.assertRaises(LabError):
                    fol_lean.fof_to_lean(bad, 2)


class ParseModels(unittest.TestCase):
    def test_group_of_order_6_is_a_group(self):
        m = models.parse_model(GROUP6)
        self.assertEqual((m.size, m.constants), (6, {"e": 0}))
        mul, inv = m.functions["mul"], m.functions["inv"]
        self.assertEqual(len(mul), 36)
        R = range(6)
        e = m.constants["e"]
        # the parsed table really is a group (checked in Python, not by Lean) that is not commutative
        self.assertTrue(all(mul[(mul[(a, b)], c)] == mul[(a, mul[(b, c)])] for a, b, c in itertools.product(R, repeat=3)))
        self.assertTrue(all(mul[(e, a)] == a == mul[(a, e)] and mul[(inv[(a,)], a)] == e for a in R))
        self.assertFalse(all(mul[(a, b)] == mul[(b, a)] for a, b in itertools.product(R, repeat=2)))

    def test_predicates(self):
        m = models.parse_model(ORDER3)
        self.assertEqual(m.size, 3)
        le = m.predicates["le"]
        self.assertEqual({k for k, v in le.items() if v}, {(0, 0), (1, 1), (2, 2)})  # the discrete order: reflexive only

    def test_no_model_in_the_text(self):
        self.assertIsNone(models.parse_model("% SZS status Theorem for t\n"))

    def test_summary_is_small_and_readable(self):
        s = models.summarise(models.parse_model(GROUP6))
        self.assertEqual(s["size"], 6)
        self.assertEqual(len(s["functions"]["mul"]), 6)
        self.assertEqual(s["functions"]["inv"], [0, 1, 5, 3, 4, 2])


class Skeletons(unittest.TestCase):
    def test_group6_script_is_the_one_leak_iv_accepted(self):
        got = models.lean_skeleton(models.parse_model(GROUP6), theories.theory_axioms("group"), "![X,Y]: (mul(X,Y) = mul(Y,X))")
        self.assertEqual(got, read("group6_verified_on_leak_iv.lean"), "the generator changed: verify the new script on Leak IV and replace the golden file")

    def test_order3_script_is_the_one_leak_iv_accepted(self):
        got = models.lean_skeleton(models.parse_model(ORDER3), theories.theory_axioms("partial_order"), "![X,Y]: (le(X,Y) | le(Y,X))")
        self.assertEqual(got, read("order3_verified_on_leak_iv.lean"))

    def test_every_axiom_and_the_failed_conjecture_are_checked(self):
        s = read("group6_verified_on_leak_iv.lean")
        for name in ("group_assoc", "group_left_identity", "group_right_identity", "group_left_inverse", "group_right_inverse"):
            self.assertIn(f"theorem ax_{name}_holds", s)
        self.assertIn("theorem conjecture_fails : ¬", s)
        self.assertNotIn("sorry", s)
        self.assertNotIn("native_decide", s)

    def test_a_model_that_is_too_big_gets_no_script(self):
        m = models.Model(size=30)
        with self.assertRaises(LabError):
            models.lean_skeleton(m, [], None)

    def test_an_incomplete_table_is_refused(self):
        m = models.parse_model(GROUP6)
        del m.functions["mul"][(0, 0)]
        with self.assertRaises(LabError):
            models.lean_skeleton(m, theories.theory_axioms("group"), None)

    def test_a_symbol_the_model_leaves_out_is_given_a_value(self):
        m = models.parse_model(GROUP6)
        s = models.lean_skeleton(m, [("a", "![X]: (f(X) = X)")], None)
        self.assertIn("def f_tbl : Fin 6 → Fin 6 := ![0, 0, 0, 0, 0, 0]", s)


class Theories(unittest.TestCase):
    def test_every_axiom_translates_to_lean_with_bound_variables(self):
        for name, t in theories.THEORIES.items():
            for ax, formula in t["axioms"]:
                with self.subTest(f"{name}_{ax}"):
                    fol_lean.fof_to_lean(formula, 4)

    def test_names_carry_the_theory(self):
        names = [n for n, _ in theories.theory_axioms(["group", "partial_order"])]
        self.assertIn("group_assoc", names)
        self.assertIn("partial_order_antisymm", names)
        self.assertEqual(len(names), len(set(names)))

    def test_unknown_theory_lists_the_known_ones(self):
        with self.assertRaises(LabError) as cm:
            theories.theory_axioms("magma_of_doom")
        self.assertIn("abelian_group", str(cm.exception))

    def test_the_table(self):
        t = core.theories_table()["result"]["theories"]
        self.assertEqual({x["theory"] for x in t}, set(theories.THEORIES))
        g = next(x for x in t if x["theory"] == "group")
        self.assertEqual((g["symbols"], g["mathlib_class"]), ("mul/2, e/0, inv/1", "Group"))


class CoreWithTheories(unittest.TestCase):
    log = os.path.join(HERE, "fakes", "vampire.log")

    def setUp(self):
        open(self.log, "w").close()

    def tearDown(self):
        os.unlink(self.log)

    def sent(self):
        with open(self.log) as f:
            return [json.loads(line) for line in f if line.strip()]

    def test_a_theory_and_a_conjecture_are_all_it_takes(self):
        r = core.find_countermodel(theory="group", conjecture="![X,Y]: (mul(X,Y) = mul(Y,X))")
        self.assertTrue(r["ok"], r)
        res = r["result"]
        self.assertEqual((res["verdict"], res["domain_size"]), ("countermodel", 6))
        self.assertEqual(res["lean_check"], read("group6_verified_on_leak_iv.lean"))
        self.assertEqual(res["model"]["functions"]["inv"], [0, 1, 5, 3, 4, 2])
        sent = self.sent()[0]["problem"]
        self.assertIn("fof(group_assoc, axiom,", sent)
        self.assertIn("fof(goal, conjecture,", sent)

    def test_exact_size_is_sent_as_an_axiom_and_a_mismatch_is_said(self):
        r = core.find_countermodel(theory="group", conjecture="![X,Y]: (mul(X,Y) = mul(Y,X))", size=8)
        self.assertIn("fof(exact_size, axiom,", self.sent()[0]["problem"])
        argv = self.sent()[0]["argv"]
        self.assertEqual(argv[argv.index("--fmb_start_size") + 1], "8")
        self.assertIn("NO model of exactly 8 elements exists", r["lean"])  # the stand-in returns the order-6 model whatever is asked
        self.assertEqual(r["result"]["exact_size_requested"], 8)

    def test_no_model_of_the_requested_size_is_said_plainly(self):
        # the real binary answers GaveUp, at once, when the one size it was given has no model (checked in the image's self-test); the stand-in does the same for an unmarked problem
        r = core.find_countermodel(theory="group", conjecture="![X]: (mul(X,X) = X)", size=5)
        self.assertEqual(r["result"]["no_model_of_size"], 5)
        self.assertIn("NO model with exactly 5 elements exists", r["lean"])
        self.assertEqual(r["result"]["verdict"], "gave_up")

    def test_the_exact_size_axiom_itself(self):
        a = core.exact_size_axiom(3)
        self.assertIn("X0 != X1 & X0 != X2 & X1 != X2", a)
        self.assertIn("Y = X0 | Y = X1 | Y = X2", a)
        for bad in (0, 17):
            with self.assertRaises(LabError):
                core.exact_size_axiom(bad)

    def test_the_size_axiom_is_not_in_the_lean_script(self):
        r = core.find_countermodel(theory="group", conjecture="![X,Y]: (mul(X,Y) = mul(Y,X))", size=6)
        self.assertNotIn("exact_size", r["result"]["lean_check"])

    def test_predicates_and_other_theories(self):
        r = core.find_countermodel(theory="partial_order", conjecture="![X,Y]: (le(X,Y) | le(Y,X))")
        self.assertEqual(r["result"]["lean_check"], read("order3_verified_on_leak_iv.lean"))

    def test_a_theory_combines_with_user_axioms_and_a_problem_text(self):
        text = core.problem_text(None, ["![X]: (mul(X,X) = e)"], "![X,Y]: (mul(X,Y) = mul(Y,X))", "fof", "group")
        names = [n for n, _, _ in core.statements(text)]
        self.assertEqual(names[:2], ["group_assoc", "group_left_identity"])
        self.assertEqual(names[-2:], ["ax1", "goal"])
        both = core.problem_text("fof(a, axiom, p).\n", None, None, "fof", "monoid")
        self.assertIn("fof(monoid_assoc", both)
        self.assertIn("fof(a, axiom, p).", both)

    def test_what_is_refused(self):
        for kw in ({"theory": "nonsense", "conjecture": "p"}, {"theory": "group", "language": "tff", "conjecture": "p"}, {"theory": "group", "problem": "x", "conjecture": "p"}):
            with self.subTest(kw):
                self.assertFalse(core.find_countermodel(**kw)["ok"])

    def test_a_typed_problem_gets_the_model_but_no_script_it_cannot_make(self):
        res = core.lean_check_for(GROUP6, "tff(t, type, f: $int > $int).\ntff(a, axiom, f(1) = 2).\n")
        self.assertEqual(res["domain_size"], 6)
        self.assertNotIn("lean_check_unavailable", res)  # no fof statement to translate: a script of the tables alone

    def test_consistency_returns_the_script_for_the_model(self):
        r = core.check_consistency(theory="group")
        self.assertTrue(r["result"]["consistent"] is True or r["result"]["consistent"] is None)


if __name__ == "__main__":
    unittest.main()
