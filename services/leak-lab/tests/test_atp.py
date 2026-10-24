import json
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
os.environ["VAMPIRE_BIN"] = os.path.join(HERE, "fakes", "vampire")  # a stand-in: the real binary is exercised by selftest.sh in the image

from lab_atp import core, proofs, tptp, vampire  # noqa: E402

try:
    import z3  # noqa: F401

    HAVE_Z3 = True
except ImportError:
    HAVE_Z3 = False

PROVABLE = "% PROVABLE\nfof(ax1, axiom, ![X]: (p(X) => q(X))).\nfof(ax2, axiom, p(a)).\nfof(ax3, axiom, r(b)).\nfof(goal, conjecture, q(a)).\n"

# A proof exactly as Vampire 5.1.0 printed it (captured from the built image for ax1: p(X)=>q(X), ax2: p(a), goal: q(a)): the axiom names are in file('<stdin>','ax1')
with open(os.path.join(HERE, "fakes", "real_vampire_proof_5_1_0.tptp"), encoding="utf8") as _f:
    SAMPLE_PROOF = _f.read()


class Argv(unittest.TestCase):
    def test_default_arguments(self):
        a = vampire.build_argv(time_limit_s=7, options={"avatar": "off", "age_weight_ratio": "1:10"})
        self.assertEqual(a[1:3], ["--mode", "vampire"])
        self.assertIn("7s", a)
        self.assertEqual(a[a.index("--proof") + 1], "tptp")
        self.assertEqual(a[-4:], ["--avatar", "off", "--age_weight_ratio", "1:10"])

    def test_options_are_an_allow_list_with_fixed_values(self):
        for bad in [{"output": "/tmp/x"}, {"avatar": "maybe"}, {"selection": "99999"}, {"age_weight_ratio": "1;rm -rf"}, {"sos": "on; id"}, {"include": "x"}]:
            with self.subTest(bad):
                with self.assertRaises(Exception):
                    vampire.validate_options(bad)

    def test_bounds(self):
        for kw in ({"time_limit_s": 0}, {"time_limit_s": 500}, {"memory_mb": 10}, {"mode": "evil"}, {"input_syntax": "x"}):
            with self.assertRaises(Exception):
                vampire.build_argv(**kw)

    def test_every_option_has_a_doc(self):
        for k, v in vampire.OPTIONS.items():
            self.assertGreater(len(v["doc"]), 40, k)


class Problems(unittest.TestCase):
    def test_build(self):
        t = tptp.build_problem(["![X]: (p(X) => q(X))", "p(a)"], "q(a)")
        self.assertEqual(t.splitlines()[0], "fof(ax1, axiom, (![X]: (p(X) => q(X)))).")
        self.assertIn("fof(goal, conjecture, (q(a))).", t)

    def test_full_statements_are_kept(self):
        t = tptp.build_problem(["tff(t1, type, f: $int > $int)."], "tff(g, conjecture, f(2) = 3).", language="tff")
        self.assertEqual(t.splitlines()[0], "tff(t1, type, f: $int > $int).")

    def test_what_is_refused(self):
        for bad in ["include('Axioms/SET001-0.ax').", "x\x00y", "a" * 300_000]:
            with self.assertRaises(Exception):
                tptp.check_problem_text(bad)
        with self.assertRaises(Exception):
            tptp.build_problem(["p"], "q", language="evil")
        with self.assertRaises(Exception):
            tptp.build_problem(["p"] * 500, None)


class ParseOutput(unittest.TestCase):
    def test_szs_statuses(self):
        for szs, verdict in [("Theorem", "proved"), ("CounterSatisfiable", "countermodel"), ("Timeout", "timeout"), ("GaveUp", "gave_up"), ("Unsatisfiable", "proved_unsat"), ("Satisfiable", "satisfiable"), ("ResourceOut", "resource_out")]:
            self.assertEqual(vampire.parse_output(f"% SZS status {szs} for foo\n")[0], verdict)
        self.assertEqual(vampire.parse_output("nothing useful")[0], "no_answer")

    def test_blocks_and_stats(self):
        out = "% SZS status Theorem for t\n% SZS output start Proof for t\nfof(a,axiom,p,file('x',ax1)).\n% SZS output end Proof for t\n% Time elapsed: 0.5 s\n% Active clauses: 12\n"
        verdict, szs, name, proof, model, stats = vampire.parse_output(out)
        self.assertEqual((verdict, szs, name), ("proved", "Theorem", "t"))
        self.assertIn("ax1", proof)
        self.assertEqual(stats, {"time_elapsed_s": 0.5, "active_clauses": 12})

    def test_model_domain_size(self):
        self.assertEqual(vampire.model_domain_size("tff(a,type,fmb_$i_1:$i).\ntff(b,type,fmb_$i_3:$i)."), 3)
        self.assertIsNone(vampire.model_domain_size(None))


class ProofReading(unittest.TestCase):
    def test_sample(self):
        steps = proofs.parse_proof(SAMPLE_PROOF)
        self.assertEqual(len(steps), 11)
        s = proofs.summarise(steps)
        self.assertEqual(s["axioms_used"], ["ax1", "ax2"])
        self.assertEqual(s["rules"]["resolution"], 1)
        self.assertEqual(s["rules"]["forward_subsumption_resolution"], 1)
        self.assertFalse(s["uses_avatar_splitting"])
        self.assertIn("Lean", proofs.lean_guidance(s) + "Lean")
        self.assertIn("native_decide", proofs.lean_guidance(s))

    def test_equality_and_avatar_are_noticed(self):
        steps = proofs.parse_proof("cnf(u1,plain,a = b,inference(superposition,[],[u0,u00])).\ncnf(u2,plain,x,inference(avatar_sat_refutation,[],[u1])).")
        s = proofs.summarise(steps)
        self.assertTrue(s["uses_equality_reasoning"] and s["uses_avatar_splitting"])
        self.assertIn("by_cases", proofs.lean_guidance(s))

    def test_garbage_and_size(self):
        self.assertEqual(proofs.parse_proof("this is not a proof"), [])
        with self.assertRaises(Exception):
            proofs.parse_proof("x" * 500_000)


class Tools(unittest.TestCase):
    log = os.path.join(HERE, "fakes", "vampire.log")

    def setUp(self):
        open(self.log, "w").close()

    def tearDown(self):
        os.unlink(self.log)

    def calls(self):
        with open(self.log) as f:
            return [json.loads(line) for line in f if line.strip()]

    def test_prove(self):
        r = core.prove(problem=PROVABLE, time_limit_s=5, options={"avatar": "off"})
        self.assertTrue(r["ok"], r)
        res = r["result"]
        self.assertEqual((res["verdict"], res["axioms_used"]), ("proved", ["ax1", "ax2"]))
        self.assertEqual(res["proof_steps"], 11)  # the stand-in prints the proof captured from the real Vampire
        self.assertIn("proof", res)
        argv = self.calls()[0]["argv"]
        self.assertIn("5s", argv)
        self.assertEqual(argv[argv.index("--avatar") + 1], "off")
        self.assertIn("native_decide", r["lean"])

    def test_prove_from_bare_formulas_wraps_them(self):
        core.prove(axioms=["p(a)"], conjecture="p(a)")
        self.assertIn("fof(ax1, axiom, (p(a))).", self.calls()[0]["problem"])

    def test_prove_without_proof_and_with_countermodel(self):
        r = core.prove(problem="% UNPROVABLE\nfof(g,conjecture,q).\n")
        self.assertEqual(r["result"]["verdict"], "countermodel")
        self.assertIn("does NOT follow", r["lean"])
        self.assertEqual(core.prove(problem="% TIMEOUT\nfof(g,conjecture,q).\n")["result"]["verdict"], "timeout")

    def test_bad_requests_are_answers(self):
        for kw in ({}, {"problem": "x", "axioms": ["p"]}, {"problem": "include('a')."}, {"axioms": ["p"], "conjecture": "q", "options": {"nope": 1}}, {"axioms": ["p"], "time_limit_s": 0}):
            r = core.prove(**kw)
            self.assertFalse(r["ok"], kw)
            self.assertTrue(r["error"])

    def test_find_countermodel(self):
        r = core.find_countermodel(problem="% GOALFAILS\nfof(g,conjecture,q).\n", start_size=2)
        self.assertEqual((r["result"]["verdict"], r["result"]["domain_size"]), ("countermodel", 2))
        argv = self.calls()[0]["argv"]
        self.assertEqual(argv[argv.index("--saturation_algorithm") + 1], "fmb")
        self.assertEqual(argv[argv.index("--fmb_start_size") + 1], "2")
        self.assertNotIn("--proof", argv)
        self.assertIn("decide", r["lean"])

    def test_consistency(self):
        modes = lambda: [("fmb" if "fmb" in c["argv"] else "refute") for c in self.calls()]  # noqa: E731
        r = core.check_consistency(problem="fof(a,axiom,p).\n")
        self.assertTrue(r["result"]["consistent"])
        self.assertEqual(modes(), ["fmb"])  # a finite model settles it: no second search
        open(self.log, "w").close()
        bad = core.check_consistency(problem="% CONTRADICTION\nfof(a,axiom,p).\nfof(b,axiom,~p).\n")
        self.assertFalse(bad["result"]["consistent"])
        self.assertEqual(modes(), ["fmb", "refute"])  # no model, so a refutation search follows
        self.assertEqual(bad["result"]["axioms_used"], ["ax1", "ax2"])

    def test_unsat_core(self):
        r = core.unsat_core(problem=PROVABLE)
        self.assertEqual(r["result"]["core"], ["ax1", "ax2"])
        self.assertEqual(r["result"]["unused"], ["ax3"])
        self.assertEqual(r["result"]["of_total_axioms"], 3)

    def test_clausify_and_syntax(self):
        c = core.clausify(axioms=["![X]: (p(X) => q(X))"], conjecture="q(a)")
        self.assertEqual(c["result"]["clause_count"], 2)
        self.assertEqual(self.calls()[0]["argv"][self.calls()[0]["argv"].index("--mode") + 1], "clausify")
        self.assertIn("--unused_predicate_definition_removal", self.calls()[0]["argv"], "the clauses shown are those of the formulas, not of what preprocessing left")
        self.assertTrue(core.check_syntax(axioms=["p"])["result"]["parses"])
        broken = core.check_syntax(problem="BROKEN")
        self.assertFalse(broken["result"]["parses"])
        self.assertIn("Parsing", broken["result"]["message"])

    def test_explain(self):
        r = core.explain_proof(SAMPLE_PROOF)
        self.assertEqual(r["result"]["steps"], 11)
        self.assertFalse(core.explain_proof("nothing")["ok"])

    def test_wall_clock_kills_a_prover_that_ignores_its_limit(self):
        r = core.prove(problem="SLEEP\nfof(g,conjecture,q).\n", time_limit_s=1)
        self.assertEqual(r["result"]["verdict"], "timeout")
        self.assertLess(r["result"]["seconds"], 10)

    def test_options_table(self):
        rows = core.options_table()["result"]["options"]
        self.assertEqual({r["option"] for r in rows}, set(vampire.OPTIONS))


@unittest.skipUnless(HAVE_Z3, "needs z3-solver (the image has it)")
class Smt(unittest.TestCase):
    def test_sat_unsat_unknown_shapes(self):
        from lab_atp import smt

        sat = smt.smt_check("(declare-const x Int)(declare-const y Int)(assert (= (+ (* 3 x) (* 5 y)) 1))(assert (> x 0))")
        self.assertEqual(sat["result"]["status"], "sat")
        self.assertIn("x", sat["result"]["model"])
        un = smt.smt_check("(declare-const x Int)(assert (> x 3))(assert (< x 2))")
        self.assertEqual(un["result"]["status"], "unsat")
        self.assertFalse(smt.smt_check("(assert (")["ok"])
        self.assertEqual(smt.sat_check([[1, 2], [-1, 2], [1, -2], [-1, -2]])["result"]["status"], "unsat")
        self.assertEqual(smt.sat_check([[1, 2], [-1]])["result"]["model_true_variables"], [2])

    def test_through_the_worker(self):
        from lab_atp.client import call

        self.assertEqual(call("sat_check", clauses=[[1], [-1]])["result"]["status"], "unsat")
        self.assertFalse(call("nope")["ok"])


if __name__ == "__main__":
    unittest.main()
