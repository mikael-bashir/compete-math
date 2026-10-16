import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { NameIndex, extractNames, fnv1a, lastComponent, resultNames } from '../../src/lib/universe/names';

test('fnv1a matches the published 32-bit FNV-1a vectors, on the lower-cased name', () => {
  assert.equal(fnv1a('a'), 0xe40c292c);
  assert.equal(fnv1a('foobar'), 0xbf9cf968);
  assert.equal(fnv1a('FooBar'), fnv1a('foobar'));
});

test('lastComponent takes what follows the final dot', () => {
  assert.equal(lastComponent('IsPGroup.center_nontrivial'), 'center_nontrivial');
  assert.equal(lastComponent('le_sup_right'), 'le_sup_right');
});

test('NameIndex finds every star whose lemma has that last component, and nothing else', () => {
  const names: [string, number][] = [['alpha', 3], ['beta', 7], ['alpha', 11], ['gamma', 2]];
  const sorted = names.map(([n, i]) => [fnv1a(n), i] as const).sort((a, b) => a[0] - b[0]);
  const buf = new ArrayBuffer(4 + sorted.length * 8);
  new Uint32Array(buf, 0, 1)[0] = sorted.length;
  sorted.forEach(([h, i], k) => {
    new Uint32Array(buf, 4, sorted.length)[k] = h;
    new Uint32Array(buf, 4 + 4 * sorted.length, sorted.length)[k] = i;
  });
  const idx = NameIndex.fromBuffer(buf);
  assert.deepEqual(idx.find('Some.Namespace.alpha').sort((a, b) => a - b), [3, 11]);
  assert.deepEqual(idx.find('beta'), [7]);
  assert.deepEqual(idx.find('missing'), []);
});

test('the shipped names.bin agrees with this hash: real Mathlib lemmas are found', () => {
  const raw = gunzipSync(readFileSync('public/universe/names.bin.gz'));
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const idx = NameIndex.fromBuffer(buf);
  const meta = JSON.parse(readFileSync('public/universe/meta.json', 'utf8')) as { n: number };
  for (const name of ['Subgroup.zpowers_eq_closure', 'IsPGroup.center_nontrivial', 'le_sup_right']) {
    const hits = idx.find(name);
    assert.ok(hits.length > 0, `${name} not found`);
    assert.ok(hits.every((i) => i >= 0 && i < meta.n));
  }
  assert.deepEqual(idx.find('definitely_not_a_lemma_xyz'), []);
});

test('extractNames returns identifier-like tokens once, skipping tactic and keyword words', () => {
  const got = extractNames('theorem foo : Subgroup.closure s = ⊤ := by\n  exact Subgroup.zpowers_eq_closure g ▸ le_sup_right');
  assert.ok(got.includes('Subgroup.closure') && got.includes('Subgroup.zpowers_eq_closure') && got.includes('le_sup_right'));
  assert.ok(!got.includes('by') && !got.includes('exact') && !got.includes('theorem'));
  assert.equal(new Set(got).size, got.length);
});

test('resultNames reads loogle Name: lines and moogle declaration lines', () => {
  const loogle = 'Found 2 results. Top matches:\n\nName: IsPGroup.center_nontrivial\nType:  {p : ℕ}\n---\nName: Subgroup.le_centralizer\nType: x\n---';
  assert.deepEqual(resultNames(loogle), ['IsPGroup.center_nontrivial', 'Subgroup.le_centralizer']);
  const moogle = "10 semantically related declaration(s) for 'x'.\n\ntheorem Subgroup.normal_top : (⊤ : Subgroup G).Normal\n    -- The whole group.\nstructure Subgroup.Normal : Prop\n";
  assert.deepEqual(resultNames(moogle), ['Subgroup.normal_top', 'Subgroup.Normal']);
});
