// A continuous cloud/gas wash between the discrete bodies - stars AND
// nebulae, not just points. This layer went through several passes; the
// history matters because each rejected attempt encodes a constraint:
//
// v1: Star Nest's fractal fold ported to 2D - visible tiling grid at
//     mid-zoom, flare blobs at close zoom (its periodic mod() assumes
//     many blended ray steps hiding the seams). Rebuilt on vnoise/fbm.
// v2: plain fbm - a flat scatter of same-sized round blobs. Added a
//     noise-vector domain warp + a ridged component.
// v3: warp upgraded to curl noise (divergence-free eddies).
// v4: Hugenroth galaxy-shader tricks: rotated-domain octaves (kills the
//     axis-aligned lattice grain of value noise), multi-stop palette,
//     dark dust lanes, hot knots, and web-gated concentration.
// v5 (this one): user benchmarked against real astrophotography
//     (NGC 6188-class) - v4 still read as UNIFORM swirl texture. Three
//     structural gaps, three fixes:
//     (1) MULTI-SCALE BILLOWS - one curl pass at one frequency makes
//         every swirl the same size; real nebulae cascade from huge
//         cloud masses to fine tendrils. Fix: NESTED domain warping
//         (Inigo Quilez's f(p + 4*fbm(p + 4*fbm(p))) construction) -
//         warping the warp compounds structure across scales and
//         produces exactly the billowing cauliflower chaos in the
//         reference photos.
//     (2) ILLUMINATION - uniform self-glow reads as smoke. Real
//         emission nebulae are LIT: near-white where dense gas sits by
//         the embedded stars, tan mid-density, ember fringes, black
//         voids. The palette now rides density through cream, and
//         brightness falls quadratically, so cores blaze and edges die.
//     (3) COMPOSITION - texture everywhere reads as wallpaper no matter
//         how good the texture is. A very-low-frequency gate (mega)
//         confines the wash to one-or-two grand complexes per wide
//         frame with genuinely empty sky between (nebulaHaze still
//         floors the voids). The gate also EARLY-OUTS the whole nested
//         warp in empty sky - the expensive part never runs there.
//     Dust silhouettes now come free: the intermediate warp field r is
//     already computed, and thresholding it gives crisp-edged opaque
//     foreground dust that follows the same flow as the gas it occludes.
// v6: user reported real-device lag after v5 (double-nested warp, ~15
//     vnoise calls / 60 hashes per pixel, run over most of the frame -
//     the mega gate's band was wide enough that "grand complex" covered
//     60-70% of the screen, not the sparse coverage the composition fix
//     was meant to produce). Cut ~35% of the cost without dropping the
//     things that actually read as realism:
//     - DROPPED THE SECOND WARP LEVEL (r): single-level warp
//       f(p + k*fbm(p)) instead of f(p + k*fbm(p + k*fbm(p))). The
//       illumination ramp, dust lanes and composition gate - not the
//       warp-of-a-warp - were what closed the realism gap; one level of
//       IQ warping still gives organic (non-radial) billow shapes.
//     - q's own noise is now ONE plain vnoise tap, not a 2-octave fbm -
//       it only needs to supply a warp DIRECTION, not fine detail (all
//       the visible detail comes from the final fbm4 sample, which
//       keeps its full 4 octaves).
//     - dust gets its own single cheap tap instead of reusing the
//       (now-deleted) r field, so it keeps independent-looking edges.
//     - TIGHTENED the mega gate's band (0.36-0.62 -> 0.46-0.70): more of
//       the frame is genuine empty sky that returns before any of the
//       above ever runs, which is both cheaper AND more realistic
//       (real deep-sky frames are mostly empty).
export const FRAG_NEBULA = `
const mat2 NEB_ROT = mat2(0.848, 0.530, -0.530, 0.848); // ~32deg between octaves

float nebFbm4(vec2 p){
  float v = 0.0, a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){
    v += a * vnoise(p);
    s += a;
    p = NEB_ROT * p * 2.24 + vec2(53.1, -27.4);
    a *= 0.55;
  }
  return v / s;
}

vec3 nebulaWash(vec2 world, float cf, float t){
  // composition gate first: grand complexes with real empty sky between,
  // and a free exit for every pixel of that sky. THREE octaves for the
  // same reason webDensity has three - a single low frequency goes DC
  // once the camera zooms far past it (whole screen inside one cell),
  // which blanked this layer out of the entire mid-dive.
  float mg = vnoise(world * 0.018 + vec2(77.7, -13.1)) * 0.5
           + vnoise(world * 0.075 + vec2(-31.3, 8.9)) * 0.3
           + vnoise(world * 0.30 + vec2(12.1, 44.7)) * 0.2;
  float mega = smoothstep(0.46, 0.70, mg);
  if (mega < 0.01) return vec3(0.0);

  vec2 p = world * 0.055 + vec2(311.7, -157.3) + t * 0.003;

  // single-level domain warp: q (one cheap noise tap, centered - fbm has
  // mean ~0.5, and feeding it in raw shifts the domain instead of
  // distorting it) bends the coordinate the final fbm4 sample is taken
  // at. Gain stays moderate - at IQ's canonical 4.0 the field folds over
  // itself into hard-edged liquid-metal loops, not gas.
  vec2 q = vec2(vnoise(p + 4.1), vnoise(p + vec2(-7.7, 12.3))) - 0.5;
  float f = nebFbm4(p + 2.2 * q);

  float dens = smoothstep(0.26, 0.94, f);

  // illumination ramp: ember fringes -> tan body -> cream blaze at the
  // cores, brightness falling quadratically away from them
  vec3 gas = mix(vec3(0.30, 0.09, 0.045), vec3(0.85, 0.55, 0.28), smoothstep(0.05, 0.55, dens));
  gas = mix(gas, vec3(1.0, 0.93, 0.80), smoothstep(0.55, 0.90, dens));
  gas *= 1.0 + 0.30 * q.x; // subtle hue/brightness drift across the cloud
  float glow = dens * dens;

  // opaque foreground dust: its own single cheap tap (not reusing q, or
  // the lanes would trace q's warp shape exactly instead of looking
  // independent), riding the same warped coordinate as the gas it cuts
  float dustN = vnoise(p * 1.7 + 2.2 * q + vec2(41.1, -19.3));
  float dust = smoothstep(0.52, 0.74, dustN);
  float occl = 1.0 - 0.88 * dust;

  // hot knots: rare near-white cores where the gas is thickest
  float knots = pow(dens, 8.0) * 1.2;

  return (gas * glow + vec3(1.0, 0.88, 0.65) * knots) * occl * 0.55 * mega * (0.35 + 0.65 * cf);
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
