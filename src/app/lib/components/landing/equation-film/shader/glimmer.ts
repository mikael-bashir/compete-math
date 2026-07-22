// The cheap far field - the glimmer on every corner. Distant layers hold
// bodies too small to show structure, so instead of the full 3x3 search
// and 24-way dispatch, each pixel samples ONE cell: a tight point (a
// distant sun or galaxy core) with size, colour and brightness variety,
// occasionally a tiny edge-on streak or ring. ~5 hashes and a couple of
// exps - a fraction of bodyField's cost - yet it fills the whole frame
// with warm sparkle. Same clumpy density field, so it clusters like the
// real bodies. Fixed per layer: never morphs, nothing is destroyed.
export const FRAG_GLIMMER = `
vec3 glimmerField(vec2 g, float dens, float cf){
  vec2 cell = floor(g + 0.5);
  float h1 = hash21(cell + 3.7);
  float clump = hash21(floor(cell / 2.0) + 51.3);
  // the cheap layer carries the DRAMATIC clustering: clusters pack dense
  // with sparkle, voids fall to near-black - all at glimmer cost
  float density = (0.03 + 1.20 * cf) * (0.55 + 0.45 * clump) * dens;
  if (h1 > density) return vec3(0.0);
  float h2 = hash21(cell + 9.1);
  float h3 = hash21(cell + 13.9);
  float h4 = hash21(cell + 27.2);
  vec2 pos = cell + (vec2(hash21(cell + 7.7), hash21(cell + 15.1)) - 0.5) * 0.7;
  vec2 d = g - pos;
  float r2 = dot(d, d);
  vec3 tc = warmTint(h4);
  vec3 f = tc * exp(-r2 * (900.0 + 3200.0 * h2)) * (0.55 + 0.8 * h1);
  if (h3 > 0.86){        // a tiny edge-on streak
    f += tc * exp(-d.y * d.y * 4200.0) * exp(-abs(d.x) * 30.0) * 0.4;
  } else if (h3 > 0.70){ // a tiny ring
    float r = sqrt(r2) * 30.0;
    f += tc * exp(-(r - 0.5) * (r - 0.5) * 8.0) * 0.3;
  }
  return f;
}
`
