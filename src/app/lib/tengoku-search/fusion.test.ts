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
