import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeQuery, nameTokens } from "./normalize";

test("LaTeX becomes unicode", () => {
  assert.equal(normalizeQuery("\\forall n, n + 0 = n"), "∀ n, n + 0 = n");
  assert.equal(normalizeQuery("$a \\le b$"), "a ≤ b");
  assert.equal(normalizeQuery("\\sqrt{2} \\in \\mathbb{R}"), "√{2} ∈ ℝ");
  assert.equal(normalizeQuery("\\sum_{i} f i"), "∑_{i} f i");
});
test("ASCII operators become unicode outside identifiers", () => {
  assert.equal(normalizeQuery("a <= b -> b >= a"), "a ≤ b → b ≥ a");
  assert.equal(normalizeQuery("x != y"), "x ≠ y");
  assert.equal(normalizeQuery("Nat.add_comm"), "Nat.add_comm");
  assert.equal(normalizeQuery("  \"pigeonhole\"  "), "pigeonhole");
});
test("name tokens split dots, underscores, camel case and command punctuation", () => {
  assert.deepEqual(nameTokens("Nat.add_comm"), ["nat", "add", "comm"]);
  assert.deepEqual(nameTokens("MeasureTheory.integral_add"), ["measure", "theory", "integral", "add"]);
  assert.deepEqual(nameTokens("Real.sqrt_nonneg'"), ["real", "sqrt", "nonneg"]);
  assert.deepEqual(nameTokens("«command#minimize_imports»"), ["command", "minimize", "imports"]);
});
