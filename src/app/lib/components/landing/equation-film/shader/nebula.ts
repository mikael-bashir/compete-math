// A continuous cloud/gas wash between the discrete bodies - stars AND
// nebulae, not just points. Inspired by Star Nest by Pablo Roman
// Andrioli (MIT license, shadertoy.com/view/XlfGRj): brightness and
// colour accumulated across a few "depth" octaves, with a dark-matter-
// style contrast curve so only the densest wisps glow and voids stay
// properly dark, colour warming from ember at low density to gold at
// high. Star Nest gets this from an iterated fractal fold ray-marched
// through 3D; a first attempt porting that fold straight into 2D here
// produced a visible tiling grid at mid-zoom and flare-like blobs at
// close zoom (its periodic "mod" tiling assumes many blended ray steps
// hiding the seams - our few discrete taps don't have enough to hide
// them, and world-space coordinates span too wide a range across this
// film's zoom for one tiling period to ever look right at every depth).
// Rebuilt on vnoise/fbm instead - the same primitive webDensity already
// uses cleanly at every zoom level in this shader.
//
// Second pass: plain fbm alone read as a flat scatter of same-sized soft
// round blobs - one noise map stamped everywhere, not real gas. Fixed
// two ways: a domain warp (the sample point is distorted before the
// octaves run) breaks the round-blob regularity into swirled shapes; and
// a RIDGED component (1-|2v-1|, thin bright seams where the noise
// crosses its midline instead of smooth round humps) blended into the
// plain fbm gives filament structure real nebulae have. Its own
// frequency/lacunarity/offset are deliberately different from
// webDensity's (0.10/0.35/1.10, offsets 0/7.3/19.1) so the cloud shapes
// don't visually coincide with the supercluster map - they're
// independent fields that both draw on vnoise, not one map wearing two
// colours.
//
// Third pass: the first warp used an arbitrary noise-valued vector,
// which distorts space without any physical rationale - it looked
// gorgeous but not structurally real. Real nebulae are actual turbulent
// gas, shaped by stellar winds, shockwaves and magnetic fields - genuine
// fluid vorticity, not decoration. curl() takes the perpendicular
// gradient of a scalar potential, which is automatically divergence-
// free: warping by it produces coherent EDDIES the eye reads as fluid
// motion, the same technique production VFX uses for smoke and clouds.
export const FRAG_NEBULA = `
vec2 curl(vec2 p){
  float e = 0.05;
  float n1 = vnoise(p + vec2(0.0, e));
  float n2 = vnoise(p - vec2(0.0, e));
  float n3 = vnoise(p + vec2(e, 0.0));
  float n4 = vnoise(p - vec2(e, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

vec3 nebulaWash(vec2 world, float cf, float t){
  vec2 p = world * 0.07 + vec2(311.7, -157.3) + t * 0.004;
  p += curl(p * 0.65 + 19.3) * 2.0; // one vorticity pass - a real eddy, not noise

  float n = 0.0, ridge = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++){
    float v = vnoise(p);
    n += v * amp;
    ridge += (1.0 - abs(v * 2.0 - 1.0)) * amp; // thin bright filaments
    p = p * 2.3 + vec2(53.1, -27.4);
    amp *= 0.53;
  }
  n = clamp(n, 0.0, 1.0);
  float density = mix(n, clamp(ridge, 0.0, 1.0), 0.45); // haze + filament blend

  // dark matter: only the densest wisps glow, everything below the
  // threshold stays dark instead of an even haze over the whole frame
  float glow = pow(smoothstep(0.38, 0.82, density), 2.0);
  vec3 tint = mix(vec3(0.55, 0.20, 0.10), vec3(1.0, 0.78, 0.42), density);
  return tint * glow * 0.5 * (0.3 + 0.7 * cf); // thin in voids, thicker along the web
}

// A second, cheap, near-transparent haze layer UNDER the wisps above -
// real deep-sky views are never truly empty between visible nebulae
// (zodiacal light, faint diffuse galactic glow, unresolved dust), so a
// hard cut to pure black between wisps reads as artificial. Two octaves,
// no domain warp, no dark-matter cutoff - the point is a LOW, EVER-
// PRESENT floor, not more structure to look at. Own frequency/offset
// again, so it doesn't just look like a dimmer copy of the wispy layer.
vec3 nebulaHaze(vec2 world, float cf, float t){
  vec2 p = world * 0.035 + vec2(-83.1, 211.4) + t * 0.0018;
  float n = vnoise(p) * 0.6 + vnoise(p * 2.3 + 17.9) * 0.4;
  n = clamp(n, 0.0, 1.0);
  vec3 tint = mix(vec3(0.10, 0.05, 0.04), vec3(0.30, 0.19, 0.11), n);
  return tint * (0.10 + 0.16 * n) * (0.35 + 0.65 * cf);
}
`
