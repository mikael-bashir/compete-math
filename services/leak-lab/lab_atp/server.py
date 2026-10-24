"""Leak Lab ATP: the MCP server for the Vampire ecosystem plus SMT/SAT. Same template for every description as lab_cas.server (see its docstring)."""
from __future__ import annotations

import os
from typing import Annotated, Any

from fastmcp import FastMCP
from pydantic import Field

from . import core
from .client import call

INSTRUCTIONS = """\
LEAK LAB (ATP): automated theorem provers for first-order logic (Vampire, with AVATAR splitting, equality reasoning, finite model building) and for
SMT/SAT (Z3). Use them to find out fast whether a first-order claim follows from some axioms, to get a COUNTERMODEL when it does not, to learn which
axioms a derivation needs, and to test a propositional or linear-arithmetic claim.

WHAT NOTHING HERE CAN DO: prove anything for Tengoku. Vampire and Z3 know nothing about Lean or Mathlib, and Leak IV never reads their output. A proof from
Vampire is a PLAN: it tells you which axioms matter and roughly how they combine. You then prove those axioms as Lean lemmas and re-derive the conclusion
with ordinary Mathlib tactics (simp, rw, omega, grind, aesop, ring, decide on small numbers) and verify THAT with verify_full_script. Never use
native_decide or bv_decide to shortcut a replay. A countermodel is the most useful thing here: it becomes a Lean counterexample on Fin n or ZMod n.

HOW TO WRITE A PROBLEM (TPTP first-order syntax; give `axioms` and a `conjecture` as bare formulas and the tool adds the wrapper):
  variables start with a capital letter (X, Y), constants / functions / predicates with a lowercase one (a, f(X), p(X, Y)).
  ![X,Y]: F  means for all X,Y;   ?[X]: F  means there exists X;   ~F not;   F & G and;   F | G or;   F => G implies;   F <=> G iff;   s = t equality.
  Example: axioms ["![X]: (p(X) => q(X))", "p(a)"], conjecture "q(a)".
  For integers and arithmetic use language='tff' and write full statements, for example
  "tff(t1, type, f: $int > $int).", "tff(a1, axiom, ![X:$int]: f(X) = $sum(X, 1))." and conjecture "tff(g, conjecture, f(2) = 3)."
Encode a Lean claim with a few chosen axioms, never the whole of Mathlib: small, relevant axiom sets are what make provers fast. A finite structure
like the integers mod n is best studied with find_countermodel (domain size n).

EVERY CALL has a time limit that you set (at most 120 s for Vampire) and a memory limit; a call that runs out says so. Ask for 10 s first.
"""

mcp = FastMCP("Leak-Lab-ATP", instructions=INSTRUCTIONS)

_PROBLEM = "A complete problem in TPTP syntax (fof/tff/cnf statements ending in '.'). Use this OR `axioms` (+ `conjecture`), not both. include(...) is not allowed."
_AXIOMS = "Axioms as bare formulas in TPTP syntax, e.g. ['![X]: (p(X) => q(X))', 'p(a)']. A statement that already starts with fof( / tff( / cnf( is kept as written."
_CONJ = "The goal as one bare formula (e.g. 'q(a)'), or a full 'fof(goal, conjecture, ...).' statement."
_LANG = "'fof' (untyped first-order logic, the default) or 'tff' (typed, with $int / $rat / $real arithmetic). Used to wrap bare formulas."
_OPTIONS = "Advanced Vampire options as a dict, e.g. {'avatar': 'off', 'age_weight_ratio': '1:10'}. Only the options listed by `vampire_options` are accepted, each with a fixed set of values."


@mcp.tool
def prove(
    problem: Annotated[str | None, Field(description=_PROBLEM)] = None,
    axioms: Annotated[list[str] | None, Field(description=_AXIOMS)] = None,
    conjecture: Annotated[str | None, Field(description=_CONJ)] = None,
    language: Annotated[str, Field(description=_LANG)] = "fof",
    strategy: Annotated[str, Field(description="'default' (Vampire's own strategy for the time limit) or 'casc' (the competition schedule: many strategies one after another within the limit; use it on hard problems).")] = "default",
    time_limit_s: Annotated[int, Field(description="Wall-clock limit in seconds, 1 to 120. Start with 10.", ge=1, le=120)] = 10,
    options: Annotated[dict[str, Any] | None, Field(description=_OPTIONS)] = None,
    show_proof: Annotated[bool, Field(description="Include the (cut) proof text in the answer. The axiom list and step summary are always included.")] = True,
) -> dict[str, Any]:
    """Ask Vampire whether a conjecture follows from axioms, and get its refutation proof and which axioms it used.

    USE WHEN a step of your argument is pure first-order reasoning (group theory, order theory, quantifier juggling, equational reasoning) and you want to know
    quickly if it is true and which hypotheses it needs. NOT FOR arithmetic over the integers with big numbers (use the CAS tools), for induction, or
    for finite structures (use `find_countermodel`).

    LIMITS: time_limit_s up to 120 and 2 GiB of memory; a larger problem than 200,000 characters or one with include(...) is refused.
    RETURNS: result.verdict one of proved, proved_unsat, axioms_contradictory, countermodel, satisfiable, timeout, resource_out, gave_up, input_error, error;
    result.axioms_used (names of the axioms the proof needs), proof_steps, rules, proof (cut), stats. 'countermodel' means Vampire saturated without a refutation: the claim does not follow.
    LEAN: prove the used axioms as lemmas, then replay the logic with `simp only [..]`, `grind`, `aesop` or `tauto`; the result of this tool is never accepted by Leak IV itself.
    EXAMPLE: prove(axioms=["![X]: (p(X) => q(X))", "p(a)"], conjecture="q(a)") -> expected: verdict proved, axioms_used [ax1, ax2].
    """
    return core.prove(problem, axioms, conjecture, language, strategy, time_limit_s, options, show_proof)


@mcp.tool
def find_countermodel(
    problem: Annotated[str | None, Field(description=_PROBLEM)] = None,
    axioms: Annotated[list[str] | None, Field(description=_AXIOMS)] = None,
    conjecture: Annotated[str | None, Field(description=_CONJ)] = None,
    language: Annotated[str, Field(description=_LANG)] = "fof",
    time_limit_s: Annotated[int, Field(description="Wall-clock limit in seconds, 1 to 120.", ge=1, le=120)] = 20,
    start_size: Annotated[int, Field(description="Smallest domain size to try first (1 to 64); the builder then grows the domain until the limit.", ge=1, le=64)] = 1,
    options: Annotated[dict[str, Any] | None, Field(description=_OPTIONS)] = None,
) -> dict[str, Any]:
    """Search for a FINITE structure where the axioms hold and the conjecture fails (Vampire's finite model builder).

    USE WHEN you doubt a claim and want a concrete counterexample, or want to know whether a set of axioms is satisfiable in a small structure (a group
    of some order, a modular ring, a lattice). A found model is the best output of this server: it becomes a Lean counterexample on `Fin n` or `ZMod n`.
    NOT FOR proving (use `prove`) or for axioms that force an infinite domain (no finite model exists, and none will be found).

    LIMITS: time_limit_s up to 120; domains grow until the limit, so very large models are out of reach. No model within the limit does NOT mean none exists.
    RETURNS: result.verdict (countermodel | satisfiable | proved | proved_unsat | timeout | ...), result.domain_size, result.model (cut): the interpretation of every symbol.
    LEAN: state the structure on `Fin n`, prove each axiom by `decide`, and prove the negation of the conjecture by `decide`: that refutes the claim for good.
    EXAMPLE: find_countermodel(axioms=["![X,Y]: f(X,Y) = f(Y,X)"], conjecture="![X,Y,Z]: f(f(X,Y),Z) = f(X,f(Y,Z))") -> expected: a countermodel on 2 elements (NAND is commutative and not associative).
    """
    return core.find_countermodel(problem, axioms, conjecture, language, time_limit_s, start_size, options)


@mcp.tool
def check_consistency(
    problem: Annotated[str | None, Field(description=_PROBLEM)] = None,
    axioms: Annotated[list[str] | None, Field(description=_AXIOMS)] = None,
    language: Annotated[str, Field(description=_LANG)] = "fof",
    time_limit_s: Annotated[int, Field(description="Total wall-clock limit in seconds (2 to 120), split between a model search and a refutation search.", ge=2, le=120)] = 20,
) -> dict[str, Any]:
    """Check that a set of axioms is not contradictory: look for a finite model, and if none, look for a contradiction.

    USE WHEN you have written an encoding of a Lean statement into axioms and want to be sure it is sane BEFORE you trust a `prove` or `find_countermodel` result
    (a contradictory encoding proves everything). NOT FOR proving a conjecture (use `prove`).

    LIMITS: the time is split in half between the two searches. RETURNS: result.consistent true (a finite model was found: evidence and domain_size), false (a contradiction was derived: axioms_used names the culprits) or null (undecided; infinite models are possible).
    LEAN: consistency of a finite model is `decide` on `Fin n`; a contradiction means one of the axioms is false for the structure you meant, so fix the encoding first.
    EXAMPLE: check_consistency(axioms=["![X]: p(X)", "?[X]: ~p(X)"]) -> expected: consistent false, naming both axioms.
    """
    return core.check_consistency(problem, axioms, language, time_limit_s)


@mcp.tool
def unsat_core(
    problem: Annotated[str | None, Field(description=_PROBLEM)] = None,
    axioms: Annotated[list[str] | None, Field(description=_AXIOMS)] = None,
    conjecture: Annotated[str | None, Field(description=_CONJ)] = None,
    language: Annotated[str, Field(description=_LANG)] = "fof",
    time_limit_s: Annotated[int, Field(description="Wall-clock limit in seconds, 1 to 120.", ge=1, le=120)] = 10,
    options: Annotated[dict[str, Any] | None, Field(description=_OPTIONS)] = None,
) -> dict[str, Any]:
    """Which of your axioms a proof actually needs, and which it never touched.

    USE WHEN a conjecture holds and you want the SMALLEST set of hypotheses to formalise: prove only the core as Lean lemmas. Also useful to find a
    redundant or irrelevant hypothesis. NOT FOR deciding whether a claim is true (use `prove`).

    LIMITS: as `prove`. The core is the set of axioms in ONE proof Vampire found, not a guaranteed minimum; run again after removing an axiom to test it.
    RETURNS: result.core (axiom names), core_size, of_total_axioms, formulas (the core's formulas), unused (names never touched).
    LEAN: prove exactly the core's formulas as lemmas and close the goal from them with `simp only`/`grind`; do not import more than the core.
    EXAMPLE: unsat_core(axioms=["![X]: p(X) => q(X)", "![X]: r(X) => s(X)", "p(a)"], conjecture="q(a)") -> expected: core [ax1, ax3], unused [ax2].
    """
    return core.unsat_core(problem, axioms, conjecture, language, time_limit_s, options)


@mcp.tool
def clausify(
    problem: Annotated[str | None, Field(description=_PROBLEM)] = None,
    axioms: Annotated[list[str] | None, Field(description=_AXIOMS)] = None,
    conjecture: Annotated[str | None, Field(description=_CONJ)] = None,
    language: Annotated[str, Field(description=_LANG)] = "fof",
) -> dict[str, Any]:
    """Show the clause normal form Vampire derives from a problem (the negated conjecture and every axiom as clauses, with Skolem symbols).

    USE WHEN a prover result surprises you and you want to see what your formulas REALLY say after normalisation, or you want clauses for another tool.
    NOT FOR proving.

    LIMITS: 15 s. RETURNS: result.clause_count and result.clauses (cut at 6,000 characters).
    LEAN: reading the clauses often shows a missing quantifier or a variable that should have been a constant.
    EXAMPLE: clausify(axioms=["![X]: (p(X) => q(X))"], conjecture="q(a)") -> expected: cnf clauses with ~p(X) | q(X) and the negated goal.
    """
    return core.clausify(problem, axioms, conjecture, language)


@mcp.tool
def check_syntax(
    problem: Annotated[str | None, Field(description=_PROBLEM)] = None,
    axioms: Annotated[list[str] | None, Field(description=_AXIOMS)] = None,
    conjecture: Annotated[str | None, Field(description=_CONJ)] = None,
    language: Annotated[str, Field(description=_LANG)] = "fof",
) -> dict[str, Any]:
    """Check that a problem parses, without trying to prove it, and show Vampire's complaint if it does not.

    USE WHEN a `prove` call returned input_error and you want the message, or before you send a long problem. NOT FOR anything semantic (use `check_consistency`).

    LIMITS: 15 s. RETURNS: result.parses true with clause_count, or false with the message.
    LEAN: none; this is about the input language. Variables start with a capital letter, constants and predicates with a lowercase one, quantifiers are ![X]: and ?[X]:.
    EXAMPLE: check_syntax(axioms=["p(X"]) -> expected: parses false, with Vampire's parse error.
    """
    return core.check_syntax(problem, axioms, conjecture, language)


@mcp.tool
def explain_proof(
    proof: Annotated[str, Field(description="A TSTP proof as printed by Vampire: the text between '% SZS output start Proof' and '% SZS output end Proof' (statements fof(...)/cnf(...) ending in '.'), up to 400,000 characters.")],
    show: Annotated[int, Field(description="How many steps to list in readable form (1 to 200).", ge=1, le=200)] = 60,
) -> dict[str, Any]:
    """Read a Vampire proof: how many steps, which axioms and inference rules it uses, whether AVATAR splitting or equality reasoning appears, and a Lean replay plan.

    USE WHEN `prove` gave you a long proof and you want to know what it is made of before replaying it in Lean. NOT FOR checking a proof (nothing here checks anything).

    LIMITS: pure text analysis, no prover is run. RETURNS: result.{steps, axioms_used, rules, uses_avatar_splitting, uses_equality_reasoning, readable_steps}.
    LEAN: the `lean` field says what to prove first and which tactic family usually replays this shape of refutation.
    EXAMPLE: explain_proof(proof="fof(f1,axiom,p(a),file('x',ax1)). ...") -> expected: the step count, axioms_used [ax1], and the rules used {resolution: n, ...}.
    """
    return core.explain_proof(proof, show)


@mcp.tool
def vampire_options() -> dict[str, Any]:
    """List the advanced Vampire options you may pass in `options`, the values each accepts, and what each does.

    USE WHEN a problem is hard and you want to vary the strategy deliberately (AVATAR on/off, a different saturation algorithm, set of support, a different
    age-to-weight ratio). Change ONE option at a time and compare. NOT FOR anything else.

    LIMITS: none; this does not run a prover. RETURNS: result.options (name, takes, what_it_does), result.modes, and how to pass them.
    LEAN: none; strategy options change how fast a proof is found, never whether a result is true.
    EXAMPLE: vampire_options() -> expected: avatar takes on|off; saturation_algorithm takes lrs|otter|discount|fmb|inst_gen; ...
    """
    return core.options_table()


@mcp.tool
def smt_check(
    smtlib2: Annotated[str, Field(description="SMT-LIB 2 text: (declare-const x Int) ... (assert (> x 3)) ... Only declarations and assertions are read; (check-sat) is optional. Up to 200,000 characters.")],
    timeout_ms: Annotated[int, Field(description="Z3 time limit in milliseconds, 100 to 60,000.", ge=100, le=60000)] = 10000,
    want_model: Annotated[bool, Field(description="Return a satisfying assignment when the answer is sat.")] = True,
    unsat_core: Annotated[bool, Field(description="Return the names of the assertions that conflict when the answer is unsat. Name assertions with (assert (! F :named a1)).")] = False,
) -> dict[str, Any]:
    """Decide satisfiability of an SMT problem with Z3 (linear and nonlinear integer/real arithmetic, bit-vectors, arrays, uninterpreted functions).

    USE WHEN the claim is arithmetic or bit-level and quantifier-free: 'is there an integer solution of these constraints', 'does this bit trick overflow'.
    A sat answer gives a witness; an unsat answer says the constraints contradict. NOT FOR first-order reasoning with quantifiers over abstract structures (use `prove`)
    or for statements about all natural numbers (induction is not what Z3 does).

    LIMITS: timeout_ms up to 60 s; the child process is limited in memory. RETURNS: result.status (sat | unsat | unknown), model or unsat_core when asked, reason when unknown.
    LEAN: sat gives a witness to plug into `⟨w, by norm_num⟩`; unsat over linear integer or rational arithmetic is replayed by `omega` or `linarith`, nonlinear by `nlinarith [..]` or a certificate from the CAS server's ideal_certificate.
    EXAMPLE: smt_check("(declare-const x Int) (declare-const y Int) (assert (= (+ (* 3 x) (* 5 y)) 1)) (assert (> x 0))") -> expected: sat, e.g. x = 2, y = -1.
    """
    return call("smt_check", smtlib2=smtlib2, timeout_ms=timeout_ms, want_model=want_model, unsat_core=unsat_core)


@mcp.tool
def sat_check(
    clauses: Annotated[list[list[int]], Field(description="CNF in DIMACS style: a list of clauses, each a non-empty list of non-zero integers; 3 means variable 3, -3 means NOT variable 3. Example: [[1, 2], [-1, 2], [1, -2]]. Up to 200,000 clauses and 100,000 variables.")],
) -> dict[str, Any]:
    """Decide a propositional formula in conjunctive normal form (SAT) and return a satisfying assignment when there is one.

    USE WHEN a problem has been encoded as a finite set of yes/no choices (colourings, small covering systems, bit constraints) and you want to know if a
    configuration exists. NOT FOR first-order or arithmetic problems (use `prove` or `smt_check`).

    LIMITS: 20 s. RETURNS: result.status (sat | unsat | unknown), result.model_true_variables (the variables that are true) when sat.
    LEAN: a satisfying assignment is a witness (`decide` on the instance); an unsat answer has NO certificate here, so state the finite claim in Lean and let `decide` or a case split re-derive it.
    EXAMPLE: sat_check([[1, 2], [-1, 2], [1, -2], [-1, -2]]) -> expected: unsat (the four clauses rule out every assignment of two variables).
    """
    return call("sat_check", clauses=clauses)


def main() -> None:
    mcp.run(transport="sse", host=os.environ.get("LAB_HOST", "0.0.0.0"), port=int(os.environ.get("LAB_PORT", "8022")))


if __name__ == "__main__":
    main()
