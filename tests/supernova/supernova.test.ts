// The proof supernova: its timeline (pure numbers), and the source of its shaders, which cannot be compiled here (no GPU in a test run) but
// can be checked for the mistakes that were actually made while writing them. The look itself is checked on the preview page (src/app/lab/supernova).
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DETONATION_S,
  FADE_IN_S,
  FADE_OUT_FROM_S,
  SEDOV_EXPONENT,
  SEDOV_K,
  SEDOV_T0,
  TEXT_IN_S,
  TEXT_OUT_FROM_S,
  TOTAL_S,
  blastRadius,
  flashEnvelope,
  overlayAlpha,
  smoothstep,
  textOpacity,
} from '../../src/components/prover/supernova/timeline';
import { BLUR_FRAG, BRIGHT_FRAG, FINAL_FRAG, SCENE_FRAG, VERT } from '../../src/components/prover/supernova/shader';
import { theoremNameOf } from '../../src/components/prover/supernova/use-proof-celebration';

const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

test('the beats come in order: quiet, detonation, the word, the word goes, the sky goes', () => {
  assert.ok(0 < DETONATION_S && DETONATION_S < TEXT_IN_S, 'the word comes after the detonation');
  assert.ok(TEXT_IN_S < TEXT_OUT_FROM_S, 'and stays a while');
  assert.ok(TEXT_OUT_FROM_S < FADE_OUT_FROM_S, 'and leaves before the sky does');
  assert.ok(FADE_OUT_FROM_S < TOTAL_S);
  assert.ok(FADE_IN_S < DETONATION_S, 'the dark is in place before the star goes off');
});

test('the blast wave follows the Sedov-Taylor law: radius goes as t^(2/5), fast at first and then slowing', () => {
  assert.equal(SEDOV_EXPONENT, 0.4);
  for (const [t1, t2] of [[0.1, 1], [0.5, 4], [1, 5]]) {
    const ratio = blastRadius(t2) / blastRadius(t1);
    const law = Math.pow((t2 + SEDOV_T0) / (t1 + SEDOV_T0), SEDOV_EXPONENT);
    assert.ok(Math.abs(ratio - law) < 1e-9, `R(${t2})/R(${t1}) = ${ratio}, the law says ${law}`);
  }
  const R = range(0, 8, 400).map(blastRadius);
  for (let i = 1; i < R.length; i++) assert.ok(R[i] > R[i - 1], 'it only grows');
  assert.ok(blastRadius(1) - blastRadius(0) > blastRadius(6) - blastRadius(5), 'and it slows: the first second covers far more than the sixth');
  assert.ok(blastRadius(0) < 0.15, 'it starts small, near a point');
  assert.ok(Math.abs(blastRadius(5) - 0.9) < 0.12, `about the edge of a 16:9 screen (0.89 screen heights) at five seconds, got ${blastRadius(5).toFixed(3)}`);
  assert.equal(blastRadius(-3), blastRadius(0), 'nothing before the detonation');
  assert.equal(SEDOV_K, 0.47);
});

test('the overlay is in, full for most of it, and out by the end, never outside 0..1', () => {
  assert.equal(overlayAlpha(0), 0);
  assert.equal(overlayAlpha(FADE_IN_S), 1);
  assert.equal(overlayAlpha((FADE_IN_S + FADE_OUT_FROM_S) / 2), 1);
  assert.equal(overlayAlpha(TOTAL_S), 0);
  for (const t of range(-1, TOTAL_S + 1, 300)) assert.ok(overlayAlpha(t) >= 0 && overlayAlpha(t) <= 1);
});

test('one flash, not a strobe: it rises in a few hundredths of a second and then only falls', () => {
  assert.equal(flashEnvelope(-1), 0);
  assert.equal(flashEnvelope(0), 0);
  const f = range(0, 3, 600).map(flashEnvelope);
  const peak = f.indexOf(Math.max(...f));
  assert.ok(peak * (3 / 600) < 0.15, `the peak is within 150 ms of the detonation, at ${(peak * 3) / 600} s`);
  for (let i = peak + 1; i < f.length; i++) assert.ok(f[i] <= f[i - 1] + 1e-12, 'after the peak it never rises again');
  assert.ok(f[f.length - 1] < 0.001, 'and it is gone');
});

test('the word arrives after the detonation, is fully there, and is gone before the end', () => {
  assert.equal(textOpacity(0), 0);
  assert.equal(textOpacity(DETONATION_S), 0);
  assert.equal(textOpacity(TEXT_IN_S + 1.5), 1);
  assert.equal(textOpacity(TOTAL_S), 0);
  for (const t of range(0, TOTAL_S, 300)) assert.ok(textOpacity(t) >= 0 && textOpacity(t) <= 1);
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
});

// ---- the shaders: what cannot be compiled in a test can still be read
const PROGRAMS: [string, string][] = [['VERT', VERT], ['SCENE', SCENE_FRAG], ['BRIGHT', BRIGHT_FRAG], ['BLUR', BLUR_FRAG], ['FINAL', FINAL_FRAG]];
const code = (src: string) => src.replace(/\/\/[^\n]*/g, ''); // GLSL without its comments

test('every shader is WebGL2 GLSL, with balanced braces and parentheses', () => {
  for (const [name, src] of PROGRAMS) {
    assert.ok(src.startsWith('#version 300 es\n'), `${name} starts with the version line`);
    const c = code(src);
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      assert.equal(c.split(open).length, c.split(close).length, `${name}: ${open}${close} balance`);
    }
    if (name !== 'VERT') assert.match(src, /precision highp float;/, `${name} sets a float precision`);
    assert.doesNotMatch(src, /\$\{|undefined|NaN/, `${name} has no template leftovers`);
  }
});

test('the scene takes its timing from the timeline, so the two cannot drift apart', () => {
  assert.match(SCENE_FRAG, new RegExp(`const float T0 = ${DETONATION_S.toString().replace('.', '\\.')}`));
  assert.match(SCENE_FRAG, new RegExp(`${SEDOV_K}`));
  assert.match(SCENE_FRAG, new RegExp(`pow\\(tt \\+ ${SEDOV_T0}, ${SEDOV_EXPONENT}\\)`));
});

test('the shader mistakes that were actually made stay out: pow() of a signed value, and GLSL keywords used as names', () => {
  // pow(x, y) is undefined for x < 0 in GLSL, and a Gaussian of a signed distance squares it: that is sq(), not pow(x, 2.0)
  for (const [name, src] of PROGRAMS) assert.doesNotMatch(code(src), /pow\([^;]*,\s*2\.0\)/, `${name}: pow(x, 2.0) of a signed value is undefined; use x * x`);
  // `flat` (and the other interpolation and storage qualifiers) are reserved: a parameter called `flat` fails to compile
  for (const [name, src] of PROGRAMS) {
    assert.doesNotMatch(code(src), /\b(?:float|vec[234]|int)\s+(?:flat|smooth|centroid|invariant|sample|patch|input|output|common|active|partition|filter|sizeof|cast|namespace|using)\b/, `${name}: a reserved word is used as a name`);
  }
});

test('the scene has a figure for scale, galaxies, the Sedov-Taylor front and the debris', () => {
  for (const marker of ['float figure(vec2 p)', 'vec3 galaxy(', 'vec3 sparks(', 'Sedov-Taylor', 'ridged(', 'dust lanes']) assert.ok(SCENE_FRAG.includes(marker), `the scene lacks ${marker}`);
});

test('the final pass is premultiplied, so the page shows through while the overlay fades', () => {
  assert.match(FINAL_FRAG, /outColor = vec4\(col \* uAlpha, uAlpha\);/);
});

// ---- the name under the word
test('the theorem name is read off the statement', () => {
  assert.equal(theoremNameOf('theorem sum_two_odds_even (a b : ℕ) : Even (a + b) := by sorry'), 'sum_two_odds_even');
  assert.equal(theoremNameOf('open Nat in\ntheorem erdos_396 : ∀ k, True := by\n  sorry'), 'erdos_396');
  assert.equal(theoremNameOf('lemma helper_1 : True := trivial'), 'helper_1');
  assert.equal(theoremNameOf('example : 1 + 1 = 2 := rfl'), undefined);
  assert.equal(theoremNameOf(''), undefined);
  assert.equal(theoremNameOf(null), undefined);
});
