import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, gazetteerKey } from "./intent";

const cases: [string, string][] = [
  ["Nat.add_comm", "name"], ["add_comm", "name"], ["Finset.sum_range_succ", "name"], ["Continuous.comp", "name"],
  ["?a + ?b = ?b + ?a", "pattern"], ["List.length (?l ++ ?m) = _", "pattern"], ["Real.sqrt ?x ≤ ?y", "pattern"], ["0 ≤ Real.sqrt x", "pattern"],
  ["a^2 + b^2", "notation"], ["(a + b)^2", "notation"], ["√x ≥ 0", "notation"], ["|a| ≥ 0", "notation"],
  ["pigeonhole principle", "named"], ["Cauchy-Schwarz inequality", "named"], ["Fermat's little theorem", "named"], ["infinitely many primes", "named"],
  ["Tengoku.Analysis.SpecialFunctions", "module"],
  ["commutative addition of natural numbers", "nl"], ["square root is nonnegative", "nl"], ["reverse a list twice", "nl"], ["derivative of a sum", "nl"],
];
for (const [q, want] of cases) test(`${JSON.stringify(q)} → ${want}`, () => assert.equal(classifyIntent(q), want));

test("gazetteer keys", () => {
  assert.equal(gazetteerKey("the pigeon hole principle"), "pigeonhole");
  assert.equal(gazetteerKey("cauchy–schwarz"), "cauchy schwarz");
  assert.equal(gazetteerKey("sqrt 2 is irrational"), "irrational sqrt two");
  assert.equal(gazetteerKey("Nat.add_comm"), null);
});
