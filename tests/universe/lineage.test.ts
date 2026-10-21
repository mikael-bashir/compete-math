// The finale: when the target is proven the universe shows what the proof is built from. These pin what it traces, when each part is
// reached, what it says, and (most important) that it can only happen when the proof was really accepted.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { FINALE, LINEAGE_MAX_DEPTH, LINEAGE_MAX_NODES, formatDuration, igniteTime, lineageSummary, traceLineage, type LineageSave } from '../../src/lib/universe/lineage';
import { LiveInterpreter, type UniverseSink, type Vec3 } from '../../src/lib/universe/events';
import { NameIndex, fnv1a } from '../../src/lib/universe/names';
import type { UniverseEvent } from '../../src/lib/universe/types';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

// saves: 0 and 1 are built from nothing; 2 from 0; 3 from 1 and 2; 4 stands alone and is never used
const saves: LineageSave[] = [
  { deps: [], stars: [100, 101] },
  { deps: [], stars: [102] },
  { deps: [0], stars: [103] },
  { deps: [1, 2], stars: [104, 100] },
  { deps: [], stars: [105] },
];

test('the ancestry of a proof is everything it rests on, once, at the shallowest point it is reached', () => {
  const l = traceLineage({ saves: [3], stars: [106, 101] }, saves);
  const key = (n: { type: string; id: number }) => `${n.type}:${n.id}`;
  assert.deepEqual(l.nodes.map(key).sort(), ['save:0', 'save:1', 'save:2', 'save:3', 'star:100', 'star:101', 'star:102', 'star:103', 'star:104', 'star:106'].sort());
  assert.ok(!l.nodes.some((n) => n.type === 'save' && n.id === 4), 'a theorem that was saved but not used is not part of it');
  assert.equal(l.nodes.length, new Set(l.nodes.map(key)).size, 'nothing twice');
  const node = (type: string, id: number) => l.nodes.find((n) => n.type === type && n.id === id)!;
  assert.equal(node('star', 101).depth, 1, 'cited by the target itself, so it hangs from the target, though a deeper save cites it too');
  assert.equal(node('star', 101).parent, -1);
  assert.equal(node('save', 3).depth, 1);
  assert.equal(node('save', 2).depth, 2);
  assert.equal(node('save', 0).depth, 3, 'a save built from a save built from a save');
  assert.equal(node('star', 100).parent, l.nodes.indexOf(node('save', 3)), 'a star cited by two saves hangs from the nearer one');
  assert.equal(node('star', 100).depth, 2);
  assert.equal(node('star', 103).parent, l.nodes.indexOf(node('save', 2)), 'and a star hangs from the save that cites it');
  assert.equal(node('star', 103).depth, 3);
  assert.equal(l.maxDepth, 3);
  assert.equal(l.truncated, false);
  for (const n of l.nodes) if (n.parent >= 0) assert.equal(l.nodes[n.parent].depth, n.depth - 1, 'every node hangs from something one step nearer the target');
});

test('a proof that cites nothing of the library traces to the stars alone', () => {
  const l = traceLineage({ saves: [], stars: [7, 8, 7] }, saves);
  assert.deepEqual(l.nodes.map((n) => [n.type, n.id, n.depth, n.parent]), [['star', 7, 1, -1], ['star', 8, 1, -1]]);
  assert.deepEqual(traceLineage({ saves: [], stars: [] }, saves).nodes, []);
});

test('bad references are ignored and cycles cannot hang the trace', () => {
  const cyc: LineageSave[] = [{ deps: [1, 99, -1], stars: [] }, { deps: [0], stars: [5] }];
  const l = traceLineage({ saves: [0, 7, -3], stars: [] }, cyc);
  assert.deepEqual(l.nodes.map((n) => `${n.type}:${n.id}`).sort(), ['save:0', 'save:1', 'star:5']);
});

test('the trace is bounded in size and depth, and says so when it stops', () => {
  const chain: LineageSave[] = Array.from({ length: 50 }, (_, i) => ({ deps: i + 1 < 50 ? [i + 1] : [], stars: [1000 + i] }));
  const deep = traceLineage({ saves: [0], stars: [] }, chain);
  assert.ok(deep.maxDepth <= LINEAGE_MAX_DEPTH);
  assert.equal(deep.truncated, true);
  const wide: LineageSave[] = [{ deps: [], stars: Array.from({ length: 5000 }, (_, i) => i) }];
  const big = traceLineage({ saves: [0], stars: [] }, wide);
  assert.equal(big.nodes.length, LINEAGE_MAX_NODES);
  assert.equal(big.truncated, true);
});

test('light reaches each depth in turn, and the whole run back is over in about six seconds', () => {
  assert.equal(igniteTime(1, 4), FINALE.ignite);
  for (let d = 1; d < 8; d++) assert.ok(igniteTime(d + 1, 8) > igniteTime(d, 8));
  for (const depth of [1, 2, 4, 8, 20]) assert.ok(igniteTime(depth, depth) - FINALE.ignite <= 6 + 1e-9, `depth ${depth}`);
  assert.ok(FINALE.stillness < FINALE.ignite && FINALE.ignite + 6 + 1 <= FINALE.settle + 1, 'the held breath comes first and the closing line comes last');
});

test('the closing line says what the proof is built from, in plain words', () => {
  const l = traceLineage({ saves: [3], stars: [106, 101] }, saves);
  const lib = (star: number) => (star < 103 ? 1 : 2);
  assert.equal(lineageSummary(l, lib, 9 * 3600 + 12 * 60), 'built from 2 libraries · 6 Mathlib lemmas · 4 of its own · 9 h 12 min');
  assert.equal(lineageSummary(traceLineage({ saves: [], stars: [7] }, saves), () => 1, 42), 'built from 1 library · 1 Mathlib lemma · 42 s');
  const cut = traceLineage({ saves: [0], stars: [] }, Array.from({ length: 50 }, (_, i) => ({ deps: i + 1 < 50 ? [i + 1] : [], stars: [1000 + i] })));
  assert.match(lineageSummary(cut, () => 1, 0), /Mathlib lemmas\+/, 'a plus when some of it is not shown');
  assert.equal(formatDuration(0), '0 s');
  assert.equal(formatDuration(59), '59 s');
  assert.equal(formatDuration(600), '10 min');
  assert.equal(formatDuration(3600), '60 min');
  assert.equal(formatDuration(5400), '1 h 30 min');
  assert.equal(formatDuration(7200), '2 h');
  assert.equal(formatDuration(33594), '9 h 20 min');
});

// ---------- it only happens when the proof was really accepted ----------

test('the finale starts only on the prover’s own word that the proof was accepted', () => {
  const engine = read('src', 'lib', 'universe', 'engine.ts');
  assert.match(engine, /if \(this\.liveFinal === true\) fa = T - this\.liveFinAt;/, 'live: only a verified run');
  assert.match(engine, /else if \(this\.evs\.length && this\.run\?\.ok\) fa = T - /, 'replay: only a run recorded as proved');
  assert.match(engine, /verified\(ok: boolean\): void \{\s*this\.liveFinal = ok;/);
  // a rejection must never be taken for a proof
  const ev = read('src', 'lib', 'universe', 'events.ts');
  assert.match(ev, /e\.kind === 'verified'\) \{\s*this\.sink\.verified\(true\);/);
  assert.match(ev, /e\.kind === 'rejected'\) \{\s*this\.sink\.verified\(false\);/);
  // and the prover only says 'verified' when the guardrail did
  const stream = read('src', 'lib', 'prover', 'run-prover-stream.ts');
  assert.match(stream, /d\.verified \? 'verified' : 'rejected'/);
});

function harness(entries: [string, number][]) {
  const sorted = entries.map(([n, i]) => [fnv1a(n), i] as const).sort((a, b) => a[0] - b[0]);
  const buf = new ArrayBuffer(4 + sorted.length * 8);
  new Uint32Array(buf, 0, 1)[0] = sorted.length;
  sorted.forEach(([h, i], k) => {
    new Uint32Array(buf, 4, sorted.length)[k] = h;
    new Uint32Array(buf, 4 + 4 * sorted.length, sorted.length)[k] = i;
  });
  const events: UniverseEvent[] = [];
  const sink: UniverseSink = { start: (e) => (events.push(e), e), finish: () => {}, starAt: () => [0, 0, 0] as Vec3, attention: () => [0, 0, 0] as Vec3, verified: () => {} };
  return { events, interp: new LiveInterpreter(NameIndex.fromBuffer(buf), sink) };
}

test('a compile attempt knows which saved theorems its script cites', () => {
  const { events, interp } = harness([['centralBinom_pos', 22], ['descFactorial_le_pow', 11]]);
  interp.memory('save', undefined, { name: 'lemma_a', closure: 'theorem lemma_a (n : ℕ) : 0 < Nat.centralBinom n := Nat.centralBinom_pos n' });
  interp.memory('save', undefined, { name: 'lemma_b', closure: 'theorem lemma_b (n : ℕ) : n = n := rfl' });
  interp.handle({ kind: 'tool_call', tool: 'mcp__Leak_IV__verify_full_script', input: JSON.stringify({ script: 'theorem final : True := by\n  have := lemma_b 2\n  have := Nat.descFactorial_le_pow 5 2\n  trivial' }) });
  const compile = events.find((e) => e.k === 'compile')!;
  assert.deepEqual(compile.saves, [1], 'it cites the second saved theorem and not the first');
  assert.deepEqual(compile.used, [11], 'and one Mathlib lemma');
});
