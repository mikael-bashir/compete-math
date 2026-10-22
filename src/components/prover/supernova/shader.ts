import { DETONATION_S, SEDOV_EXPONENT, SEDOV_K, SEDOV_T0 } from './timeline';

// GLSL for the proof supernova (WebGL2). Four programs: the scene (HDR), a bright-pass, a separable blur, and the final composite
// (bloom, tone map, vignette, grain). All of them draw one full-screen triangle (see VERT).
//
// Units: p is in screen heights, centred, so the screen is 1 tall and aspect wide. Colours are linear HDR until the composite.

const f = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x));

export const VERT = `#version 300 es
void main() {
  vec2 v = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SCENE_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uT;        // seconds since the overlay opened
uniform float uQ;        // quality 0..1: octaves of noise
uniform float uSeed;     // a different sky every play
uniform float uFigure;   // 1 = the speck of a figure for scale
uniform float uScale;    // HDR range is divided by this when the target is 8-bit
out vec4 outColor;

const float T0 = ${f(DETONATION_S)};
const float PI = 3.14159265;

float sq(float x) { return x * x; }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float vnoise(vec2 p) {
  vec2 i = floor(p), fr = fract(p);
  fr = fr * fr * (3.0 - 2.0 * fr);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), fr.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), fr.x), fr.y);
}
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise(p); p = ROT * p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float ridged(vec2 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0); s += a * n * n; p = ROT * p * 2.1 + 9.3; a *= 0.5; }
  return s;
}

// a blackbody-ish ramp: black, deep red, orange, yellow, white, blue-white. x ~ temperature
vec3 heat(float x) {
  x = clamp(x, 0.0, 1.6);
  vec3 c = mix(vec3(0.0), vec3(0.45, 0.02, 0.0), smoothstep(0.0, 0.2, x));
  c = mix(c, vec3(1.0, 0.28, 0.02), smoothstep(0.15, 0.45, x));
  c = mix(c, vec3(1.0, 0.72, 0.22), smoothstep(0.4, 0.7, x));
  c = mix(c, vec3(1.0, 0.95, 0.82), smoothstep(0.65, 0.95, x));
  c = mix(c, vec3(0.72, 0.86, 1.0), smoothstep(0.95, 1.5, x));
  return c * (0.35 + 1.65 * x);
}

// a layer of stars on a jittered grid: few bright ones, many faint, a little colour, a little twinkle
vec3 stars(vec2 p, float cells, float seed, float density) {
  vec2 g = p * cells;
  vec2 id = floor(g), fr = fract(g) - 0.5;
  vec2 h = hash22(id + seed * 7.0);
  float present = step(1.0 - density, hash12(id + seed * 3.1));
  float d = length(fr - (h - 0.5) * 0.7) * (uRes.y / cells);   // distance in pixels
  float mag = 0.12 + pow(hash12(id * 1.7 + seed), 7.0) * 1.6;
  float tw = 0.82 + 0.18 * sin(uT * (1.0 + h.x * 5.0) + h.y * 6.283);
  float s = present * mag * tw * exp(-d * d / (2.0 * 1.1 * 1.1));
  vec3 tint = mix(vec3(0.62, 0.78, 1.0), vec3(1.0, 0.82, 0.62), h.x);
  return tint * s;
}

// a far galaxy: a warm core, a bluer disc, a hint of spiral arms; tilted and flattened
vec3 galaxy(vec2 p, vec2 c, float size, float ang, float squash) {
  vec2 d = p - c;
  d = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;
  d.y /= squash;
  float r2 = dot(d, d) / (size * size);
  float rr = sqrt(r2);
  float arms = 0.5 + 0.5 * sin(2.0 * atan(d.y, d.x) + 7.0 * log(rr + 0.05));
  vec3 core = vec3(1.0, 0.82, 0.58) * exp(-r2 * 7.0) * 1.4;
  vec3 disc = vec3(0.55, 0.7, 1.0) * exp(-rr * 3.2) * (0.18 + 0.4 * arms);
  return core + disc;
}

vec3 nebula(vec2 p, int oct, float lit) {
  float n = fbm(p * 1.5 + vec2(3.0, 7.0) + uSeed, oct);
  float m = fbm(p * 3.0 - vec2(5.0, 2.0) + n * 1.4, oct);
  vec3 c = mix(vec3(0.005, 0.012, 0.035), vec3(0.025, 0.09, 0.2), smoothstep(0.25, 0.8, n));
  c += vec3(0.22, 0.03, 0.10) * smoothstep(0.55, 0.9, m) * 0.4;   // a little red in the dark, like the frame it comes from
  return c * (0.35 + lit);
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
// a speck of a person, about 0.04 of the screen tall: the scale of the thing
float figure(vec2 p) {
  p = p / 0.04 + vec2(0.0, 0.5);
  float d = length(p - vec2(0.0, 0.93)) - 0.11;
  d = min(d, sdCapsule(p, vec2(0.0, 0.82), vec2(0.0, 0.46), 0.075));
  d = min(d, sdCapsule(p, vec2(0.0, 0.78), vec2(-0.24, 0.5), 0.035));
  d = min(d, sdCapsule(p, vec2(0.0, 0.78), vec2(0.24, 0.5), 0.035));
  d = min(d, sdCapsule(p, vec2(0.0, 0.46), vec2(-0.1, 0.0), 0.045));
  d = min(d, sdCapsule(p, vec2(0.0, 0.46), vec2(0.1, 0.0), 0.045));
  return d * 0.04;
}

// hot debris: three layers of particles flying out along their own rays, slowing as they go, each a short bright streak with a tail
vec3 sparks(vec2 p, float tt) {
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 acc = vec3(0.0);
  for (int L = 0; L < 3; L++) {
    float N = 70.0 + 45.0 * float(L);
    float id0 = floor(a / (2.0 * PI) * N);
    for (int k = -1; k <= 1; k++) {
      float id = id0 + float(k);
      float w = mod(id, N);
      float h1 = hash11(w * 1.37 + float(L) * 91.7 + uSeed);
      float h2 = hash11(w * 7.13 + float(L) * 13.1 + uSeed * 2.0);
      float h3 = hash11(w * 3.77 + float(L) * 5.9 + uSeed * 3.0);
      float ang = (id + 0.2 + 0.6 * h1) / N * 2.0 * PI;
      vec2 u = vec2(cos(ang), sin(ang));
      float v = 0.3 + 1.25 * h2 * h2;
      float rp = v * (1.0 - exp(-tt * (0.9 + 1.2 * h3))) * 0.62;
      vec2 d = p - rp * u;
      float along = dot(d, u);
      float across = dot(d, vec2(-u.y, u.x));
      float len = 0.004 + 0.05 * v * exp(-tt * 0.8);
      float body = along < 0.0 ? exp(along / len) : exp(-along * along / (2.0 * 0.0012 * 0.0012));
      float inten = exp(-across * across / (2.0 * 0.0009 * 0.0009 * (1.0 + h1))) * body;
      float life = exp(-tt * (0.45 + 0.9 * h1));
      float tw = 0.7 + 0.3 * sin(tt * 20.0 * h3 + h2 * 6.283);
      acc += mix(vec3(1.0, 0.5, 0.12), vec3(1.0, 0.88, 0.65), h3) * inten * life * tw * 2.6;
    }
  }
  return acc;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  int oct = int(mix(3.0, 6.0, uQ));
  float T = uT;
  float t = T - T0;                       // the age of the explosion; negative before it
  float tt = max(t, 0.0);
  float live = step(0.0, t);

  // the camera: a shake at the detonation, then a slow pull-back that lets the blast out
  float shake = exp(-tt * 3.2) * 0.014 * live;
  p += shake * (vec2(vnoise(vec2(T * 37.0, 1.0)), vnoise(vec2(T * 41.0, 9.0))) - 0.5);
  p *= 1.0 + 0.32 * smoothstep(T0, T0 + 9.0, T);

  float r = length(p);
  float a = atan(p.y, p.x);
  vec2 dir = r > 1e-5 ? p / r : vec2(1.0, 0.0);

  // ---- the blast wave: Sedov-Taylor, R ~ t^(2/5), with a ragged, fingered front
  float R = ${f(SEDOV_K)} * pow(tt + ${f(SEDOV_T0)}, ${f(SEDOV_EXPONENT)});
  float finger = fbm(dir * 2.4 + vec2(0.0, tt * 0.12) + uSeed, oct);
  float finger2 = fbm(dir * 9.0 + vec2(5.0, tt * 0.2) + uSeed, oct);
  float Rw = R * (0.86 + 0.24 * finger + 0.07 * (finger2 - 0.5));
  float edge = (r - Rw) * live + 10.0 * (1.0 - live);
  float width = 0.012 + 0.05 * R;
  float env = smoothstep(0.0, 0.03, tt) * exp(-tt * 5.5) * live;   // the flash

  // space is bent at the front: stars and gas are pulled toward it, so the front shows as a bright caustic
  vec2 pd = p - dir * (-0.04 * tanh(edge / width) * exp(-sq(edge / (3.0 * width)))) * live;

  // ---- space
  float illum = live * exp(-tt * 0.35) * (1.5 + 3.0 * exp(-r * 2.0));
  vec3 col = nebula(pd, oct, illum);
  col += stars(pd, 12.0, 1.0, 0.22) + stars(pd, 34.0, 2.0, 0.17) + stars(pd, 80.0, 3.0, 0.12);
  // the depth of it: galaxies, far behind the stars, so the blast has something to be bigger than
  col += 0.55 * (galaxy(pd, vec2(-0.62, 0.27), 0.040, 0.5, 0.45) + galaxy(pd, vec2(0.58, -0.22), 0.055, -0.7, 0.35)
               + galaxy(pd, vec2(0.37, 0.34), 0.026, 1.1, 0.6) + galaxy(pd, vec2(-0.30, -0.33), 0.034, 2.1, 0.5)
               + galaxy(pd, vec2(0.80, 0.30), 0.022, 0.2, 0.7));

  // ---- before: a lone star building, a collapse rippling inward
  float b = clamp(T / T0, 0.0, 1.0);
  float pre = 1.0 - live;
  float core = 0.004 + 0.010 * b * b;
  float pulse = 1.0 + 0.25 * sin(T * 14.0 * b) * b;
  col += pre * vec3(0.72, 0.86, 1.0) * (core * core) / (r * r + core * core * 0.6) * pulse * (1.0 + 6.0 * b * b);
  float spike = exp(-abs(p.y) * 220.0) * exp(-abs(p.x) * 5.0) + exp(-abs(p.x) * 220.0) * exp(-abs(p.y) * 5.0);
  col += pre * vec3(0.7, 0.85, 1.0) * spike * b * b * 0.6;
  float rings = 0.0;
  for (int i = 0; i < 3; i++) {
    float ph = fract(T * 0.45 + float(i) / 3.0);
    float rr = mix(0.5, 0.02, ph * ph);
    rings += exp(-sq((r - rr) / 0.004)) * ph * (1.0 - ph);
  }
  col += pre * vec3(0.3, 0.55, 1.0) * rings * 0.45 * b;

  if (t > 0.0) {
    // ---- the fireball: small and hot, it is only the first second
    float Rf = 0.04 + 0.16 * (1.0 - exp(-tt * 1.2));
    float dens = fbm(p * 5.0 / (Rf + 0.1) + vec2(tt * 0.5, -tt * 0.3), oct);
    float fb = smoothstep(Rf * (1.0 + 0.35 * (dens - 0.5)), Rf * 0.15, r);
    float hx = fb * (1.1 * exp(-tt * 1.1) + 0.2) * (0.6 + 0.8 * dens);
    col = col * (1.0 - 0.85 * fb) + heat(hx) * fb * 1.8;

    // ---- the shell: a thin ragged front, and behind it gas that glows in the colours of a real remnant:
    //      H-alpha red, [O III] teal, [S II] orange, with dark dust lanes cutting across it
    float width = 0.006 + 0.022 * R;
    float body = exp(-sq(edge / width));
    float behind = smoothstep(0.0, -0.45 * R, edge);
    vec2 q = p * 9.0;
    q += 1.8 * vec2(fbm(q * 0.5 + tt * 0.15, oct), fbm(q * 0.5 + 7.1 - tt * 0.15, oct));
    float fil = pow(ridged(q, oct), 1.6);
    float lanes = ridged(q * 0.7 + 3.0, oct);
    float band = smoothstep(-0.6 * R, 0.0, edge) * smoothstep(0.05 * R, -0.03 * R, edge);
    float hue = vnoise(p * 4.0 + tt * 0.08);
    vec3 fc = mix(vec3(1.0, 0.10, 0.06), vec3(0.10, 0.85, 0.75), smoothstep(0.35, 0.65, hue));
    fc = mix(fc, vec3(1.0, 0.45, 0.10), smoothstep(0.75, 0.95, vnoise(p * 7.0 + 5.0)));
    float decay = exp(-tt * 0.45);
    col *= 1.0 - 0.55 * behind * smoothstep(0.0, 1.2, tt);                      // the gas hides the stars behind it
    col *= 1.0 - 0.5 * smoothstep(0.55, 0.9, lanes) * band;                     // dust lanes
    col += fc * fil * band * (1.5 * decay + 0.16);                              // the filaments
    col += heat(0.25 + 0.35 * fil) * behind * 0.22 * decay;                     // hot gas between them
    vec3 frontCol = mix(vec3(1.0, 0.85, 0.55), vec3(1.0, 0.34, 0.12), smoothstep(0.0, 3.0, tt));
    float knots = 0.45 + 1.1 * vnoise(dir * 16.0 + tt * 0.3 + uSeed);                // the front is clumpy, not a wire
    col += frontCol * body * knots * (1.7 * decay + 0.3);                               // the front itself, fading from white-yellow to red
    col += vec3(1.0, 0.4, 0.1) * exp(-sq(edge / (width * 6.0))) * 0.22 * decay; // dust heated ahead of it

    // a second, faster, thinner ripple
    float R2 = 0.9 * tt;
    col += vec3(0.7, 0.85, 1.0) * exp(-sq((r - R2) / 0.005)) * exp(-tt * 1.6) * 1.2;

    // ---- debris, rays and the flare: localised, so the flash is a point of light and not a fog
    col += sparks(p, tt);
    float rays = (pow(vnoise(dir * 11.0 + 3.0 + uSeed), 6.0) * 1.0 + pow(vnoise(dir * 34.0 + 9.0 + uSeed), 5.0) * 1.5);
    col += vec3(1.0, 0.82, 0.58) * rays * exp(-r * 2.1) * smoothstep(0.0, 0.02, r) * exp(-tt * 1.5) * smoothstep(0.0, 0.05, tt);
    col += vec3(1.0, 0.93, 0.82) * env * (0.05 + 5.0 * exp(-r * 12.0));
    col += vec3(0.55, 0.75, 1.0) * env * 2.2 * exp(-abs(p.y) * 90.0) * exp(-abs(p.x) * 2.5);
    col += vec3(1.0, 0.97, 0.92) * 0.16 * exp(-tt * 9.0) * smoothstep(0.0, 0.02, tt);   // the whiteout: one, short, and not total
  }

  // ---- the figure, dark against whatever light there is, until it is not there
  if (uFigure > 0.5) {
    vec2 fp = p - vec2(0.0, 0.004 * sin(T * 1.3));
    float fig = 1.0 - smoothstep(0.0, 0.0012, figure(fp));
    float stays = 1.0 - smoothstep(0.0, 0.08, tt) * live;
    col *= 1.0 - fig * stays * smoothstep(0.0, 0.6, T);
  }

  outColor = vec4(col / uScale, 1.0);
}`;

export const BRIGHT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uThreshold;
uniform float uScale;
out vec4 outColor;
void main() {
  vec3 c = texture(uSrc, gl_FragCoord.xy / uRes).rgb * uScale;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
  outColor = vec4(c * k / uScale, 1.0);
}`;

// a 9-tap separable gaussian; uDir is one texel in the blur direction
export const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform vec2 uDir;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 st = uDir / uRes;
  vec3 s = texture(uSrc, uv).rgb * 0.2270270270;
  s += (texture(uSrc, uv + st * 1.3846153846).rgb + texture(uSrc, uv - st * 1.3846153846).rgb) * 0.3162162162;
  s += (texture(uSrc, uv + st * 3.2307692308).rgb + texture(uSrc, uv - st * 3.2307692308).rgb) * 0.0702702703;
  outColor = vec4(s, 1.0);
}`;

export const FINAL_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloomA;
uniform sampler2D uBloomB;
uniform vec2 uRes;
uniform float uT;
uniform float uAlpha;
uniform float uScale;
uniform float uFlash;
out vec4 outColor;

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 c = uv - 0.5;
  // a little chromatic aberration toward the edges, more at the flash
  vec2 ab = c * (0.0035 + 0.010 * uFlash) * dot(c, c) * 4.0;
  vec3 s = vec3(texture(uScene, uv + ab).r, texture(uScene, uv).g, texture(uScene, uv - ab).b) * uScale;
  vec3 bloom = texture(uBloomA, uv).rgb * uScale * 0.32 + texture(uBloomB, uv).rgb * uScale * 0.5;
  vec3 col = s + bloom;
  col = aces(col * 0.95);
  col = pow(col, vec3(1.0 / 2.2));
  float v = 1.0 - 0.6 * dot(c * vec2(1.15, 1.0), c * vec2(1.15, 1.0));
  col *= clamp(v, 0.0, 1.0);
  col += (hash12(gl_FragCoord.xy + fract(uT) * 91.0) - 0.5) * 0.03;   // grain, so the dark does not band
  col = max(col, 0.0);
  outColor = vec4(col * uAlpha, uAlpha);   // premultiplied: the page shows through while it fades in and out
}`;
