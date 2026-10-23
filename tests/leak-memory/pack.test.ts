import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY_BYTES_PER_RUN, isWoundedEntry, packMemory, type MemoryEntry } from '../../src/lib/prover/memory-client';

// What the page sends with a run: the library's best, within what the bridge reads (2 MB). Rated-low and merged theorems are put away; the
// rest go best rated first, general lemmas a little ahead.

const e = (n: number, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: n.toString(16).padStart(40, 'b'),
  name: `lemma_${n}`,
  kind: 'theorem',
  statement: `theorem lemma_${n} (a : ℕ) : a + ${n} = ${n} + a`,
  closure: `theorem lemma_${n} (a : ℕ) : a + ${n} = ${n} + a := by\n  omega`,
  origin: 'verified',
  savedAt: `2026-10-${String(10 + (n % 10)).padStart(2, '0')}T00:00:00Z`,
  attempt: 1,
  isTarget: false,
  nominated: false,
  subsumes: [],
  subsumedBy: null,
  hits: 0,
  ...extra,
});
const q = (s: number) => ({ s, u: 0 }) as MemoryEntry['quality'];

test('a theorem rated one or two stars is put away, a merged one too, unless it is nominated', () => {
  const entries = [e(1, { quality: q(1) }), e(2, { quality: q(2) }), e(3, { quality: q(3) }), e(4, { subsumedBy: e(9).id }), e(5), e(6, { quality: q(1), nominated: true }), e(7, { subsumedBy: e(9).id, nominated: true })];
  assert.deepEqual(packMemory(entries).map((x) => x.name).sort(), ['lemma_3', 'lemma_5', 'lemma_6', 'lemma_7']);
});

test('what is never put away: the target\'s proof, a general lemma that stands in for others', () => {
  assert.equal(isWoundedEntry(e(1, { quality: q(1), isTarget: true })), false);
  assert.equal(isWoundedEntry(e(2, { quality: q(2), origin: 'abstracted', subsumes: [e(8).id] })), false);
  assert.equal(isWoundedEntry(e(3, { quality: q(2), origin: 'abstracted' })), true, 'a general lemma that replaced nothing is just a lemma');
  assert.equal(isWoundedEntry(e(4)), false, 'unrated is not rated low');
  assert.equal(isWoundedEntry(e(5, { quality: q(3) })), false);
});

test('the order is nominated, then best rated (a general lemma counts one star more), then most used, then newest', () => {
  const entries = [
    e(1, { quality: q(3) }),
    e(2, { quality: q(5) }),
    e(3, { quality: q(4), origin: 'abstracted', subsumes: [e(8).id] }),
    e(4, { nominated: true, quality: q(3) }),
    e(5), // unrated: between two and three stars
    e(6, { quality: q(3), hits: 4 }),
    e(7, { quality: q(3), savedAt: '2026-10-29T00:00:00Z' }),
  ];
  assert.deepEqual(packMemory(entries).map((x) => x.name), ['lemma_4', 'lemma_3', 'lemma_2', 'lemma_6', 'lemma_7', 'lemma_1', 'lemma_5']);
});

test('the budget is respected and stays under what the bridge reads; the best go first when it is tight', () => {
  assert.ok(MEMORY_BYTES_PER_RUN > 1_200_000 && MEMORY_BYTES_PER_RUN <= 1_700_000, 'room for a bigger library, and room left in the 2 MB the bridge reads for the rest of the request');
  const entries = Array.from({ length: 50 }, (_, i) => e(i + 1, { quality: q(3 + (i % 3)), closure: 'x'.repeat(1000) }));
  const packed = packMemory(entries, 10_000);
  assert.ok(packed.length > 0 && packed.length < 50);
  assert.ok(packed.reduce((n, x) => n + x.closure.length + x.statement.length + 400, 0) <= 10_000);
  assert.ok(packed.every((x) => (x.quality?.s ?? 0) === 5), 'five-star first');
});
