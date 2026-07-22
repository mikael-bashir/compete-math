// Smooth value noise (one bilinear cell) - the seed of organic structure.
export const FRAG_NOISE = `
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// The cosmic web: three octaves of noise pushed toward their extremes, so
// space is mostly void, threaded with dense supercluster filaments. THREE
// octaves matter - a single low frequency would blanket the whole screen
// with one value once the camera has zoomed in (the screen spanning less
// than one cell), making mid-dive frames uniformly packed or uniformly
// empty; the higher octaves keep sub-structure on screen at every zoom.
// Sampled ONCE per pixel and shared by all layers, so a supercluster is
// dense at all depths at once and the camera flies through it. ~12 hashes.
float webDensity(vec2 c){
  float w = vnoise(c * 0.10) * 0.55 + vnoise(c * 0.35 + 7.3) * 0.30 + vnoise(c * 1.10 + 19.1) * 0.15;
  return smoothstep(0.36, 0.68, w);
}
`
