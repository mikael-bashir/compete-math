import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, place, utcDay, windowPoints, yDomain, yieldOf, type DayPoint } from "../../src/app/lib/data/tengoku-history-core";

const pt = (day: string, total: number): DayPoint => ({ day, total, trusted: 0, tentative: 0 });

test("a window of N days ends today and starts N-1 days earlier, across a month end", () => {
  assert.equal(addDays("2026-03-02", -6), "2026-02-24");
  assert.equal(utcDay(new Date("2026-10-13T23:59:59Z")), "2026-10-13");
  const w = windowPoints([pt("2026-10-01", 1), pt("2026-10-07", 2), pt("2026-10-13", 3), pt("2026-10-14", 4)], 7, "2026-10-13");
  assert.equal(w.start, "2026-10-07");
  assert.deepEqual(w.points.map((p) => p.day), ["2026-10-07", "2026-10-13"]);
});

test("a window longer than the history starts at the first logged day; a single point keeps the full window", () => {
  const w = windowPoints([pt("2026-09-10", 1), pt("2026-10-13", 2)], 90, "2026-10-13");
  assert.equal(w.start, "2026-09-10");
  assert.equal(w.days, 34);
  const one = windowPoints([pt("2026-10-13", 2)], 30, "2026-10-13");
  assert.equal(one.start, "2026-09-14");
  assert.equal(one.days, 30);
});

test("a single point sits in the middle of the height, at the right edge, for any range", () => {
  for (const days of [7, 30, 90]) {
    const [p] = place([pt("2026-10-13", 712_388)], addDays("2026-10-13", -(days - 1)), days, 600, 100, (x) => x.total);
    assert.equal(p.x, 600);
    assert.ok(Math.abs(p.y - 50) < 1e-9);
  }
});

test("a small change is visible against a large total, and stays inside the box", () => {
  const pts = [pt("2026-10-07", 700_000), pt("2026-10-10", 700_300), pt("2026-10-13", 700_600)];
  const placed = place(pts, "2026-10-07", 7, 600, 100, (x) => x.total);
  assert.equal(placed[0].x, 0);
  assert.equal(placed[2].x, 600);
  assert.ok(placed[0].y > placed[1].y && placed[1].y > placed[2].y); // rising
  assert.ok(placed[0].y - placed[2].y > 40); // the rise fills a good part of the height
  for (const p of placed) assert.ok(p.y > 0 && p.y < 100);
});

test("the domain never collapses", () => {
  const [lo, hi] = yDomain([5, 5, 5]);
  assert.ok(hi > lo);
  assert.deepEqual(yDomain([]), [0, 1]);
});

test("a library's yield is what Tengoku holds over what its source has, never above 100%, and says when the tiers may overlap", () => {
  assert.deepEqual(yieldOf(27_568, 1_022, 73_224), { percent: ((27_568 + 1_022) / 73_224) * 100, mayOverlap: true });
  assert.deepEqual(yieldOf(0, 30_142, 40_237)?.mayOverlap, false);
  assert.equal(yieldOf(5_119, 6_042, 6_049)?.percent, 100); // the same theorems held twice cannot exceed the library
  assert.equal(yieldOf(10, 0, undefined), null);
  assert.equal(yieldOf(10, 0, 0), null);
});
