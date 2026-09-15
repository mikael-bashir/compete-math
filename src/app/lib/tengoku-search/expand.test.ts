import { test } from "node:test";
import assert from "node:assert/strict";
import { expandQuery } from "./expand";

test("English words become name tokens and constants", () => {
  const e = expandQuery("square root is nonnegative");
  assert.ok(e.tokens.includes("sqrt") && e.tokens.includes("nonneg"), JSON.stringify(e));
  assert.ok(e.constants.includes("Real.sqrt"));
  assert.ok(e.phrases.includes("square root"));
});
test("stop words are dropped, unknown words kept as tokens", () => {
  const e = expandQuery("the length of the concatenation of two lists");
  assert.ok(!e.words.includes("the") && !e.words.includes("of"));
  assert.ok(e.tokens.includes("length") && e.tokens.includes("append") && e.tokens.includes("list"));
});
test("notation maps to constants", () => {
  const e = expandQuery("√x ≥ 0");
  assert.ok(e.constants.includes("Real.sqrt") && e.constants.includes("GE.ge"), JSON.stringify(e));
  const f = expandQuery("?a + ?b = ?b + ?a");
  assert.ok(f.constants.includes("HAdd.hAdd") && f.constants.includes("Eq"));
});
test("dotted Lean names are constants", () => {
  assert.ok(expandQuery("lemmas about Finset.sum over range").constants.includes("Finset.sum"));
});
test("notation becomes Mathlib name tokens", () => {
  assert.ok(expandQuery("a^2 + b^2").tokens.includes("sq") && expandQuery("a^2 + b^2").tokens.includes("add"));
  assert.ok(expandQuery("√x ≥ 0").tokens.includes("sqrt") && expandQuery("√x ≥ 0").tokens.includes("nonneg"));
  assert.ok(expandQuery("|a| ≥ 0").tokens.includes("abs"));
  assert.ok(expandQuery("n!").tokens.includes("factorial"));
  assert.ok(expandQuery("2 * a = a + a").tokens.includes("two") && expandQuery("2 * a = a + a").tokens.includes("mul"));
});
test("unary and binary minus, and repeated operands", () => {
  const neg = expandQuery("-(-?a) = ?a");
  assert.ok(neg.tokens.includes("neg") && neg.constants.includes("Neg.neg") && !neg.constants.includes("HSub.hSub"), JSON.stringify(neg));
  const sub = expandQuery("?a - ?a = 0");
  assert.ok(sub.tokens.includes("sub") && sub.tokens.includes("self") && sub.constants.includes("HSub.hSub"), JSON.stringify(sub));
});
test("a matched phrase consumes its words; inflections resolve", () => {
  const e = expandQuery("square root is nonnegative");
  assert.ok(!e.tokens.includes("sq"), JSON.stringify(e));
  assert.ok(expandQuery("limits are unique").tokens.includes("tendsto"));
  assert.ok(expandQuery("subtracting a number from itself").tokens.includes("sub") && expandQuery("subtracting a number from itself").tokens.includes("self"));
});
test("e^x and π and small numbers become tokens", () => {
  const e = expandQuery("e^x > 0");
  assert.ok(e.tokens.includes("exp") && e.tokens.includes("pos") && !e.tokens.includes("pow"), JSON.stringify(e));
  const p = expandQuery("π > 3");
  assert.ok(p.tokens.includes("pi") && p.tokens.includes("three") && p.tokens.includes("gt"), JSON.stringify(p));
});
