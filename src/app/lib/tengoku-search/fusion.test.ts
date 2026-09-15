import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseVariants, rank, rrf, type Hit } from "./fusion";

const h = (id: string, extra: Partial<Hit> = {}): Hit => ({ id, name: id, kind: "theorem", tier: "trusted", statement: "", module: "", docstring: null, type_hash: null, pagerank: 0, deprecated_for: null, ...extra });

test("a result on two channels beats one on a single channel at the same rank", () => {
  const r = rrf([{ channel: "name", hits: [h("a"), h("b")] }, { channel: "fts", hits: [h("b"), h("c")] }], "nl");
  assert.equal(r[0].id, "b");
  assert.deepEqual(r[0].channels.sort(), ["fts", "name"]);
});
test("intent weights change the winner", () => {
  const chans = [{ channel: "name", hits: [h("byname")] }, { channel: "semantic", hits: [h("bymeaning")] }];
  assert.equal(rrf(chans, "name")[0].id, "byname");
  assert.equal(rrf(chans, "nl")[0].id, "bymeaning");
});
test("variants collapse by type hash and count", () => {
  const r = rank([{ channel: "name", hits: [h("Nat.add_comm", { type_hash: "t1" }), h("Int.add_comm", { type_hash: "t1" }), h("Nat.mul_comm", { type_hash: "t2" })] }], "name");
  assert.equal(r.length, 2);
  assert.equal(r[0].variants, 2);
  assert.equal(collapseVariants([]).length, 0);
});
test("deprecated and tentative results are demoted, trusted promoted", () => {
  const r = rank([{ channel: "name", hits: [h("old", { deprecated_for: "new" }), h("new"), h("tent", { tier: "tentative" })] }], "name");
  assert.equal(r[0].id, "new");
  assert.equal(r[r.length - 1].id, "old");
});
test("an exact name beats a near miss the other channels prefer; general beats namespaced", () => {
  const r = rank([{ channel: "name", hits: [h("Nat.factorial", { exact: true }), h("Nat.factorial_le")] }, { channel: "fts", hits: [h("Nat.factorial_le"), h("Nat.factorial_succ"), h("Nat.factorial")] }], "name");
  assert.equal(r[0].id, "Nat.factorial");
  const g = rank([{ channel: "name", hits: [h("Int.mul_add", { exact: true }), h("mul_add", { exact: true })] }], "pattern");
  assert.equal(g[0].id, "mul_add");
});
test("numeric-type copies fold into the general lemma and lift it", () => {
  const r = rank([{ channel: "fts", hits: [h("Int8.mul_two"), h("Int8.two_mul"), h("Int64.two_mul"), h("two_mul"), h("Continuous.comp"), h("Measurable.comp")] }], "nl");
  assert.equal(r[0].id, "two_mul");
  assert.equal(r.find((x) => x.id === "two_mul")!.variants, 3);
  assert.ok(!r.some((x) => x.id === "Int8.two_mul"));
  assert.ok(r.some((x) => x.id === "Continuous.comp") && r.some((x) => x.id === "Measurable.comp"), "dot-notation lemmas are not a family");
});
test("an exact name is never folded into its general form", () => {
  const r = rank([{ channel: "name", hits: [h("Nat.add_comm", { exact: true }), h("add_comm")] }], "name");
  assert.equal(r[0].id, "Nat.add_comm");
  assert.ok(r.some((x) => x.id === "add_comm"));
});
