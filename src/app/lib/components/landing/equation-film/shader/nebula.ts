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
// uses cleanly at every zoom level in this shader - for the same
// end result (organic, depth-graded cloud brightness) without the
// artifacts. Four octaves for "close and far and everything in between".
export const FRAG_NEBULA = `
vec3 nebulaWash(vec2 world, float cf, float t){
  vec2 p = world * 0.09 + t * 0.004;
  float n = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 4; i++){
    n += vnoise(p) * amp;
    p = p * 2.15 + vec2(17.3, -9.7);
    amp *= 0.52;
  }
  n = clamp(n, 0.0, 1.0);
  // dark matter: only the densest wisps glow, everything below the
  // threshold stays dark instead of an even haze over the whole frame
  float glow = pow(smoothstep(0.42, 0.85, n), 2.2);
  vec3 tint = mix(vec3(0.55, 0.20, 0.10), vec3(1.0, 0.78, 0.42), n);
  return tint * glow * 0.55 * (0.3 + 0.7 * cf); // thin in voids, thicker along the web
}
`
