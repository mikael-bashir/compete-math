import test from 'node:test';
import assert from 'node:assert/strict';

import { LiveInterpreter, classifyResult, classifyTool, compileOutcome, parseInput, type UniverseSink, type Vec3 } from '../../src/lib/universe/events';
import { NameIndex, fnv1a } from '../../src/lib/universe/names';
import type { UniverseEvent } from '../../src/lib/universe/types';

function indexOf(entries: [string, number][]): NameIndex {
  const sorted = entries.map(([n, i]) => [fnv1a(n), i] as const).sort((a, b) => a[0] - b[0]);
  const buf = new ArrayBuffer(4 + sorted.length * 8);
  new Uint32Array(buf, 0, 1)[0] = sorted.length;
  sorted.forEach(([h, i], k) => {
    new Uint32Array(buf, 4, sorted.length)[k] = h;
    new Uint32Array(buf, 4 + 4 * sorted.length, sorted.length)[k] = i;
  });
  return NameIndex.fromBuffer(buf);
}

function harness(entries: [string, number][], positions: Record<number, Vec3> = {}, attention: Vec3 = [0, 0, 0]) {
  const log: { started: UniverseEvent[]; finished: [UniverseEvent, Partial<UniverseEvent>][]; verified: boolean[] } = { started: [], finished: [], verified: [] };
  const sink: UniverseSink = {
    start: (ev) => (log.started.push(ev), ev),
    finish: (ev, patch) => log.finished.push([ev, patch]),
    starAt: (i) => positions[i] ?? [i, 0, 0],
    attention: () => attention,
    verified: (ok) => log.verified.push(ok),
  };
  return { log, interp: new LiveInterpreter(indexOf(entries), sink) };
}

const call = (tool: string, input: unknown) => ({ kind: 'tool_call', tool, input: JSON.stringify(input) });
const result = (detail: string, kind = 'tool_result') => ({ kind, detail });

test('tools are classified by name', () => {
  assert.equal(classifyTool('mcp__Leak_I__loogle_search'), 'loogle');
  assert.equal(classifyTool('mcp__Leak_I__moogle_search'), 'moogle');
  assert.equal(classifyTool('mcp__Leak_IV__verify_full_script'), 'compile');
  assert.equal(classifyTool('mcp__Leak_IV__lean_compile'), 'compile');
  assert.equal(classifyTool('mcp__Leak_II__apply_tactic'), null);
  assert.equal(classifyTool(undefined), null);
});

test('results are classified by what their text says', () => {
  const none = { loogle: [], moogle: [], compile: [] };
  assert.equal(classifyResult('{"result":"✅ Compilation Successful!"}', none), 'compile');
  assert.equal(classifyResult('Compilation SUCCESSFUL. Validation SUCCESSFUL.', none), 'compile');
  assert.equal(classifyResult("10 semantically related declaration(s) for 'x'", none), 'moogle');
  assert.equal(classifyResult('Found 1 results. Top matches:\nName: A.b', none), 'loogle');
  assert.equal(classifyResult('⏸️ Search allowance is at 0', { loogle: [], moogle: [1], compile: [] }), 'moogle');
  assert.equal(classifyResult('⏸️ Search allowance is at 0', { loogle: [1], moogle: [], compile: [] }), 'loogle');
});

test('inputs are read from JSON or taken as a bare script', () => {
  assert.deepEqual(parseInput('{"query":"IsPGroup, Subgroup.centralizer"}'), { query: 'IsPGroup, Subgroup.centralizer', script: undefined });
  assert.equal(parseInput('{"concept":"flat module"}').query, 'flat module');
  assert.equal(parseInput('{"script":"example : True := trivial"}').script, 'example : True := trivial');
  assert.equal(parseInput('#check @Foo').script, '#check @Foo');
});

test('compile outcomes: success, failure and the names the compiler did not know', () => {
  assert.deepEqual(compileOutcome('{"result":"✅ Compilation Successful! The proof is 100% verified."}'), { ok: true, unk: [] });
  assert.equal(compileOutcome('Compilation SUCCESSFUL. Validation SUCCESSFUL.').ok, true);
  const bad = compileOutcome('{"result":"❌ Compilation Failed:\\nLine 7 (Error): Unknown constant `IsPGroup.card_eq_pow_of_ne_bot`"}');
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.unk, ['IsPGroup.card_eq_pow_of_ne_bot']);
});

test('a search call then its result: the stars come back best first and the call is finished', () => {
  const { interp, log } = harness([['center_nontrivial', 5], ['le_centralizer', 9]]);
  interp.handle(call('mcp__Leak_I__loogle_search', { query: 'IsPGroup, Subgroup.centralizer' }));
  assert.equal(log.started[0].k, 'loogle');
  assert.equal(log.started[0].q, 'IsPGroup, Subgroup.centralizer');
  interp.handle(result('Found 2 results. Top matches:\n\nName: IsPGroup.center_nontrivial\nType: x\n---\nName: Subgroup.le_centralizer\nType: y\n---'));
  assert.deepEqual(log.finished[0][1], { hits: [5, 9] });
  assert.equal(log.finished[0][0], log.started[0]);
});

test('results pair with the oldest call of their own kind, even when calls overlap', () => {
  const { interp, log } = harness([['alpha', 1], ['beta', 2]]);
  interp.handle(call('mcp__Leak_I__loogle_search', { query: 'a' }));
  interp.handle(call('mcp__Leak_IV__verify_full_script', { script: 'example : True := trivial' }));
  interp.handle(call('mcp__Leak_I__loogle_search', { query: 'b' }));
  interp.handle(result('{"result":"✅ Compilation Successful!"}'));
  interp.handle(result('Found 1 results.\nName: X.alpha\n'));
  interp.handle(result('Found 1 results.\nName: X.beta\n'));
  const byQuery = Object.fromEntries(log.finished.map(([ev, p]) => [ev.k === 'compile' ? 'compile' : ev.q, p]));
  assert.equal((byQuery.compile as { ok: boolean }).ok, true);
  assert.deepEqual(byQuery.a, { hits: [1] });
  assert.deepEqual(byQuery.b, { hits: [2] });
});

test('a name that matches several stars resolves to the one nearest where the driver is looking; far too common names are dropped', () => {
  const entries: [string, number][] = [['card_eq', 10], ['card_eq', 11], ['card_eq', 12]];
  for (let i = 0; i < 20; i++) entries.push(['ext', 100 + i]);
  const { interp } = harness(entries, { 10: [5, 0, 0], 11: [0.1, 0, 0], 12: [9, 0, 0] }, [0, 0, 0]);
  assert.deepEqual(interp.resolve(['Foo.card_eq']), [11]);
  assert.deepEqual(interp.resolve(['ext']), []);
});

test('a blocked search is finished as blocked, with no stars', () => {
  const { interp, log } = harness([]);
  interp.handle(call('mcp__Leak_I__moogle_search', { concept: 'normal subgroup' }));
  interp.handle(result('⏸️ Search allowance is at 0 RIGHT NOW — this is temporary, not a ban.'));
  assert.deepEqual(log.finished[0][1], { blocked: true, hits: [] });
});

test('a compile call names its lemmas up front; its result says whether it passed', () => {
  const { interp, log } = harness([['zpowers_eq_closure', 4], ['le_sup_right', 8]]);
  interp.handle(call('mcp__Leak_IV__verify_full_script', { script: 'example : True := by\n  rw [Subgroup.zpowers_eq_closure]\n  exact le_sup_right' }));
  assert.deepEqual(log.started[0].used, [4, 8]);
  interp.handle(result('{"result":"❌ Compilation Failed:\\nUnknown constant `Foo.bar`"}', 'tool_error'));
  assert.equal(log.finished[0][1].ok, false);
  assert.deepEqual(log.finished[0][1].unk, ['Foo.bar']);
});

test('verified and rejected events reach the sink; unrelated tools and stray results are ignored', () => {
  const { interp, log } = harness([]);
  interp.handle(call('mcp__Leak_II__apply_tactic', { tactic: 'simp' }));
  interp.handle(result('Found 1 results.\nName: A.b'));
  interp.handle({ kind: 'verified' });
  interp.handle({ kind: 'rejected' });
  assert.equal(log.started.length, 0);
  assert.equal(log.finished.length, 0);
  assert.deepEqual(log.verified, [true, false]);
});
