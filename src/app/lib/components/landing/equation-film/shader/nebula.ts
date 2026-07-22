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
//
// Fourth pass, four tricks lifted from Frank Hugenroth's galaxy shader
// (nordlicht/bremen 2015) after the user held it up as the realism bar:
// (1) ROTATED-DOMAIN fbm - his mat3 m rotates the noise domain between
//     octaves, which kills the axis-aligned bias of value noise (the
//     subtle horizontal/vertical grain that makes procedural clouds
//     read as synthetic); ours previously advanced octaves with a plain
//     scale+offset, so all octaves shared the same lattice orientation.
// (2) MULTI-STOP colour inside one cloud - he stacks differently-hued
//     fog layers (blue-white, purple, red) plus a radius-driven
//     dustcolor ramp; a single two-colour ramp reads as one material,
//     real emission nebulae shift hue with excitation and depth.
// (3) DARK DUST LANES - his "gholes" term SUBTRACTS opaque dust from
//     the cloud colour. Real nebulae are backlit gas silhouetted by
//     cold foreground dust; without dark lanes carving the bright gas
//     nothing ever occludes anything and the field looks like glow, not
//     matter. Ours ride the SAME curl-warped coordinate as the gas, so
//     lanes follow the same eddies instead of floating free.
// (4) HOT KNOTS - his pow(noise, 22) star-forming hotspots: raising
//     density to a high power leaves rare, tiny, near-white cores
//     embedded in the gas where it is thickest.
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
  vec2 pw = p; // the curl-warped frame: gas AND dust lanes both live in it

  const mat2 rotO = mat2(0.848, 0.530, -0.530, 0.848); // ~32deg between octaves
  float n = 0.0, ridge = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++){
    float v = vnoise(p);
    n += v * amp;
    ridge += (1.0 - abs(v * 2.0 - 1.0)) * amp; // thin bright filaments
    p = rotO * p * 2.3 + vec2(53.1, -27.4);
    amp *= 0.53;
  }
  n = clamp(n, 0.0, 1.0);
  float density = mix(n, clamp(ridge, 0.0, 1.0), 0.45); // haze + filament blend

  // dark matter: only the densest wisps glow, everything below the
  // threshold stays dark instead of an even haze over the whole frame
  float glow = pow(smoothstep(0.38, 0.82, density), 2.0);

  // dark dust lanes, in the same curl-warped frame as the gas
  vec2 q = pw * 1.6 + vec2(-71.9, 143.7);
  float lane = vnoise(q) * 0.65 + vnoise(rotO * q * 2.1 + 9.7) * 0.35;
  glow *= 1.0 - 0.72 * smoothstep(0.56, 0.80, lane);

  // three-stop palette: cold ember -> amber -> near-white gold at peaks
  vec3 tint = mix(vec3(0.45, 0.12, 0.06), vec3(1.0, 0.62, 0.25), smoothstep(0.0, 0.65, density));
  tint = mix(tint, vec3(1.0, 0.92, 0.75), smoothstep(0.72, 0.95, density));

  // hot knots: rare bright cores where the gas is thickest
  float knots = pow(density, 9.0) * 1.4 * (1.0 - 0.72 * smoothstep(0.56, 0.80, lane));

  // CONCENTRATION - the Hugenroth trait that matters most: his clouds
  // are confined to the galactic disc and the rest of the frame is
  // near-black. Our confinement dial is the cosmic web: bright silk
  // lives along the filaments (cf high) and falls to a whisper in the
  // voids, whose "not empty" floor is nebulaHaze's job, not this layer's.
  float region = 0.08 + 0.92 * cf;

  return (tint * glow + vec3(1.0, 0.85, 0.6) * knots) * 0.5 * region;
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
