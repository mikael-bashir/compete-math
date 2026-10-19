import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMemoryFrame, packMemory, isMemoryStrategy, type MemoryEntry } from '../../src/lib/prover/memory-client';

const e = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id, name: id, kind: 'theorem', statement: `theorem ${id} : True`, closure: `theorem ${id} : True := trivial`, origin: 'verified',
  savedAt: '2026-10-18T00:00:00Z', attempt: 1, isTarget: false, nominated: false, subsumes: [], subsumedBy: null, hits: 0, ...extra,
});

test('save adds, update replaces and keeps the nominated flag', () => {
  let list: MemoryEntry[] = [];
  list = applyMemoryFrame(list, { type: 'memory', op: 'save', entry: e('aaaaaaaa') as never });
  list = applyMemoryFrame(list, { type: 'memory', op: 'nominate', id: 'aaaaaaaa', nominated: true });
  list = applyMemoryFrame(list, { type: 'memory', op: 'update', entry: e('aaaaaaaa', { closure: 'shorter' }) as never });
  assert.equal(list.length, 1);
  assert.equal(list[0].closure, 'shorter');
  assert.equal(list[0].nominated, true);
});

test('stats frames and malformed frames change nothing', () => {
  const list = [e('aaaaaaaa')];
  assert.equal(applyMemoryFrame(list, { type: 'memory', op: 'stats', stats: { saves: 1 } }), list);
  assert.equal(applyMemoryFrame(list, { type: 'memory', op: 'save', entry: {} as never }), list);
});

test('packMemory ranks nominated first, drops subsumed, respects the byte budget', () => {
  const big = 'x'.repeat(5000);
  const list = [
    e('00000001', { savedAt: '2026-10-01T00:00:00Z' }),
    e('00000002', { nominated: true, savedAt: '2026-09-01T00:00:00Z' }),
    e('00000003', { subsumedBy: '00000002' }),
    e('00000004', { closure: big }),
  ];
  const all = packMemory(list, 1_000_000).map((x) => x.id);
  assert.deepEqual(all.slice(0, 1), ['00000002']);
  assert.ok(!all.includes('00000003'));
  const tight = packMemory(list, 1000).map((x) => x.id);
  assert.ok(!tight.includes('00000004'));
});

test('memory strategies are recognised', () => {
  for (const k of ['control-honoured', 'control-flint', 'control-paragon', 'control-lucid']) assert.ok(isMemoryStrategy(k));
  assert.ok(!isMemoryStrategy('control-oneshot-2'));
});

test('a merged entry is not sent to a run, unless the account nominated it', () => {
  const list = [e('00000001'), e('00000002', { subsumedBy: '00000001' }), e('00000003', { subsumedBy: '00000001', nominated: true })];
  assert.deepEqual(packMemory(list).map((x) => x.id).sort(), ['00000001', '00000003']);
});
