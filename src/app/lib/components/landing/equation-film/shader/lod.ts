// The far-LOD of a universe layer: bodies smaller than ~a dozen pixels are
// warm gaussian dots - same existence, position and tint hashes as
// bodyField, so every dust grain GROWS INTO exactly the body it already
// was. No rotation, no type branches, no escape loop: at dust scale the
// full equation is sub-pixel anyway, and skipping it kills the warp
// divergence that made the deep field expensive (neighbouring pixels land
// in different cells, so every branch serializes on the GPU).
export const FRAG_LOD = `
vec3 dustField(vec2 g, bool isMain, float dens, float cf){
  vec2 base = floor(g + 0.5);
  bool home = isMain && base.x == 0.0 && base.y == 0.0;
  float h1 = hash21(base + 3.7);
  float clump = hash21(floor(base / 2.0) + 51.3);
  float density = (0.10 + 0.40 * cf) * (0.55 + 0.45 * clump) * dens;
  bool exists = home
    || (h1 < density && !(isMain && abs(base.x) <= 1.0 && abs(base.y) <= 1.0));
  if (!exists) return vec3(0.0);
  vec2 pos = home
    ? base
    : base + (vec2(hash21(base + 7.7), hash21(base + 15.1)) - 0.5) * 0.56;
  vec2 d = g - pos;
  float gs = home ? 0.22 : 0.10 + 0.10 * h1;
  float rr = dot(d, d) / (gs * gs);
  vec3 tint = home ? vec3(1.0, 0.90, 0.65) : warmTint(hash21(base + 33.3));
  return tint * exp(-rr * 1.8) * (home ? 0.9 : 0.35 + 0.65 * h1);
}

// One universe layer at whatever LOD its on-screen cell size has earned:
// nothing below 2.5px, gaussian dust to ~11px, the full equation from
// ~17px, a short crossfade between. cellPx is uniform across the frame,
// so these branches cost nothing in divergence.
vec3 bodyField(vec2 g, float t, vec2 cHome, float reveal, float zp, bool isMain, float dens, float cf);
vec3 layerField(vec2 g, float t, vec2 cHome, float reveal, float zp, bool isMain, float dens, float cellPx, float cf){
  float onA = smoothstep(2.5, 6.0, cellPx);
  if (onA < 0.004) return vec3(0.0);
  // hold the cheap dust LOD a little longer: fewer shells run the full
  // escape loop at once, trimming the deep-dive frame cost - and a
  // distant galaxy reading as a soft dot instead of a tiny fractal is
  // indistinguishable at that size anyway
  float toB = smoothstep(14.0, 21.0, cellPx);
  vec3 c = vec3(0.0);
  if (toB < 0.996) c += dustField(g, isMain, dens, cf) * onA * (1.0 - toB);
  if (toB > 0.004) c += bodyField(g, t, cHome, reveal, zp, isMain, dens, cf) * toB;
  return c;
}
`
