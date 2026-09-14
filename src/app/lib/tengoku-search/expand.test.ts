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
