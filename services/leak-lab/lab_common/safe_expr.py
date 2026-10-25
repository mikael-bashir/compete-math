"""A small, safe expression language for the lab: integers, exact fractions, comparisons, a fixed set of functions.

An expression is parsed with Python's parser, and then only a whitelist of syntax is allowed: numbers, names that are variables or functions
of the lab, + - * / // % **, comparisons, and/or/not, if-else, and calls of the lab's own functions. No attribute access, no subscripts, no
lambdas, no comprehensions, no strings, no imports: `__import__('os')` is not a function of the lab, and so it is refused before anything
runs. What passes is evaluated by walking the tree here (no eval), with ** and << (and / // %) routed through bounded versions. This is the only way a tool turns text from the driver into arithmetic.
"""
from __future__ import annotations

import ast
import math
from fractions import Fraction
from typing import Any, Callable

from . import arith
from .arith import LabError

MAX_NODES = 400
MAX_DEPTH = 40
MAX_LITERAL_DIGITS = 20_000

_BIN = {
    ast.Add: "+", ast.Sub: "-", ast.Mult: "*", ast.Div: "/", ast.FloorDiv: "//", ast.Mod: "%", ast.Pow: "**",
    ast.BitAnd: "&", ast.BitOr: "|", ast.BitXor: "^", ast.LShift: "<<", ast.RShift: ">>",
}
_UNARY = (ast.USub, ast.UAdd, ast.Not, ast.Invert)
_CMP = (ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE)


def _div(a, b):
    if b == 0:
        raise LabError("division by zero")
    return Fraction(a, b) if isinstance(a, int) and isinstance(b, int) else a / b


def _floordiv(a, b):
    if b == 0:
        raise LabError("division by zero")
    return a // b


def _mod(a, b):
    if b == 0:
        raise LabError("modulo zero")
    return a % b


def _powmod(a, b, m):
    return arith.safe_pow(a, b, m)


def _inv(a, m):
    try:
        return pow(a, -1, m)
    except ValueError:
        raise LabError(f"{a} has no inverse modulo {m}") from None


def _nonneg(n: int, what: str) -> int:
    if n < 0:
        raise LabError(f"{what} needs a non-negative argument")
    return n


FUNCTIONS: dict[str, Callable[..., Any]] = {
    "abs": abs, "min": min, "max": max, "gcd": math.gcd, "lcm": math.lcm,
    "isqrt": lambda n: math.isqrt(_nonneg(n, "isqrt")),
    "pow": _powmod, "inv": _inv,
    "v2": lambda n: arith.valuation(n, 2), "vp": arith.valuation,
    "popcount": arith.popcount, "bitlen": lambda n: abs(n).bit_length(),
    "digitsum": arith.digit_sum,
    "isprime": lambda n: arith.is_prime(n),
    "totient": arith.totient, "tau": arith.tau, "sigma": arith.sigma, "omega": arith.omega, "mobius": arith.mobius, "rad": arith.radical,
    "binomial": arith.binomial, "factorial": arith.factorial, "fib": arith.fibonacci,
    "order": arith.multiplicative_order,
    "collatz_steps": lambda n, cap=100_000: arith.collatz_steps(n, cap),
    "int": lambda x: math.floor(x),
}
CONSTANTS: dict[str, Any] = {"True": True, "False": False}
# the operators that can blow up or fail go through bounded versions; the rest are Python's own
_BOUNDED = {ast.Pow: arith.safe_pow, ast.LShift: arith.safe_shl, ast.Div: _div, ast.FloorDiv: _floordiv, ast.Mod: _mod}
_PLAIN = {
    ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b,
    ast.BitAnd: lambda a, b: a & b, ast.BitOr: lambda a, b: a | b, ast.BitXor: lambda a, b: a ^ b, ast.RShift: lambda a, b: a >> b,
}
_UNARY_OPS = {ast.USub: lambda a: -a, ast.UAdd: lambda a: +a, ast.Not: lambda a: not a, ast.Invert: lambda a: ~a}
_CMP_OPS = {
    ast.Eq: lambda a, b: a == b, ast.NotEq: lambda a, b: a != b, ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b, ast.Gt: lambda a, b: a > b, ast.GtE: lambda a, b: a >= b,
}


def _validate(tree: ast.AST, variables: set[str]) -> None:
    nodes = list(ast.walk(tree))
    if len(nodes) > MAX_NODES:
        raise LabError(f"expression too large ({len(nodes)} nodes; the limit is {MAX_NODES})")

    def depth(n: ast.AST, d: int = 0) -> int:
        if d > MAX_DEPTH:
            raise LabError("expression nested too deeply")
        return max([d] + [depth(c, d + 1) for c in ast.iter_child_nodes(n)])

    depth(tree)
    for n in nodes:
        if isinstance(n, (ast.Expression, ast.Load, ast.And, ast.Or, ast.IfExp, ast.Tuple)) or isinstance(n, tuple(_BIN)) or isinstance(n, _UNARY) or isinstance(n, _CMP):
            continue
        if isinstance(n, (ast.BinOp,)) and type(n.op) in _BIN:
            continue
        if isinstance(n, (ast.UnaryOp, ast.BoolOp, ast.Compare)):
            continue
        if isinstance(n, ast.Constant):
            if isinstance(n.value, bool) or isinstance(n.value, int):
                if isinstance(n.value, int) and len(str(abs(n.value))) > MAX_LITERAL_DIGITS:
                    raise LabError("a number literal is too long")
                continue
            raise LabError(f"only whole numbers are allowed as literals (got {type(n.value).__name__}); write 1/3 for a fraction")
        if isinstance(n, ast.Name):
            if n.id in variables or n.id in FUNCTIONS or n.id in CONSTANTS:
                continue
            raise LabError(f"unknown name '{n.id}': variables are {sorted(variables) or 'none'}; functions are {sorted(FUNCTIONS)}")
        if isinstance(n, ast.Call):
            if not (isinstance(n.func, ast.Name) and n.func.id in FUNCTIONS) or n.keywords:
                raise LabError("only the lab's own functions can be called, with positional arguments")
            continue
        raise LabError(f"syntax not allowed in a lab expression: {type(n).__name__}")


def compile_expr(text: str, variables: tuple[str, ...] = ()) -> Callable[..., Any]:
    """Compile `text` into a function of the given variables (in order). Raises LabError for anything outside the language."""
    if len(text) > 4000:
        raise LabError("expression longer than 4,000 characters")
    try:
        tree = ast.parse(text.strip(), mode="eval")
    except SyntaxError as e:
        raise LabError(f"syntax error: {e.msg} (at column {e.offset})") from None
    _validate(tree, set(variables))
    body = tree.body

    def walk(node: ast.AST, scope: dict[str, Any]) -> Any:
        """Evaluate a node that _validate accepted. There is no eval: a node of any other kind cannot get here, and is refused if it did."""
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            if node.id in scope:
                return scope[node.id]
            if node.id in CONSTANTS:
                return CONSTANTS[node.id]
            return FUNCTIONS[node.id]
        if isinstance(node, ast.BinOp):
            op = type(node.op)
            left, right = walk(node.left, scope), walk(node.right, scope)
            return (_BOUNDED.get(op) or _PLAIN[op])(left, right)
        if isinstance(node, ast.UnaryOp):
            return _UNARY_OPS[type(node.op)](walk(node.operand, scope))
        if isinstance(node, ast.BoolOp):
            result = None
            for v in node.values:  # Python's rule: `and` stops at the first falsy value, `or` at the first truthy one, and the answer is that value
                result = walk(v, scope)
                if isinstance(node.op, ast.And) != bool(result):
                    break
            return result
        if isinstance(node, ast.Compare):
            left = walk(node.left, scope)
            for op, comparator in zip(node.ops, node.comparators):
                right = walk(comparator, scope)
                if not _CMP_OPS[type(op)](left, right):
                    return False
                left = right
            return True
        if isinstance(node, ast.IfExp):
            return walk(node.body if walk(node.test, scope) else node.orelse, scope)
        if isinstance(node, ast.Tuple):
            return tuple(walk(e, scope) for e in node.elts)
        if isinstance(node, ast.Call):
            return FUNCTIONS[node.func.id](*[walk(a, scope) for a in node.args])
        raise LabError(f"syntax not allowed in a lab expression: {type(node).__name__}")

    def run(*args: Any) -> Any:
        return walk(body, dict(zip(variables, args)))

    return run


def evaluate(text: str, variables: dict[str, int] | None = None) -> Any:
    variables = variables or {}
    for k, v in variables.items():
        if not isinstance(k, str) or not k.isidentifier() or isinstance(v, bool) or not isinstance(v, int):
            raise LabError(f"variable {k!r} must be a name with a whole-number value")
    names = tuple(variables)
    return compile_expr(text, names)(*[variables[k] for k in names])
