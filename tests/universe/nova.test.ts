// The supernova at the end of a proof (src/lib/universe/nova.ts): the numbers the engine and the page flash take, and the engine's shader source,
// which cannot be compiled in a test run (no GPU) but can be read for the mistakes that were actually made writing GLSL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  NOVA,
  PAGE_FLASH,
  blastRadius,
  flashEnvelope,
  novaView,
  pageFlashFrames,
  ringBrightness,
  rippleRadius,
  shakeOffset,
  shouldFire,
  sparks,
} from '../../src/lib/universe/nova';
import { FINALE } from '../../src/lib/universe/lineage';

const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

test('nothing happens before the star is born', () => {
  for (const born of [-5, -0.001, 0]) {
    assert.equal(blastRadius(born), 0);
    assert.equal(rippleRadius(born), 0);
    assert.equal(flashEnvelope(born), 0);
    assert.equal(ringBrightness(born), 0);
    assert.deepEqual(shakeOffset(born), [0, 0]);
    assert.deepEqual(sparks(born), []);
  }
});

test('the wave follows the Sedov-Taylor law (radius ~ t^(2/5)), leaps and then slows, and stops at rMax: a corner of a galaxy', () => {
  for (const [t1, t2] of [[0.1, 1], [0.5, 3]]) {
    const ratio = blastRadius(t2) / blastRadius(t1);
    const law = Math.pow((t2 + NOVA.t0) / (t1 + NOVA.t0), NOVA.exponent);
    assert.ok(Math.abs(ratio - law) < 1e-9, `${ratio} against the law's ${law}`);
  }
  const R = range(0, NOVA.growS + 3, 400).map((t) => blastRadius(t));
  for (let i = 1; i < R.length; i++) assert.ok(R[i] >= R[i - 1], 'it never shrinks');
  assert.ok(blastRadius(1) - blastRadius(0) > blastRadius(6) - blastRadius(5), 'the first second covers far more than the sixth');
  assert.ok(Math.abs(blastRadius(NOVA.growS) - NOVA.rMax) < 1e-12, 'it reaches rMax when it should');
  assert.equal(blastRadius(NOVA.growS + 30), NOVA.rMax, 'and goes no further');
  assert.ok(NOVA.rMax < 0.03 && NOVA.rMax2 < 0.05, 'a galaxy is a few tenths of the universe across: the wave is a small corner of one');
});

test('the wave is only there when the reader is zoomed far in: a few pixels at the finale camera, nothing from far away, the screen when very close', () => {
  const H = 900;
  const at = (dist: number) => novaView(2, dist, H);
  assert.equal(at(6).k, 0, 'the whole universe in view: the wave is a speck and is not drawn');
  assert.equal(at(2.6).k, 0, 'the default overview: not drawn');
  assert.ok(at(0.3).k > 0, 'the finale camera at its closest: a visible ring');
  assert.ok(at(0.03).ring > 0.15, 'zoomed to the limit: the ring is a large part of the view');
  assert.ok(at(0.03).ring > at(0.3).ring && at(0.3).ring > at(1.3).ring, 'it grows as you zoom in');
  assert.ok(at(0.03).width > at(0.3).width, 'and so does its width, which never drops below a pixel and a half');
  assert.ok(novaView(2, 9, H).width >= 1.5 / H - 1e-12);
});

test('one flash, not a strobe: it rises in a few hundredths of a second, then only falls', () => {
  const f = range(0, 3, 600).map((t) => flashEnvelope(t));
  const peak = f.indexOf(Math.max(...f));
  assert.ok((peak * 3) / 600 < 0.15, `the peak comes within 150 ms, at ${(peak * 3) / 600} s`);
  for (let i = peak + 1; i < f.length; i++) assert.ok(f[i] <= f[i - 1] + 1e-12, 'it never rises again');
  assert.ok(f[f.length - 1] < 0.001);
  assert.ok(NOVA.flashPeak <= 1, 'and not more than the picture can hold');
  assert.ok(flashEnvelope(0.3) < 0.25 * flashEnvelope(0.04), 'most of it is gone within a third of a second: a flash, not a fade to white');
});

test('the page flash is one decaying flash that never fully whites out the page and ends at nothing', () => {
  const frames = pageFlashFrames(PAGE_FLASH.peak);
  assert.equal(frames[0].opacity, 0);
  assert.equal(frames[frames.length - 1].opacity, 0);
  assert.equal(frames[frames.length - 1].offset, 1);
  const peakAt = frames.findIndex((f) => f.opacity === Math.max(...frames.map((x) => x.opacity)));
  for (let i = peakAt + 1; i < frames.length; i++) assert.ok(frames[i].opacity < frames[i - 1].opacity, 'after the peak it only falls');
  assert.ok(Math.max(...frames.map((f) => f.opacity)) <= 0.62, 'the peak leaves the page visible through it');
  assert.ok(frames[peakAt].offset * PAGE_FLASH.durationMs < 60, 'it rises in well under a tenth of a second');
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i].offset > frames[i - 1].offset);
});

test('the shake is rough, bounded, decays, and is a function of the time only (so a scrubbed replay shakes exactly as it would have)', () => {
  const o = range(0, NOVA.shakeS + 0.5, 800).map((t) => shakeOffset(t));
  for (const [x, y] of o) assert.ok(Math.abs(x) <= NOVA.shakeAmp && Math.abs(y) <= NOVA.shakeAmp, 'within the amplitude');
  const early = Math.max(...o.slice(0, 120).map(([x, y]) => Math.hypot(x, y)));
  const late = Math.max(...o.slice(500, 620).map(([x, y]) => Math.hypot(x, y)));
  assert.ok(early > 0.3 * NOVA.shakeAmp, `it really shakes at the start (${early})`);
  assert.ok(late < early * 0.25, 'and has died away by the end');
  assert.deepEqual(shakeOffset(NOVA.shakeS + 1), [0, 0], 'and stops by itself');
  assert.deepEqual(shakeOffset(0.3), shakeOffset(0.3), 'deterministic');
  assert.ok(new Set(o.map(([x]) => Math.sign(x))).size > 1, 'it goes both ways: a shake, not a push');
});

test('the debris leaves the star, slows, fades and cools; none of it is far from the star', () => {
  assert.equal(sparks(0.5).length, NOVA.sparks);
  const reach = (t: number) => Math.max(...sparks(t).map((s) => Math.hypot(s.dx, s.dy)));
  assert.ok(reach(2) > reach(0.3), 'it spreads');
  assert.ok(reach(10) <= NOVA.rMax * 1.8 + 1e-9, 'and stays within a corner of the galaxy');
  assert.ok(reach(2) - reach(1) < reach(1) - reach(0), 'slowing');
  assert.ok(sparks(8).length < sparks(0.5).length, 'it fades out');
  const hotEarly = sparks(0.3).reduce((a, s) => a + s.hot, 0) / sparks(0.3).length;
  const hotLate = sparks(2.5).reduce((a, s) => a + s.hot, 0) / Math.max(1, sparks(2.5).length);
  assert.ok(hotEarly > hotLate, 'cooling from white toward ember');
});

test('the page flashes once, when the star is born while it is being watched, and not when a replay is scrubbed into the middle of it', () => {
  assert.ok(shouldFire(-1, 0.02, true), 'born while watched: fire');
  assert.ok(shouldFire(-0.01, 0.01, true));
  assert.ok(!shouldFire(0.5, 0.52, true), 'already going off: no second flash');
  assert.ok(!shouldFire(-1, 3, true), 'scrubbed to the middle of it: no flash');
  assert.ok(!shouldFire(-1, 0.02, false), 'paused and scrubbed: no flash');
  assert.ok(!shouldFire(-1, -0.5, true), 'not born yet');
});

test('the nova goes off exactly when the finale says the target is born', () => {
  assert.equal(FINALE.stillness, 1.2, 'nova.ts takes its cue from the finale: change one and look at the other');
});

// ---- the engine's shader source: what cannot be compiled here can be read
const engine = readFileSync(new URL('../../src/lib/universe/engine.ts', import.meta.url), 'utf8');
const toneFs = /const TONE_FS = `([\s\S]*?)`;/.exec(engine)?.[1] ?? '';
const glsl = toneFs.replace(/\/\/[^\n]*/g, '');

test('the tone-mapping pass has the wave and the flash, in GLSL that avoids the mistakes made before', () => {
  assert.ok(toneFs.startsWith('#version 300 es'), 'WebGL2 GLSL');
  for (const u of ['u_flash', 'u_novaC', 'u_nova', 'u_nova2']) assert.ok(toneFs.includes(u), `declares ${u}`);
  for (const [o, c] of [['{', '}'], ['(', ')']]) assert.equal(glsl.split(o).length, glsl.split(c).length, `${o}${c} balance`);
  assert.doesNotMatch(glsl, /pow\([^;]*,\s*2\.0\)/, 'pow(x, 2.0) of a signed value is undefined in GLSL: use sq()');
  assert.doesNotMatch(glsl, /\b(?:float|vec[234]|int)\s+(?:flat|smooth|centroid|invariant|sample|patch|input|output|common|active|filter|cast|namespace|using)\b/, 'a reserved word used as a name');
  assert.match(glsl, /float sq\(float x\)/);
});

test('the engine draws the nova: shake in the camera, wave and flash in the tone pass, debris in the finale, the page flash on the option', () => {
  for (const marker of ['shakeOffset(born)', "u_nova'", "u_flash'", 'novaSparks(nb)', 'onNova', 'shouldFire(this.prevBorn', 'jumpToFinale']) assert.ok(engine.includes(marker), `engine.ts lacks ${marker}`);
  assert.match(engine, /this\.calm/, 'reduced motion is honoured');
});
