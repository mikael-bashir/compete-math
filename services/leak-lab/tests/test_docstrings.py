"""The tool descriptions are the interface the driver reads. This reads the server files (without importing fastmcp) and checks each one."""
import ast
import os
import re
import sys
import unittest

HERE = os.path.dirname(__file__)
SECTIONS_CAS = ("USE WHEN", "LIMITS:", "RETURNS:", "LEAN:", "EXAMPLE:")


def tools(path):
    with open(path, encoding="utf8") as f:
        tree = ast.parse(f.read())
    out = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and any((isinstance(d, ast.Attribute) and d.attr == "tool") or (isinstance(d, ast.Name) and d.id == "tool") for d in node.decorator_list):
            out.append(node)
    return out


def field_descriptions(fn):
    """name -> description text (or '<expr>' when it is a name, not a literal) for every parameter; None when a parameter has no Field description."""
    res = {}
    args = fn.args.args
    for a in args:
        desc = None
        ann = a.annotation
        if isinstance(ann, ast.Subscript):
            for sub in ast.walk(ann):
                if isinstance(sub, ast.Call) and getattr(sub.func, "id", "") == "Field":
                    for kw in sub.keywords:
                        if kw.arg == "description":
                            desc = kw.value.value if isinstance(kw.value, ast.Constant) else "<description given by a named constant>"
        res[a.arg] = desc
    return res


class Docstrings(unittest.TestCase):
    def check_server(self, path, sections, min_tools):
        fns = tools(path)
        self.assertGreaterEqual(len(fns), min_tools)
        names = [f.name for f in fns]
        self.assertEqual(len(names), len(set(names)), "duplicate tool names")
        for fn in fns:
            with self.subTest(tool=fn.name):
                doc = ast.get_docstring(fn) or ""
                self.assertGreater(len(doc), 200, "a tool description must say what, when, limits, returns")
                first = doc.splitlines()[0]
                self.assertTrue(first.endswith("."), "the first line is one sentence ending in a full stop")
                self.assertLess(len(first), 200)
                for sec in sections:
                    self.assertIn(sec, doc, f"{fn.name}: description lacks {sec!r}")
                for pname, desc in field_descriptions(fn).items():
                    self.assertTrue(desc and len(str(desc)) >= 12, f"{fn.name}: argument {pname!r} needs a Field(description=...) of at least a phrase")
                ret = ast.unparse(fn.returns) if fn.returns else ""
                self.assertIn("dict", ret, "tools return dicts (the lab's answer shape)")
                self.assertNotIn("TODO", doc)

    def test_cas(self):
        self.check_server(os.path.join(HERE, "..", "lab_cas", "server.py"), SECTIONS_CAS, 20)

    def test_atp(self):
        self.check_server(os.path.join(HERE, "..", "lab_atp", "server.py"), SECTIONS_CAS, 9)

    def test_atp_server_says_what_it_cannot_do(self):
        with open(os.path.join(HERE, "..", "lab_atp", "server.py"), encoding="utf8") as f:
            text = f.read()
        self.assertIn("WHAT NOTHING HERE CAN DO: prove anything for Tengoku", text)
        self.assertIn("native_decide or bv_decide", text)

    def test_examples_name_their_own_tool(self):
        for fn in tools(os.path.join(HERE, "..", "lab_cas", "server.py")) + tools(os.path.join(HERE, "..", "lab_atp", "server.py")):
            with self.subTest(tool=fn.name):
                ex = re.search(r"EXAMPLE: (.*)", ast.get_docstring(fn))
                self.assertTrue(ex and fn.name in ex.group(1), f"{fn.name}: the example should show a call of the tool")

    def test_every_cas_op_has_a_tool_and_back(self):
        sys.path.insert(0, os.path.join(HERE, ".."))
        from lab_cas.ops import OPS

        names = {f.name for f in tools(os.path.join(HERE, "..", "lab_cas", "server.py"))}
        self.assertEqual(names, set(OPS))

    def test_server_instructions_state_the_boundary(self):
        with open(os.path.join(HERE, "..", "lab_cas", "server.py"), encoding="utf8") as f:
            text = f.read()
        self.assertIn("WHAT NOTHING HERE CAN DO: prove anything", text)
        self.assertIn("native_decide", text)


if __name__ == "__main__":
    unittest.main()
