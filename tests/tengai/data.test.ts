// The Tengai page parses what it reads from GitHub into bounded plain values. Nothing it does not recognise reaches the page.
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseIndex, parseRequests } from '../../src/lib/tengai/data';

const drip = {
  id: '20261029T1201Z-6b133f',
  started: '2026-10-29T12:01:00+00:00',
  mode: 'live',
  summary: 'abstractor: generalised',
  counts: { findings: 3, landed: 1, requests: 2, spawn_refused: 1 },
  spent_usd: 4.25,
  tree: { modules: 4, theorems: 6 },
  lenses: ['cartographer', 'abstractor'],
  top: [
    { kind: 'bridge', label: 'conjecture', title: 'odd sum is a Gauss sum', lens: 'bridger' },
    { kind: 'note', label: 'verified', title: 'an angel may not say verified', lens: 'x' },
    { kind: 'note', label: 'note', title: '', lens: 'x' },
  ],
  landed: ['Tengai/Seed/Lifted.lean'],
};

test('a drip is read field by field, and a claim without a known label is not shown', () => {
  const idx = parseIndex({ updated: '2026-10-29T12:05:00+00:00', tree: { modules: 4, theorems: 6 }, open_requests: 2, drips: [drip] });
  assert.equal(idx.drips.length, 1);
  const d = idx.drips[0];
  assert.deepEqual([d.findings, d.landed, d.requests, d.refused, d.spentUsd, d.modules], [3, 1, 2, 1, 4.25, 4]);
  assert.deepEqual(d.top.map((f) => [f.label, f.title]), [['conjecture', 'odd sum is a Gauss sum']]);
  assert.equal(d.reportUrl, 'https://github.com/competemath/tengai/blob/main/drips/20261029T1201Z-6b133f/report.md');
  assert.equal(idx.openRequests, 2);
});

test('anything that is not the shape becomes empty, never an exception', () => {
  for (const bad of [null, undefined, 'x', 3, [], { drips: 'no' }, { drips: [null, 1, 'x', { id: '../../etc/passwd' }, { id: 'a b' }] }]) {
    assert.deepEqual(parseIndex(bad).drips, []);
  }
  assert.deepEqual(parseRequests({ requests: 'no' }), []);
  assert.deepEqual(parseRequests(null), []);
});

test('text is bounded, numbers are finite and non-negative', () => {
  const idx = parseIndex({ drips: [{ ...drip, summary: 'x'.repeat(5000), counts: { findings: -4, landed: Infinity, requests: '7' } }] });
  assert.equal(idx.drips[0].summary.length, 600);
  assert.deepEqual([idx.drips[0].findings, idx.drips[0].landed, idx.drips[0].requests], [0, 0, 0]);
});

test('requests keep only known statuses and non-empty statements', () => {
  const rs = parseRequests({
    requests: [
      { id: 'a1', statement: '∀ n : ℕ, n = n', informal: 'trivial', why: 'w', status: 'open', lens: 'experimenter', drip: 'd1' },
      { id: 'a2', statement: 'x', status: 'weird' },
      { id: 'a3', statement: '', status: 'open' },
      { id: '<script>', statement: 'x', status: 'open' },
    ],
  });
  assert.deepEqual(rs.map((r) => r.id), ['a1']);
});
