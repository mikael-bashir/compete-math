import asyncio
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lab_common import arith, gate, safe_expr, shape  # noqa: E402
from lab_common.arith import LabError  # noqa: E402
from lab_common.limits import Limits, run_limited  # noqa: E402


class SafeExpr(unittest.TestCase):
    def test_walks_the_tree_like_python_does(self):
        """The expressions are evaluated by walking the checked tree (no eval): on plain integer expressions it must agree with Python itself,
        written out here as the same expression in Python."""
        gcd, lcm = math.gcd, math.lcm
        cases = [
            ("a and b", lambda a, b: a and b), ("a or b", lambda a, b: a or b), ("0 or 5", lambda a, b: 0 or 5), ("3 and 0", lambda a, b: 3 and 0),
            ("not a", lambda a, b: not a), ("-a + ~b", lambda a, b: -a + ~b), ("1 < a <= 3", lambda a, b: 1 < a <= 3), ("a < b < 2", lambda a, b: a < b < 2),
            ("a == a == 1", lambda a, b: a == a == 1), ("b if a else a", lambda a, b: b if a else a), ("(a, b)", lambda a, b: (a, b)),
            ("a & b | a ^ b", lambda a, b: a & b | a ^ b), ("b >> 1", lambda a, b: b >> 1), ("a - b * a + b", lambda a, b: a - b * a + b),
            ("min(a, b) + max(a, b) * abs(a - b)", lambda a, b: min(a, b) + max(a, b) * abs(a - b)),
            ("gcd(12, 18) + lcm(4, 6)", lambda a, b: gcd(12, 18) + lcm(4, 6)),
            ("a if b else 0 if a else 7", lambda a, b: a if b else 0 if a else 7), ("(a and b) or (not a and 9)", lambda a, b: (a and b) or (not a and 9)),
            ("(a * b) < (b - a) and True", lambda a, b: (a * b) < (b - a) and True),
        ]
        for text, reference in cases:
            for a in (0, 1, 2, 5):
                for b in (0, 1, 3):
                    with self.subTest(text=text, a=a, b=b):
                        self.assertEqual(safe_expr.evaluate(text, {"a": a, "b": b}), reference(a, b))

    def test_there_is_no_eval_in_the_evaluator(self):
        with open(safe_expr.__file__, encoding="utf8") as f:
            source = f.read()
        self.assertNotRegex(source, r"(?<![\w.])(eval|exec)\(", "the lab's expression language never hands text to Python's eval or exec")

    def test_values(self):
        self.assertEqual(safe_expr.evaluate("3**20 + 7 % 4"), 3486784404)
        self.assertEqual(safe_expr.evaluate("x*x + 1", {"x": 12}), 145)
        self.assertEqual(str(safe_expr.evaluate("1/3 + 1/6")), "1/2")
        self.assertEqual(safe_expr.evaluate("order(2, 233)"), 29)
        self.assertEqual(safe_expr.evaluate("vp(2**10 * 3, 2)"), 10)
        self.assertEqual(safe_expr.evaluate("1 if isprime(97) else 0"), 1)
        self.assertEqual(safe_expr.evaluate("collatz_steps(27)"), 111)

    def test_what_is_refused(self):
        for bad in ["__import__('os').system('id')", "().__class__", "open('/etc/passwd')", "[i for i in range(3)]", "a.b", "lambda: 1", "'text'", "x[0]", "print(1)", "exec('1')", "2.5", "gcd(a=1, b=2)", "gcd(*[1])", "pow(2, 3, m=5)"]:
            with self.subTest(bad):
                with self.assertRaises(LabError):
                    safe_expr.evaluate(bad, {"a": 1, "x": 2})

    def test_blowups_are_bounded(self):
        for bad in ["2**10**10", "10**1000000", "1 << 5000000", "factorial(10**9)", "fib(10**9)", "5 // 0", "5 % 0", "1/0"]:
            with self.subTest(bad):
                with self.assertRaises(LabError):
                    safe_expr.evaluate(bad)

    def test_size_limits(self):
        with self.assertRaises(LabError):
            safe_expr.evaluate("+".join(["1"] * 500))
        with self.assertRaises(LabError):
            safe_expr.evaluate("(" * 60 + "1" + ")" * 60 + "+" + "(" * 60 + "2" + ")" * 60 if False else "-" * 100 + "1")

    def test_variables_must_be_whole_numbers(self):
        with self.assertRaises(LabError):
            safe_expr.evaluate("x", {"x": 1.5})
        with self.assertRaises(LabError):
            safe_expr.evaluate("x", {"not valid": 1})


class Arith(unittest.TestCase):
    def test_known_values(self):
        self.assertTrue(arith.is_prime(2**61 - 1))
        self.assertFalse(arith.is_prime(2**61 + 1))
        self.assertEqual(arith.factor_small(1631), {7: 1, 233: 1})
        self.assertEqual(arith.totient(233), 232)
        self.assertEqual(arith.multiplicative_order(2, 233), 29)
        self.assertEqual(arith.digits(27, 2), [1, 1, 0, 1, 1])
        self.assertEqual(arith.fibonacci(90), 2880067194370816120)

    def test_refusals(self):
        with self.assertRaises(LabError):
            arith.multiplicative_order(2, 8)
        with self.assertRaises(LabError):
            arith.factor_small(10**13)


class Shape(unittest.TestCase):
    def test_shapes(self):
        self.assertEqual(shape.ok(1), {"ok": True, "result": 1})
        self.assertEqual(shape.fail("no", "try"), {"ok": False, "error": "no", "hint": "try"})

    def test_fit_cuts_lists_and_says_so(self):
        out = shape.fit(list(range(100000)), 2000)
        self.assertTrue(out["cut"])
        self.assertEqual(out["total"], 100000)
        self.assertLess(out["shown"], 2000)

    def test_clip_keeps_both_ends(self):
        t = shape.clip("A" * 100000 + "Z" * 100000, 1000)
        self.assertTrue(t.startswith("A") and t.endswith("Z"))
        self.assertIn("left out", t)
        self.assertLess(len(t), 1200)


class Limits_(unittest.TestCase):
    def test_wall_clock_kills_a_busy_loop(self):
        r = run_limited([sys.executable, "-c", "while True: pass"], limits=Limits(wall_s=1.0))
        self.assertTrue(r.timed_out)
        self.assertIsNone(r.returncode)
        self.assertLess(r.seconds, 5)

    def test_descendants_die_with_the_group(self):
        code = "import subprocess,time,sys; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); print(p.pid, flush=True); time.sleep(60)"
        r = run_limited([sys.executable, "-c", code], limits=Limits(wall_s=1.0))
        self.assertTrue(r.timed_out)
        pid = int(r.stdout.split()[0])
        for _ in range(20):
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
            import time
            time.sleep(0.1)
        else:
            self.fail("the grandchild survived the kill of its group")

    def test_stdin_and_output_are_captured_and_cut(self):
        r = run_limited([sys.executable, "-c", "import sys; print(sys.stdin.read().upper()); print('x'*5000)"], stdin="abc", limits=Limits(wall_s=5, out_bytes=100))
        self.assertTrue(r.stdout.startswith("ABC"))
        self.assertEqual(len(r.stdout), 100)
        self.assertTrue(r.truncated)

    @unittest.skipUnless(sys.platform.startswith("linux"), "RLIMIT_AS is enforced on Linux, where the container runs")
    def test_memory_limit(self):
        r = run_limited([sys.executable, "-c", "x = bytearray(900*1024*1024); print('allocated')"], limits=Limits(wall_s=10, memory_bytes=256 * 1024 * 1024))
        self.assertNotIn("allocated", r.stdout)

    @unittest.skipUnless(sys.platform.startswith("linux"), "RLIMIT_FSIZE is enforced on Linux, where the container runs")
    def test_file_size_limit(self):
        r = run_limited([sys.executable, "-c", "open('/tmp/lab_fsize_probe','wb').write(b'x'*5_000_000)"], limits=Limits(wall_s=10, file_bytes=100_000))
        self.assertNotEqual(r.returncode, 0)


class Gate(unittest.TestCase):
    def test_forwards_bytes_both_ways(self):
        async def run():
            async def echo(r, w):
                w.write((await r.read(100)).upper())
                await w.drain()
                w.close()

            target = await asyncio.start_server(echo, "127.0.0.1", 0)
            tport = target.sockets[0].getsockname()[1]
            probe = await asyncio.start_server(lambda r, w: None, "127.0.0.1", 0)
            lport = probe.sockets[0].getsockname()[1]
            probe.close()
            await probe.wait_closed()
            task = asyncio.create_task(gate.serve(lport, "127.0.0.1", tport, listen_host="127.0.0.1"))
            await asyncio.sleep(0.2)
            r, w = await asyncio.open_connection("127.0.0.1", lport)
            w.write(b"hello")
            await w.drain()
            data = await asyncio.wait_for(r.read(100), 3)
            w.close()
            task.cancel()
            target.close()
            return data

        self.assertEqual(asyncio.run(run()), b"HELLO")

    def test_the_gate_names_its_addresses_and_has_no_wildcard_default(self):
        import inspect

        self.assertEqual(inspect.signature(gate.serve).parameters["listen_host"].default, "127.0.0.1", "a gate started without an address listens on loopback only")
        self.assertNotIn("0.0.0.0", inspect.getsource(gate))

    @unittest.skipUnless(sys.platform.startswith("linux"), "reads the interfaces with Linux ioctls; the container is Linux")
    def test_interface_addresses_are_the_containers_own_and_never_loopback(self):
        found = gate.interface_addresses()
        self.assertIsInstance(found, list)
        for addr in found:
            self.assertRegex(addr, r"^\d+\.\d+\.\d+\.\d+$")
            self.assertFalse(addr.startswith("127."))


if __name__ == "__main__":
    unittest.main()
