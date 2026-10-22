// The star ratings shown in the saved-theorems modal: the data file the app ships, the lookup, and the wording of the hover card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUALITY_FILES, type QualityEntry } from '../../src/data/leak-quality';
import { RUNGS, backfillQuality, evidenceLines, qualityOf, ratedSummary, rankedAt, ratingOf, rungOf, starText } from '../../src/lib/prover/entry-quality';
import { cleanEntry, cleanQuality } from '../../src/app/lib/leak-memory/memory-core';

const file = QUALITY_FILES['erdos-396'];
const ALLOWED = new Set(['s', 'u', 'd', 'g', 'w', 'k', 'c', 'l', 'n', 'm', 'v', 'x', 't', 'r', 'rv']);
const KINDS = ['numeric-instance', 'special-case', 'reformulation', 'general-lemma', 'structural', 'reduction', 'other'];

test('the shipped data file is for its target, counts its entries, and has the shape the app reads', () => {
  assert.equal(file.targetId, 'erdos-396');
  assert.match(file.rankedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(file.count, Object.keys(file.entries).length);
  assert.ok(file.count >= 500, 'the current theorems are in it (the backfill)');
  for (const [id, q] of Object.entries(file.entries)) {
    assert.match(id, /^[0-9a-f]{40}$/, 'keyed by the entry id (the sha1 of its statement)');
    assert.ok(Number.isInteger(q.s) && q.s >= 1 && q.s <= 5, id);
    assert.ok(Number.isInteger(q.u) && q.u >= 0, id);
    for (const k of Object.keys(q)) assert.ok(ALLOWED.has(k), `unexpected field ${k}`);
    for (const [k, lo, hi] of [['d', 1, 5], ['g', 1, 5], ['w', 0, 3]] as const) {
      const v = q[k];
      if (v !== undefined) assert.ok(v >= lo && v <= hi, `${id} ${k}`);
    }
    if (q.k !== undefined) assert.ok(KINDS.includes(q.k), q.k);
  }
});

test('the data file holds numbers and flags only: no theorem text, no names, no prose, so it can sit in a public repository', () => {
  const raw = readFileSync(join(process.cwd(), 'src/data/leak-quality/erdos-396.json'), 'utf8');
  for (const word of ['theorem', 'lemma ', 'descFactorial', 'centralBinom', '∀', '∃', ':=']) assert.ok(!raw.includes(word), `contains ${word}`);
  const strings = [...raw.matchAll(/"([^"]{41,})"/g)].map((m) => m[1]);
  assert.deepEqual(strings, [file.method].filter((m) => m.length > 40), 'the only long string is the method line');
});

test('every shipped rating respects the rule: a cheap tactic, a duplicate or unsatisfiable hypotheses cap at one star; one lemma, a numeric fact or Mathlib at two', () => {
  for (const [id, q] of Object.entries(file.entries) as [string, QualityEntry][]) {
    if (q.c || q.x || q.v) assert.equal(q.s, 1, id);
    if (q.l || q.n || q.m) assert.ok(q.s <= 2, id);
  }
  const stars = Object.values(file.entries).map((q) => q.s);
  assert.ok(stars.filter((s) => s === 5).length === 0 && stars.filter((s) => s >= 4).length < file.count / 10, 'four and five stars stay rare');
});

test('qualityOf finds a rating by target and entry id, and says nothing for an unrated entry, another target, or a damaged rating', () => {
  const [id, q] = Object.entries(file.entries)[0];
  assert.deepEqual(qualityOf('erdos-396', id), q);
  assert.equal(qualityOf('erdos-396', 'f'.repeat(40)), null);
  assert.equal(qualityOf('another-target', id), null);
  assert.equal(qualityOf('t', 'a', { t: { ...file, entries: { a: { s: 9, u: 0 } } } }), null);
  assert.equal(qualityOf('t', 'a', { t: { ...file, entries: { a: { s: 2.5, u: 0 } } } }), null);
  assert.equal(rankedAt('erdos-396'), file.rankedAt);
  assert.equal(rankedAt('another-target'), null);
});

test('ratedSummary counts how many of the saved entries have a rating', () => {
  const ids = Object.keys(file.entries).slice(0, 3);
  assert.deepEqual(ratedSummary('erdos-396', [...ids, 'f'.repeat(40)]), { rated: 3, total: 4 });
});

test('there is one rung for each of the five stars, in order, with wording for each', () => {
  assert.deepEqual(RUNGS.map((r) => r.stars), [1, 2, 3, 4, 5]);
  for (const r of RUNGS) {
    assert.ok(r.name && r.lead && r.earnedBy && r.example);
    assert.equal(rungOf(r.stars), r);
  }
  assert.equal(rungOf(0), null);
  assert.equal(starText(3), '★★★☆☆');
  assert.match(RUNGS[0].earnedBy, /one-line automatic tactic/);
  assert.match(RUNGS[4].earnedBy, /4\.5/);
});

test('evidenceLines says what capped the rating first, then what the reading and the reuse said', () => {
  const capped = evidenceLines({ s: 1, u: 0, d: 1, g: 1, w: 0, c: 1, n: 1 });
  assert.match(capped[0], /one-line automatic tactic.*one star/);
  assert.ok(capped.some((l) => /numeric fact.*two stars/.test(l)));
  assert.ok(capped.some((l) => /Reader: depth 1\.0 of 5, generality 1\.0 of 5, worth to the target 0\.0 of 3/.test(l)));
  assert.equal(capped[capped.length - 1], 'No other saved entry rests on it.');
  const strong = evidenceLines({ s: 4, u: 7, d: 3, g: 4, w: 2.5, t: 1 });
  assert.ok(strong.includes('It states the target from smaller hypotheses.'));
  assert.equal(strong[strong.length - 1], '7 other saved entries rest on it.');
  assert.equal(evidenceLines({ s: 3, u: 1 }).pop(), '1 other saved entry rests on it.');
  assert.ok(!evidenceLines({ s: 3, u: 1 }).some((l) => l.startsWith('Reader')), 'no reading, no reader line');
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StarRating } from '../../src/components/prover/star-rating';
import { LeakMemoryModal } from '../../src/components/prover/leak-memory-modal';
import type { MemoryEntry } from '../../src/lib/prover/memory-client';

test('a rating renders as filled and empty stars with a label a screen reader can use, and is reachable from the keyboard', () => {
  const html = renderToStaticMarkup(createElement(StarRating, { stars: 3, quality: { s: 3, u: 1 } }));
  assert.match(html, /aria-label="3 of 5 stars: Solid lemma"/);
  assert.ok(html.includes('★★★') && html.includes('tabindex="0"'));
  assert.ok(!html.includes('role="tooltip"'), 'the card opens on hover, not on first render');
});

test('the saved-theorems modal builds with rated and unrated entries and the sort toggle', () => {
  const [id] = Object.keys(file.entries);
  const entry = (over: Partial<MemoryEntry>): MemoryEntry => ({ id, name: 'a_lemma', kind: 'theorem', statement: 'theorem a_lemma : True', closure: 'theorem a_lemma : True := trivial', origin: 'verified', savedAt: '2026-10-20T10:00:00Z', attempt: 1, isTarget: false, nominated: false, subsumes: [], subsumedBy: null, hits: 0, ...over });
  const props = { targetId: 'erdos-396', targetTitle: 'Erdős 396', entries: [entry({}), entry({ id: 'f'.repeat(40), name: 'b_new' })], signedIn: true, loading: false, stats: null, maxNominated: 10, minNominated: 3, onNominate: () => {}, onDelete: () => {} };
  const html = renderToStaticMarkup(createElement(LeakMemoryModal, props));
  assert.ok(html.includes('Saved theorems (2)'));
  assert.ok(!html.includes('b_new'), 'the dialog body is closed until it is opened, so only the trigger renders');
});

test('cleanQuality keeps a well-formed rating, drops anything outside the ranges, and takes nothing that is not a number or a known flag', () => {
  assert.deepEqual(cleanQuality({ s: 3, u: 2, d: 3.04, g: 2.96, w: 2, k: 'general-lemma', c: 1, r: '2026-10-22', rv: 1 }), { s: 3, u: 2, d: 3, g: 3, w: 2, k: 'general-lemma', c: 1, r: '2026-10-22', rv: 1 });
  assert.equal(cleanQuality({ s: 0, u: 0 }), null);
  assert.equal(cleanQuality({ s: 6, u: 0 }), null);
  assert.equal(cleanQuality({ s: 2.5, u: 0 }), null);
  assert.equal(cleanQuality('3 stars'), null);
  assert.equal(cleanQuality(null), null);
  const messy = cleanQuality({ s: 2, u: -4, d: 99, g: 'x', w: 7, k: 'a long invented kind', c: 2, l: true, says: 'prose that must not be stored', r: 'yesterday', rv: 'one' });
  assert.deepEqual(messy, { s: 2, u: 0 });
});

test('the store keeps a rating that comes with an entry and drops a malformed one, and never takes a nomination from the caller', () => {
  const base = { id: 'ab'.repeat(20), name: 'a_lemma', statement: 'theorem a_lemma : 1 = 1', closure: 'theorem a_lemma : 1 = 1 := rfl', origin: 'abstracted', nominated: true };
  assert.deepEqual(cleanEntry({ ...base, quality: { s: 4, u: 1, rv: 1 } })?.quality, { s: 4, u: 1, rv: 1 });
  assert.equal(cleanEntry({ ...base, quality: { s: 9 } })?.quality, null);
  assert.equal(cleanEntry({ ...base })?.quality, null);
  assert.equal(cleanEntry({ ...base, quality: { s: 3, u: 0 } })?.nominated, false);
});

type E = { id: string; quality?: QualityEntry | null };
test('backfillQuality gives an older entry the shipped rating, keeps an entry its own, and leaves an unrated one or another target alone', () => {
  const [id, q] = Object.entries(file.entries)[0];
  const [out] = backfillQuality<E>('erdos-396', [{ id }]);
  assert.deepEqual(out.quality, { ...q, r: file.rankedAt, rv: 1 });
  const own = { s: 1, u: 0 };
  assert.deepEqual(backfillQuality<E>('erdos-396', [{ id, quality: own }])[0].quality, own);
  assert.equal(backfillQuality<E>('erdos-396', [{ id: 'f'.repeat(40) }])[0].quality, undefined);
  assert.equal(backfillQuality<E>('another-target', [{ id }])[0].quality, undefined);
});

test('the rating the modal shows is the entry\'s own, else the shipped one', () => {
  const [id, q] = Object.entries(file.entries)[0];
  assert.deepEqual(ratingOf('erdos-396', { id }), q);
  assert.deepEqual(ratingOf('erdos-396', { id, quality: { s: 5, u: 9 } }), { s: 5, u: 9 });
  assert.equal(ratingOf('erdos-396', { id: 'f'.repeat(40) }), null);
  assert.equal(ratingOf('another-target', { id: 'f'.repeat(40), quality: null }), null);
});
