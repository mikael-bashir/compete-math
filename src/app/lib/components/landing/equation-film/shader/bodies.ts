// The full-detail LOD of a universe layer - the ~24-archetype body
// ecosystem. Only three archetypes run the escape-time equation (the
// signature fractal galaxies - the film's through-line); every other
// cosmic object is cheap procedural trig/gaussians, so the field is 5x
// more diverse AND far cheaper than an all-fractal universe.
export const FRAG_BODIES = `
vec3 bodyField(vec2 g, float t, vec2 cHome, float reveal, float zp, bool isMain, float dens, float cf){
  vec2 base = floor(g + 0.5);
  float bestD = 1e9;
  vec2 bestCell = vec2(1e9);
  vec2 bestPos = vec2(0.0);
  for (int oy = -1; oy <= 1; oy++){
    for (int ox = -1; ox <= 1; ox++){
      vec2 cell = base + vec2(float(ox), float(oy));
      bool home = isMain && cell.x == 0.0 && cell.y == 0.0;
      float h1 = hash21(cell + 3.7);
      float clump = hash21(floor(cell / 2.0) + 51.3); // fine texture on the web
      // the big galaxies cluster MILDLY (they are the costly ones); the
      // cheap glimmer carries the dramatic packing - see glimmerField
      float density = (0.10 + 0.40 * cf) * (0.55 + 0.45 * clump) * dens;
      bool exists = home
        || (h1 < density && !(isMain && abs(cell.x) <= 1.0 && abs(cell.y) <= 1.0));
      if (!exists) continue;
      vec2 pos = home
        ? cell
        : cell + (vec2(hash21(cell + 7.7), hash21(cell + 15.1)) - 0.5) * 0.56;
      float d = length(g - pos);
      if (d < bestD){ bestD = d; bestCell = cell; bestPos = pos; }
    }
  }
  if (bestD > 0.55) return vec3(0.0); // open space

  bool home = isMain && bestCell.x == 0.0 && bestCell.y == 0.0;
  float h1 = hash21(bestCell + 3.7);
  float h2 = hash21(bestCell + 9.1);
  float h3 = hash21(bestCell + 13.9);
  float h4 = hash21(bestCell + 27.2);
  vec2 local = g - bestPos;
  float ang = home ? 0.0 : h2 * 6.28318;
  float ca = cos(ang), sa = sin(ang);
  local = vec2(ca * local.x - sa * local.y, sa * local.x + ca * local.y);
  float rr = 0.0;

  if (home){
    float gs = 0.22;
    vec2 z = (local / gs) * (1.0 + 0.15 * reveal);
    vec3 f = juliaCore(z, cHome);
    rr = dot(local, local) / (gs * gs);
    return f * mix(1.0, 0.3 + 0.7 * exp(-rr * 1.3), 1.0 - zp);
  }

  // shared per-body variety: a wide size range (many small, a few grand)
  // and an independent tint hash, so no two neighbours read the same.
  float szv = 0.55 + 0.85 * h4 * h4;
  float tintH = hash21(bestCell + 33.3);
  float h5 = hash21(bestCell + 51.7);

  // The ECOSYSTEM: ~24 archetypes. Only three run the escape-time equation
  // (the signature fractal galaxies - the film's through-line); every
  // other cosmic object is cheap procedural trig/gaussians, so the field
  // is 5x more diverse AND far cheaper than an all-fractal universe.
  vec3 tc = warmTint(tintH);
  float br = 0.35 + 0.65 * h1;
  float R = length(local);

  if (h3 < 0.085){
    // grand-design two-arm spiral
    float gs = 0.17 * (0.5 + 0.7 * h1) * szv;
    return tc * spiralArms(local, gs, 2.0, 3.0 + h2) * br;
  } else if (h3 < 0.15){
    // flocculent many-arm spiral
    float gs = 0.16 * (0.5 + 0.7 * h2) * szv;
    return tc * spiralArms(local, gs, 4.0 + floor(h4 * 3.0), 1.6 + h1) * br;
  } else if (h3 < 0.20){
    // barred spiral - central bar plus trailing arms
    float gs = 0.17 * (0.5 + 0.6 * h1) * szv;
    float bar = exp(-(local.y * local.y) / (gs * gs) * 6.0) * exp(-(local.x * local.x) / (gs * gs) * 1.1);
    return tc * (spiralArms(local, gs, 2.0, 3.5) * 0.7 + bar * 0.6) * br;
  } else if (h3 < 0.25){
    // edge-on spiral with a dark dust lane
    float gs = 0.16 * (0.5 + 0.7 * h2) * szv;
    float disk = exp(-(local.y * local.y) / (gs * gs * 0.08)) * exp(-(local.x * local.x) / (gs * gs * 1.7));
    float lane = 1.0 - 0.7 * exp(-(local.y * local.y) / (gs * gs * 0.004));
    return tc * disk * lane * br * 1.1;
  } else if (h3 < 0.30){
    // FRACTAL galaxy - the signature escape-time body
    float gs = 0.16 * (0.45 + 0.7 * h1) * szv;
    vec3 f = juliaCore(local / gs, cHome + (vec2(h1, h2) - 0.5) * 0.04);
    rr = dot(local, local) / (gs * gs);
    f *= 0.3 + 0.7 * exp(-rr * 1.3);
    return f * warmTint(tintH) * br;
  } else if (h3 < 0.35){
    // elliptical / lenticular smooth glow
    float gs = 0.12 * (0.4 + 1.0 * h2) * szv;
    rr = dot(local, local) / (gs * gs);
    return tc * exp(-rr * 1.5) * (0.28 + 0.4 * h1);
  } else if (h3 < 0.39){
    // ring galaxy - annulus around a bright core
    float gs = 0.13 * (0.5 + 0.7 * h1) * szv;
    float r = R / gs;
    return tc * (exp(-(r - 0.7) * (r - 0.7) * 16.0) * 0.8 + exp(-r * r * 6.0) * 0.4) * br;
  } else if (h3 < 0.43){
    // planetary nebula - thin bright shell + hot central star
    float gs = 0.10 * (0.5 + 0.6 * h2) * szv;
    float r = R / gs;
    vec3 f = tc * exp(-(r - 0.8) * (r - 0.8) * 20.0) * 0.7;
    f += vec3(1.0, 0.95, 0.8) * exp(-r * r * 140.0) * 0.9;
    return f * br;
  } else if (h3 < 0.47){
    // globular cluster - dense swarm of tiny suns
    float gs = 0.10 * (0.5 + 0.7 * h1) * szv;
    rr = dot(local, local) / (gs * gs);
    vec2 cg = local / gs * 7.0;
    float cd = hash21(floor(cg) + 3.1);
    vec2 fp = fract(cg) - 0.5;
    float spark = cd > 0.55 ? exp(-dot(fp, fp) * 22.0) * (0.4 + 0.6 * cd) : 0.0;
    return vec3(1.0, 0.93, 0.78) * (exp(-rr * 2.2) * 0.3 + spark * exp(-rr * 1.0) * 0.9) * br;
  } else if (h3 < 0.51){
    // open cluster - a looser, warmer scatter
    float gs = 0.12 * (0.5 + 0.8 * h2) * szv;
    rr = dot(local, local) / (gs * gs);
    vec2 cg = local / gs * 4.5;
    float cd = hash21(floor(cg) + 7.7);
    vec2 fp = fract(cg) - 0.5;
    float spark = cd > 0.7 ? exp(-dot(fp, fp) * 16.0) : 0.0;
    return warmTint(fract(tintH * 1.7)) * spark * exp(-rr * 0.8) * 1.1 * br;
  } else if (h3 < 0.56){
    // emission nebula - soft two-lobe cloud with a young star
    float gs = 0.15 * (0.5 + 0.9 * h2) * szv;
    rr = dot(local, local) / (gs * gs);
    vec2 o2 = (vec2(h1, h5) - 0.5) * gs * 0.9;
    float rr2 = dot(local - o2, local - o2) / (gs * gs);
    vec3 f = tc * (exp(-rr * 1.4) * 0.4 + exp(-rr2 * 2.2) * 0.28);
    f += vec3(1.0, 0.9, 0.7) * exp(-rr * 6.0) * 0.16;
    return f * br;
  } else if (h3 < 0.61){
    // supernova remnant - detonating fractal filaments
    float gs = 0.16 * (0.4 + 0.6 * h2) * szv;
    vec3 f = juliaCore(local / gs, vec2(0.0, 0.78 + 0.06 * (h4 - 0.5)));
    rr = dot(local, local) / (gs * gs);
    f *= (0.25 + 0.75 * exp(-rr * 0.9)) * vec3(1.0, 0.95, 0.8);
    return f * br * 1.1;
  } else if (h3 < 0.65){
    // black hole - the basilica set, rim ablaze
    float gs = 0.14 * (0.45 + 0.7 * h1) * szv;
    vec3 f = juliaCore(local / gs, vec2(-1.0, 0.0)) * 0.35;
    float r = R / gs;
    f *= smoothstep(0.10, 0.45, r);
    f += vec3(1.0, 0.72, 0.35) * exp(-abs(r - 0.30) * 22.0) * 0.9;
    return f * br;
  } else if (h3 < 0.69){
    // quasar - brilliant core with a one-sided relativistic jet
    float gs = 0.09 * (0.5 + 0.6 * h2) * szv;
    rr = dot(local, local) / (gs * gs);
    vec3 f = vec3(1.0, 0.92, 0.72) * exp(-rr * 30.0) * 1.4;
    float ja = h4 * 6.28318; vec2 jd = vec2(cos(ja), sin(ja));
    float al = dot(local, jd), pe = dot(local, vec2(-jd.y, jd.x));
    float jet = smoothstep(0.0, gs * 2.5, al) * (1.0 - smoothstep(gs * 2.5, gs * 4.2, al))
              * exp(-pe * pe / (gs * gs * 0.02));
    f += vec3(1.0, 0.7, 0.4) * jet * 0.5;
    return f * br;
  } else if (h3 < 0.73){
    // pulsar - a point with two opposed beams
    rr = dot(local, local);
    vec3 f = vec3(1.0, 0.96, 0.85) * exp(-rr * 3000.0) * 1.3;
    float ja = h4 * 6.28318; vec2 jd = vec2(cos(ja), sin(ja));
    float pe = dot(local, vec2(-jd.y, jd.x)), al = abs(dot(local, jd));
    f += vec3(0.9, 0.8, 0.7) * exp(-pe * pe * 900.0) * (1.0 - smoothstep(0.0, 0.12 * szv, al)) * 0.4;
    return f * br;
  } else if (h3 < 0.78){
    // bright star with four-point diffraction spikes
    rr = dot(local, local);
    vec3 f = vec3(1.0, 0.95, 0.82) * exp(-rr * 2600.0 * (0.5 + h4)) * 1.3;
    float sx = exp(-local.y * local.y * 5000.0) * exp(-abs(local.x) * 35.0);
    float sy = exp(-local.x * local.x * 5000.0) * exp(-abs(local.y) * 35.0);
    return f + vec3(1.0, 0.9, 0.75) * (sx + sy) * 0.25;
  } else if (h3 < 0.82){
    // binary / trinary star system
    vec3 f = vec3(1.0, 0.95, 0.82) * exp(-dot(local, local) * 2600.0) * 1.2;
    vec2 o2 = vec2(0.018 + 0.02 * h2, 0.0);
    f += vec3(1.0, 0.82, 0.55) * exp(-dot(local - o2, local - o2) * 3000.0) * 0.8;
    if (h1 > 0.6){ vec2 o3 = vec2(-0.01, 0.016); f += vec3(1.0, 0.75, 0.5) * exp(-dot(local - o3, local - o3) * 3600.0) * 0.6; }
    return f;
  } else if (h3 < 0.86){
    // comet - a bright head with a streaming tail
    rr = dot(local, local);
    vec3 f = vec3(1.0, 0.95, 0.85) * exp(-rr * 4000.0) * 1.2;
    float ja = h4 * 6.28318; vec2 jd = vec2(cos(ja), sin(ja));
    float al = dot(local, jd), pe = dot(local, vec2(-jd.y, jd.x));
    float tl = exp(-max(al, 0.0) / (0.05 * szv)) * exp(-pe * pe / (0.0006 * szv * szv));
    return f + vec3(1.0, 0.85, 0.6) * tl * 0.3;
  } else if (h3 < 0.90){
    // interacting galaxies - two cores joined by a tidal bridge
    float gs = 0.11 * (0.5 + 0.6 * h1) * szv;
    vec2 o2 = vec2(0.14, 0.06) * szv;
    vec3 f = tc * (exp(-dot(local, local) / (gs * gs) * 1.5) + exp(-dot(local - o2, local - o2) / (gs * gs) * 1.5) * 0.8);
    vec2 nd = normalize(o2);
    float al = dot(local, nd), pe = dot(local, vec2(-nd.y, nd.x));
    f += tc * smoothstep(0.0, length(o2), al) * (1.0 - smoothstep(0.0, length(o2), al)) * exp(-pe * pe / (gs * gs * 0.1)) * 0.3;
    return f * br;
  } else if (h3 < 0.94){
    // Einstein ring - a thin gravitational-lens arc around a core
    float gs = 0.12 * (0.5 + 0.6 * h2) * szv;
    float r = R / gs;
    return (vec3(1.0, 0.9, 0.7) * exp(-(r - 0.9) * (r - 0.9) * 45.0) * 0.9
          + vec3(1.0, 0.95, 0.8) * exp(-r * r * 120.0) * 0.7) * br;
  } else if (h3 < 0.97){
    // Wolf-Rayet bubble - a bright thin shell
    float gs = 0.11 * (0.5 + 0.7 * h1) * szv;
    float r = R / gs;
    return tc * exp(-(r - 0.75) * (r - 0.75) * 30.0) * 0.8 * br;
  } else {
    // bipolar jet nebula - two lobes and a waist star
    float gs = 0.10 * (0.5 + 0.6 * h2) * szv;
    rr = dot(local, local) / (gs * gs);
    vec2 up = vec2(0.0, gs * 0.9);
    float l1 = exp(-dot(local - up, local - up) / (gs * gs * 0.25));
    float l2 = exp(-dot(local + up, local + up) / (gs * gs * 0.25));
    return tc * (l1 + l2) * 0.6 + vec3(1.0, 0.9, 0.7) * exp(-rr * 20.0) * 0.6;
  }
}
`
