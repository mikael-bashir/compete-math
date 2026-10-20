// The laws of light in the universe, pinned: a galaxy keeps its brightness at any distance and its total light falls as the square of the
// distance; old work fades but never vanishes, and a long history cannot flood the sky; a library is sized like a galaxy. If any of these
// is removed or bent, the universe goes back to what it was: brighter the further you scroll away, a plateau after months, a bloated library.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { FADE_TAU, STAR_FLUX_EXPONENT, emptySky, fadeOf, libRadius, linkBrightness, pairKey, seedGain, starFlux, strongestLinks } from '../../src/lib/universe/lighting';
import { LiveInterpreter, isGeneralLemma, type UniverseSink, type Vec3 } from '../../src/lib/universe/events';
import { NameIndex, fnv1a } from '../../src/lib/universe/names';
import { UNIVERSE_LEGEND } from '../../src/lib/universe/legend';
import type { UniverseEvent, UniverseMeta } from '../../src/lib/universe/types';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

// ---------- a star keeps its light ----------

// A galaxy of stars seen from k times as far: its stars are k² as dense on the screen, each star's true size is k times smaller, and no star
// can be drawn smaller than one pixel. The light on the screen per pixel is then (stars per pixel) × (the light one star gives).
const surface = (k: number, raw1: number, flux: (raw: number, lo: number) => number) => k * k * flux(raw1 / k, 1);

test('a galaxy has the same surface brightness at any distance (to within a third over a tenfold change)', () => {
  for (const raw1 of [0.6, 0.9, 1.0]) {
    const s1 = surface(1, raw1, starFlux);
    for (let k = 1; k <= 10; k += 0.5) {
      const r = surface(k, raw1, starFlux) / s1;
      assert.ok(r > 0.65 && r < 1.35, `raw ${raw1}, ${k}× as far: surface brightness changed by ${r.toFixed(2)}×`);
    }
  }
});

test('the old drawing, where every star kept full light however small, gets a hundred times brighter over a tenfold distance', () => {
  // this is the bug: it must be the thing the law above rules out
  const full = () => 1;
  assert.ok(surface(10, 0.9, full) / surface(1, 0.9, full) >= 99);
});

test('the total light of a galaxy falls as the square of its distance', () => {
  // total = surface brightness × the area it covers on screen, which shrinks as 1/k²
  for (let k = 2; k <= 10; k += 2) {
    const total = (surface(k, 0.9, starFlux) / (k * k)) / (surface(1, 0.9, starFlux) / 1);
    const ideal = 1 / (k * k);
    assert.ok(total / ideal > 0.65 && total / ideal < 1.35, `${k}× as far: ${total.toFixed(4)} of the light, ideal ${ideal.toFixed(4)}`);
  }
});

test('a star at least as big as the smallest sprite gives all its light; a smaller one gives less, and none gives more', () => {
  assert.equal(starFlux(1, 1), 1);
  assert.equal(starFlux(3.2, 1), 1);
  assert.equal(starFlux(0, 1), 0);
  let prev = 0;
  for (let raw = 0; raw <= 1; raw += 0.05) {
    const f = starFlux(raw, 1);
    assert.ok(f >= prev && f <= 1);
    prev = f;
  }
  assert.ok(STAR_FLUX_EXPONENT >= 2 && STAR_FLUX_EXPONENT < 2.5, 'the exponent is the area law (2) plus a small sampling correction');
});

test('the star shader uses the law, and the engine uses the module that holds it', () => {
  const engine = read('src', 'lib', 'universe', 'engine.ts');
  assert.match(engine, /float lo = big > 0\.5 \? [\d.]+ : 1\.0;/, 'a smallest sprite');
  assert.match(engine, /float flux = raw < lo \? pow\(raw\/lo, \$\{STAR_FLUX_EXPONENT\.toFixed\(2\)\}\) : 1\.0;/, 'light conserved below the smallest sprite');
  assert.match(engine, /v_col = vec4\(col\*tw, flux\*u_gain/, 'and applied to the star');
  assert.match(engine, /from '\.\/lighting'/);
  assert.match(engine, /const w = fadeOf\(age\);/, 'work fades with age');
});

// ---------- light fades with age ----------

test('light fades with age: full now, half at τ, never zero', () => {
  assert.equal(fadeOf(0), 1);
  assert.equal(fadeOf(-5), 1);
  assert.ok(Math.abs(fadeOf(FADE_TAU) - 0.5) < 1e-12);
  let prev = 1;
  for (const age of [1, 60, 3600, 86400, 86400 * 90, 1e9]) {
    const f = fadeOf(age);
    assert.ok(f < prev && f > 0, `age ${age}`);
    prev = f;
  }
});

test('a long history cannot flood the sky: its light grows like a logarithm, not like its length', () => {
  const span = 33594; // one nine-hour run
  const sum = (runs: number) => {
    let s = 0;
    for (let c = 1; c <= runs; c++) s += fadeOf(c * span);
    return s;
  };
  assert.ok(sum(200) < 0.7, 'two hundred past runs add less than one run of fresh work');
  assert.ok(sum(1000) / sum(100) < 1.8, 'ten times the history adds well under twice the light (a log; a plateau would be 10×)');
  assert.ok(sum(100000) < 2, 'and 100,000 runs still add less than two runs of fresh work');
});

test('a web link brightens with how much it was used lately, and a link last used long ago is nearly dark', () => {
  assert.equal(linkBrightness(0), 0);
  assert.ok(linkBrightness(1) > 0.4 && linkBrightness(1) < 0.7);
  assert.ok(linkBrightness(20) > 0.99);
  assert.ok(linkBrightness(fadeOf(86400 * 90)) < 0.01);
});

test('the web keeps only the strongest links, strongest first, and drops the faded ones', () => {
  const w = new Map<number, number>();
  for (let i = 0; i < 1000; i++) w.set(pairKey(i, i + 1), 1 + (i % 50));
  w.set(pairKey(5, 9), 0.001);
  const top = strongestLinks(w, 300);
  assert.equal(top.length, 300);
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].w >= top[i].w);
  assert.ok(!strongestLinks(w, 5000).some((l) => l.w <= 0.02), 'links whose light has faded away are dropped');
  const k = pairKey(123456, 7);
  assert.equal(k, pairKey(7, 123456), 'a pair has one key either way round');
  assert.deepEqual(strongestLinks(new Map([[k, 3]]))[0], { a: 7, b: 123456, w: 3 });
});

// ---------- a library is sized like a galaxy ----------

test('a library follows the galaxies’ own size law and never outgrows the largest galaxy', () => {
  const meta = JSON.parse(read('public', 'universe', 'meta.json')) as UniverseMeta;
  const biggest = Math.max(...meta.libs.map((l) => l.r));
  const small = meta.libs.find((l) => l.t + l.u >= 150 && l.t + l.u <= 220);
  assert.ok(small, 'a galaxy of about 184 theorems to compare with');
  assert.ok(Math.abs(libRadius(small.t + small.u) - small.r) / small.r < 0.35, 'same radius as a galaxy of the same size');
  assert.ok(libRadius(124) < 0.025, 'a run’s own library of 124 theorems is small');
  assert.ok(libRadius(1e9) <= 0.1 && libRadius(1e9) <= biggest);
  assert.ok(libRadius(0) >= 0.012 && libRadius(1) === libRadius(0), 'and never smaller than a visible mark');
  let prev = 0;
  for (const n of [1, 10, 100, 1000, 10000, 100000]) {
    const r = libRadius(n);
    assert.ok(r >= prev);
    prev = r;
  }
});

test('each seed of a big library gives less light, so thousands of seeds are a cloud and not a ball', () => {
  assert.equal(seedGain(100), seedGain(1200));
  assert.ok(seedGain(20000) < 0.12);
  assert.ok((20000 * seedGain(20000)) / (1200 * seedGain(1200)) < 6, 'total light grows like a square root, not linearly (16.7×)');
});

test('the library sits in the emptier side of the sky, clear of a galaxy next to the run', () => {
  const big = { c: [0.25, 0, 0] as [number, number, number], r: 0.12, t: 30000, u: 0 };
  const at = emptySky([0, 0, 0], [big]);
  assert.ok(Math.hypot(at[0], at[1]) >= 0.19, 'away from the run, not on top of it');
  assert.ok(Math.hypot(at[0] - 0.25, at[1]) > 0.25, 'and well away from the galaxy');
  assert.deepEqual(emptySky([1, 1, 0], []).length, 3);
});

// ---------- the live library: a saved theorem arrives with what it cites ----------

test('a general lemma has a binder or a quantifier; an instance does not', () => {
  assert.equal(isGeneralLemma('theorem smooth_mono (n k : ℕ) (h : k ≤ n) : P n k := by\n  simp'), true);
  assert.equal(isGeneralLemma('theorem all_n : ∀ n : ℕ, P n := by\n  intro n'), true);
  assert.equal(isGeneralLemma('lemma step {a b : ℕ} : a ≤ b → f a ≤ f b := by\n  exact fun h => h'), true);
  assert.equal(isGeneralLemma('theorem seven : P 7 := by\n  decide'), false);
  assert.equal(isGeneralLemma('theorem seven_dvd : (7 : ℕ) ∣ 14 := by\n  decide'), false);
  assert.equal(isGeneralLemma('open Nat in\ntheorem inst : descFactorial 6 2 ∣ centralBinom 6 := by\n  decide'), false);
  // the last theorem of a proof is the one that counts
  assert.equal(isGeneralLemma('theorem helper (n : ℕ) : P n := by\n  simp\n\ntheorem final : P 3 := by\n  exact helper 3'), false);
  assert.equal(isGeneralLemma(''), false);
});

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

test('a save that arrives with its proof says what it leans on, what it was built from, and whether it is general', () => {
  const saves: UniverseEvent[] = [];
  const sink: UniverseSink = {
    start: (ev) => (saves.push(ev), ev),
    finish: () => {},
    starAt: (i) => [i, 0, 0] as Vec3,
    attention: () => [0, 0, 0] as Vec3,
    verified: () => {},
  };
  // the name index is keyed by a name's last component
  const interp = new LiveInterpreter(indexOf([['descFactorial_le_pow', 11], ['centralBinom_pos', 22]]), sink);
  interp.memory('save', undefined, { name: 'my_first', closure: 'theorem my_first (n : ℕ) : 0 < Nat.centralBinom n := Nat.centralBinom_pos n' });
  interp.memory('save', undefined, { name: 'my_second', closure: 'theorem my_first (n : ℕ) : 0 < Nat.centralBinom n := Nat.centralBinom_pos n\ntheorem my_second : Nat.descFactorial 5 2 ≤ 5 ^ 2 := by\n  have := my_first 3\n  exact Nat.descFactorial_le_pow 5 2' });
  assert.equal(saves.length, 2);
  assert.equal(saves[0].name, 'my_first');
  assert.deepEqual(saves[0].stars, [22], 'leans on the Mathlib lemma it cites');
  assert.deepEqual(saves[0].deps, [], 'nothing earlier to build on');
  assert.equal(saves[0].abstract, true);
  assert.deepEqual(saves[1].deps, [0], 'the second was built from the first');
  assert.deepEqual(saves[1].stars, [11], 'it leans on what its own theorem cites, not on what the earlier save leans on, and never on the earlier save itself');
  assert.equal(saves[1].abstract, false, 'an instance');
  interp.memory('save', undefined, { name: 'my_first', closure: 'theorem my_first (n : ℕ) : 0 < Nat.centralBinom n := by\n  exact better' });
  assert.equal(saves.length, 2, 'saving the same theorem again (an improved version) is not a new theorem');
  interp.forgetSaves();
  interp.memory('save', undefined, { name: 'fresh', closure: 'theorem fresh (n : ℕ) : n = n := rfl' });
  assert.deepEqual(saves[2].deps, [], 'a new run starts with no earlier saves');
});

test('a save with no content is still a save (older bridges)', () => {
  const saves: UniverseEvent[] = [];
  const sink: UniverseSink = { start: (ev) => (saves.push(ev), ev), finish: () => {}, starAt: () => [0, 0, 0] as Vec3, attention: () => [0, 0, 0] as Vec3, verified: () => {} };
  new LiveInterpreter(indexOf([]), sink).memory('save');
  assert.equal(saves.length, 1);
  assert.equal(saves[0].k, 'save');
  assert.equal(saves[0].name, undefined);
});

test('the page says what the driver, the library and the lines are', () => {
  const labels = UNIVERSE_LEGEND.map((l) => l.label.toLowerCase());
  assert.ok(labels.some((l) => l.includes('driver') && !l.includes('library')));
  assert.ok(labels.some((l) => l.includes('library')));
  const colours = UNIVERSE_LEGEND.map((l) => l.color);
  assert.equal(new Set(colours).size, colours.length, 'every colour means one thing');
});
