'use client'

import { useEffect, useRef } from "react"
import Link from "next/link"
import HeroContent from "./hero"

// ---------------------------------------------------------------------------
// The equation-film: the landing page's four stories told by ONE live GLSL
// fragment shader, scrubbed by scroll. No video, no images — every frame is
// computed on the GPU from the same equation, which is the point: on a site
// about mathematics, the film itself is mathematics.
//
// The HERO LIVES INSIDE THE FILM. The stage pins from scroll 0 with the moon
// hero rendered as its top layer; scrolling fades and lifts the hero away
// while the ink develops on the canvas beneath it — the hero IS frame one.
//
//   Chapter 1 — the arena      a universe of galaxies, every one a copy of
//                              the SAME Julia equation, zoomed far out
//   Chapter 2 — the insight    one exponential camera dolly into the home
//                              galaxy at cell (0,0) - the landing frame IS
//                              chapter 2's framing, seamless by construction.
//                              Then c is driven OUT of the Mandelbrot set and
//                              the Fatou-Julia dichotomy shatters the lace
//   Chapter 3 — the community  the Cantor-dust regime ITSELF, held: the
//                              insight dissolved into countless sparkling
//                              ring-glows — one insight becomes everyone's
//   Chapter 4 — the proof      the dust condenses into one last equation:
//                              a parametric heart of glimmering points, a
//                              black heart outlined in light around the
//                              trust copy and the Start-solving CTA. The
//                              film's only resting state - and the one
//                              place it invites the cursor: points shy
//                              away from it and ignite as it approaches
//
// Transitions are morphs with a shared element, never crossfades. While a
// story beat is on screen the shader dims a soft stage behind the copy
// (uText) and each beat carries a radial scrim — the film highlights the
// words, never fights them.
//
// Mounted ONLY after the device gate in page.tsx passes (big screen, fine
// pointer, real GPU, no reduced-motion) — phones never download this module.
// A runtime watchdog measures frame-time p95 and steps internal resolution
// down, aborting to the static page if the device still can't hold 60fps.
//
// Pinning is manual (fixed/absolute switch) — position:sticky silently never
// engages inside the root layout's overflow-hidden wrapper. Programmatic
// scrolls must use behavior:'instant' to bypass atomix's global smooth
// scroll. GLSL comments must never contain backticks (they terminate the
// template literal). Never loseContext() in cleanup (StrictMode remounts
// reuse the canvas; a lost context fails every compile with empty logs).
// ---------------------------------------------------------------------------

const DRIVER_VH = 600 // total scroll distance: hero handoff + four chapters
const HERO_SEG = 0.1 // first fraction of the driver: hero dissolves into frame one
const MAX_INTERNAL_WIDTH = 2560 // shader render width cap (device px). DPR is respected up to 2x —
// ignoring it made the star/grid chapters visibly soft on retina displays.
const QUALITY_STEPS = [1, 0.82, 0.66] // watchdog degrade ladder (internal-res multipliers)
const P95_DEGRADE_MS = 27 // step down when p95 frame time exceeds this
const P95_ABORT_MS = 45 // at the last step, give up and restore the static page

const VERT = `#version 300 es
void main(){
  vec2 v = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uProg;     // STORY progress 0..1 (the hero segment is already removed)
uniform float uTrav;     // warp travel distance - CPU-integrated, flows in real time
uniform float uVel;      // warp velocity 0..1 - eased on the CPU, never snaps
uniform float uLz;       // log(zoom) - CPU-eased toward the scroll target, so the
                         // camera lands like exponential decay and never snaps still
uniform float uUniViz;   // universe reveal - VELOCITY-gated on the CPU: the world
                         // may only materialize once the hyper travel has died
uniform float uText;     // beat-copy visibility 0..1 - carves a quiet stage for the text
uniform float uHeartAmt; // finale heart 0..1
uniform vec4  uHeart[96]; // xy = point pos, z = glow, w = size scale; CPU-animated
out vec4 outColor;

const vec3 BG    = vec3(0.043, 0.027, 0.012); // warm near-black
const vec3 HERO  = vec3(0.071, 0.090, 0.051); // #12170d - the hero backdrop
const vec3 AMBER = vec3(1.00, 0.78, 0.42);
const vec3 GOLD  = vec3(0.98, 0.62, 0.19);

float hash21(vec2 p){
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// THE equation. The whole film is this one function seen at different
// magnifications and parameter values: a universe of celestial bodies all
// drawn from it (ch1), one copy filling the frame (ch2), its Cantor-dust
// regime (ch3), and its evaporation into the final heart.
vec3 juliaCore(vec2 z, vec2 c){
  float trap = 1e9;
  float m = 56.0;
  for (int i = 0; i < 56; i++){
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(length(z) - 0.4));
    if (dot(z, z) > 16.0){ m = float(i); break; }
  }
  float edge = m / 56.0;
  float fil = exp(-trap * 9.0);
  vec3 col = vec3(0.0);
  col += GOLD * fil * 0.5;
  col += AMBER * pow(edge, 6.0) * 0.85;
  col += vec3(0.35, 0.22, 0.08) * pow(edge, 2.5) * 0.3;
  return col;
}

// One layer of the universe. No grid: each lattice site MAY hold a body
// (clumpy density - clusters and voids), and bodies wander more than half a
// cell from their site. Every pixel searches its 3x3 neighbourhood for the
// nearest body and evaluates only that one - bodies never collide (same-
// layer spacing stays above their extents) yet the layout reads as thrown,
// not placed. Body types are all the same equation: spiral galaxies (some
// edge-on Milky-Way bands), dendrite supernovae, basilica black holes with
// blazing rims, bare stars, dim ellipticals. isMain pins the canonical home
// galaxy at (0,0) and clears its neighbourhood for a clean final approach.
// The warm spectrum: gold, amber, orange, ember red - hashed per body.
vec3 warmTint(float h){
  if (h < 0.40) return vec3(1.0, 0.95, 0.80);
  if (h < 0.70) return vec3(1.0, 0.80, 0.55);
  if (h < 0.90) return vec3(1.0, 0.62, 0.30);
  return vec3(0.95, 0.42, 0.22);
}

// A proper logarithmic-spiral galaxy, still pure trig (no escape loop).
// Thin, well-defined arms (a sharp power profile, not a fat cosine), a
// dark inter-arm gap, a chain of star-forming knots strung ALONG each arm,
// an exponential disc and a bright bulge - so spirals (the commonest real
// type) read as galaxies, not pinwheels, and cost almost nothing.
float spiralArms(vec2 p, float gs, float arms, float twist){
  float r = length(p) / gs;
  if (r > 3.2) return 0.0;
  float a = atan(p.y, p.x);
  float ph = a - twist * log(r + 0.08);        // log-spiral phase
  float arm = pow(0.5 + 0.5 * cos(arms * ph), 3.2); // thin, defined arms
  // HII knots: bright patches hashed along the arm ridge
  float kh = hash21(vec2(floor(ph * arms * 1.6), floor(r * 5.0)));
  float knot = smoothstep(0.72, 1.0, kh) * arm;
  float disk = exp(-r * 1.5);                   // exponential disc
  float bulge = exp(-r * r * 9.0);
  return bulge * 0.9 + disk * (0.10 + 0.62 * arm + 0.75 * knot);
}

// The far-LOD of a universe layer: bodies smaller than ~a dozen pixels are
// warm gaussian dots - same existence, position and tint hashes as
// bodyField, so every dust grain GROWS INTO exactly the body it already
// was. No rotation, no type branches, no escape loop: at dust scale the
// full equation is sub-pixel anyway, and skipping it kills the warp
// divergence that made the deep field expensive (neighbouring pixels land
// in different cells, so every branch serializes on the GPU).
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

// Fast travel, rebuilt to the space-warp.o2b.dev model and aimed AT the
// story. Every star is a persistent body on an angular lane: born far, it
// fades in across the far half, sweeps past on true perspective (screen
// radius = impact parameter / depth) and respawns behind. Its streak is a
// genuine 3D capsule - the star stretched along its own path - projected:
// round caps, thickness AND brightness falling away toward the far end,
// because the far end IS farther away. Streak length rides on the same
// CPU-integrated velocity that advances the travel, one source of truth,
// and that velocity has a floor: the field never freezes, it coasts -
// which is what carries it alive through the handoff into chapter 1.
vec3 flyField(vec2 uv, float trav, float vel, float persist){
  float an = atan(uv.y, uv.x) / 6.28318 + 0.5;
  float r = max(length(uv), 1e-3);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float sectors = 55.0 + fi * 45.0;
    float arck = 6.28318 / sectors; // lane width in radians
    float lp = an * sectors;
    for (int j = -2; j <= 2; j++){
      float lane = floor(lp) + float(j);
      float li = mod(lane, sectors); // wrap the angular seam
      vec2 seed = vec2(li, fi * 9.7 + 3.1);
      float h1 = hash21(seed + 1.7);
      if (h1 > 0.72) continue; // empty lane
      float h2 = hash21(seed + 7.3);
      float h3 = hash21(seed + 13.1);
      float h4 = hash21(seed + 21.9);
      float rate = 0.7 + 0.6 * h3;
      float z = fract(h2 - trav * rate);        // its depth right now
      float b = 0.05 + 0.30 * h4 * h4;          // impact parameter
      float w = 0.00013 + 0.00037 * h4 * h4;    // world radius: pinpricks of light
      float head = b / max(z, 0.02);            // the star is HERE
      float tail = b / (z + vel * 0.16 * rate); // its own path this instant
      float da = lp - lane - 0.5 - (h3 - 0.5) * 0.5;
      // nearest point of the swept capsule, in true projection: thickness
      // and brightness at that point belong to ITS depth, not the head's
      float rc = clamp(r, tail, head);
      float zc = b / rc;
      // near passes swell but never balloon; the floor keeps the finest
      // grains one drawable pixel instead of aliasing out of existence
      float pw = clamp(w / zc, 0.7 / uRes.y, 0.0023);
      float dr = r - rc;
      float arcd = da * arck * rc; // true tangential distance on screen
      // tangential widths are capped inside the +-2-lane search window:
      // a gaussian clipped at the window's straight edge paints dark
      // radial spokes across the whole field
      float wCap = arck * rc * 1.15;
      float pt = min(pw, wCap);
      float g = exp(-(dr * dr / (pw * pw) + arcd * arcd / (pt * pt)));
      float lum = smoothstep(1.0, 0.5, zc)   // fades in across the far half
                * smoothstep(0.0, 0.03, z);  // blinks out slipping past the camera
      float dh = r - head;
      float arch = da * arck * head;
      float hw = pw * 5.9;
      float ht = min(hw, arck * head * 1.15);
      float halo = exp(-(dh * dh / (hw * hw) + arch * arch / (ht * ht))) * 0.05;
      vec3 tint = mix(warmTint(h4), vec3(1.0, 0.97, 0.90), (1.0 - z) * 0.55);
      col += tint * (g * (0.55 + 0.45 * h1) + halo) * lum;
    }
  }
  return col * persist;
}

// Smooth value noise (one bilinear cell) - the seed of organic structure.
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

// The cheap far field - the glimmer on every corner. Distant layers hold
// bodies too small to show structure, so instead of the full 3x3 search
// and 24-way dispatch, each pixel samples ONE cell: a tight point (a
// distant sun or galaxy core) with size, colour and brightness variety,
// occasionally a tiny edge-on streak or ring. ~5 hashes and a couple of
// exps - a fraction of bodyField's cost - yet it fills the whole frame
// with warm sparkle. Same clumpy density field, so it clusters like the
// real bodies. Fixed per layer: never morphs, nothing is destroyed.
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

// ---------------------------------------------------------------------------
// Two feature black holes: a genuine relativistic ray-march (light bent by
// the hole itself, a Doppler/redshift-tinted accretion disk), not another
// bodyField archetype. Each is its own tiny 3D scene stitched onto the 2D
// universe at a fixed world position - as the camera dollies past, its
// world-space footprint sweeps across the screen exactly like any other
// body, but what's rendered inside that footprint is a full local raymarch.
// No texture asset: the deep-space backdrop the original shot samples from
// iChannel0 is replaced by a procedural nebula (bhBackground) so the film
// stays a single self-contained shader. iMouse also doesn't exist here, so
// the camera orbit that shot exposed to the mouse is a fixed slow drift
// instead (uTime-driven, phase-offset per hole so the two don't sync).
// Everything outside a hole's footprint (rB > 3.4) bails before the raymarch
// - the expensive part only ever runs over the pixels it actually owns.
const float BH_SPEED = 3.0;   // disk rotation speed
const int   BH_STEPS_I = 12;  // disk texture layers
const float BH_STEPS = 12.0;
const float BH_SIZE = 0.3;    // event-horizon scale, in the hole's own local units

float bhHash1(float x){ return fract(sin(x) * 152754.742); }
float bhHash2(vec2 x){ return bhHash1(x.x + bhHash1(x.y)); }
float bhValue(vec2 p, float f){
  float bl = bhHash2(floor(p * f + vec2(0.0, 0.0)));
  float br = bhHash2(floor(p * f + vec2(1.0, 0.0)));
  float tl = bhHash2(floor(p * f + vec2(0.0, 1.0)));
  float tr = bhHash2(floor(p * f + vec2(1.0, 1.0)));
  vec2 fr = fract(p * f);
  fr = (3.0 - 2.0 * fr) * fr * fr;
  float b = mix(bl, br, fr.x);
  float top = mix(tl, tr, fr.x);
  return mix(b, top, fr.y);
}

// Procedural stand-in for the original shot's iChannel0 nebula texture.
vec4 bhBackground(vec3 ray){
  vec2 uv2 = ray.xy;
  if (abs(ray.x) > 0.5) uv2.x = ray.z;
  else if (abs(ray.y) > 0.5) uv2.y = ray.z;
  float brightness = bhValue(uv2 * 3.0, 100.0);
  float colorMix = bhValue(uv2 * 2.0, 20.0);
  brightness = pow(brightness, 256.0);
  brightness = clamp(brightness * 100.0, 0.0, 1.0);
  vec3 stars = brightness * mix(vec3(1.0, 0.6, 0.2), vec3(0.2, 0.6, 1.0), colorMix);
  float neb = bhValue(uv2 * 1.3, 3.0) * 0.6 + bhValue(uv2 * 2.7 + 11.3, 6.0) * 0.4;
  neb = pow(neb, 3.0);
  vec3 nebulaCol = mix(vec3(0.05, 0.02, 0.08), vec3(0.35, 0.10, 0.20), neb) * neb;
  return vec4(nebulaCol + stars, 1.0);
}

vec4 raymarchDisk(vec3 ray, vec3 zeroPos){
  vec3 position = zeroPos;
  float lengthPos = length(position.xz);
  float dist = min(1.0, lengthPos * (1.0 / BH_SIZE) * 0.5) * BH_SIZE * 0.4 * (1.0 / BH_STEPS) / abs(ray.y);

  position += dist * BH_STEPS * ray * 0.5;

  vec2 deltaPos;
  deltaPos.x = -zeroPos.z * 0.01 + zeroPos.x;
  deltaPos.y = zeroPos.x * 0.01 + zeroPos.z;
  deltaPos = normalize(deltaPos - zeroPos.xz);

  float parallel = dot(ray.xz, deltaPos);
  parallel /= sqrt(lengthPos);
  parallel *= 0.5;
  float redShift = parallel + 0.3;
  redShift *= redShift;
  redShift = clamp(redShift, 0.0, 1.0);

  float disMix = clamp((lengthPos - BH_SIZE * 2.0) * (1.0 / BH_SIZE) * 0.24, 0.0, 1.0);
  vec3 insideCol = mix(vec3(1.0, 0.8, 0.0), vec3(0.5, 0.13, 0.02) * 0.2, disMix);
  insideCol *= mix(vec3(0.4, 0.2, 0.1), vec3(1.6, 2.4, 4.0), redShift);
  insideCol *= 1.25;
  redShift += 0.12;
  redShift *= redShift;

  vec4 o = vec4(0.0);

  for (int si = 0; si < BH_STEPS_I; si++){
    float i = float(si);
    position -= dist * ray;

    float intensity = clamp(1.0 - abs((i - 0.8) * (1.0 / BH_STEPS) * 2.0), 0.0, 1.0);
    float lp2 = length(position.xz);
    float distMult = 1.0;
    distMult *= clamp((lp2 - BH_SIZE * 0.75) * (1.0 / BH_SIZE) * 1.5, 0.0, 1.0);
    distMult *= clamp((BH_SIZE * 10.0 - lp2) * (1.0 / BH_SIZE) * 0.20, 0.0, 1.0);
    distMult *= distMult;

    float u = lp2 + uTime * BH_SIZE * 0.3 + intensity * BH_SIZE * 0.2;

    vec2 xy;
    float rot = mod(uTime * BH_SPEED, 8192.0);
    xy.x = -position.z * sin(rot) + position.x * cos(rot);
    xy.y = position.x * sin(rot) + position.z * cos(rot);

    float x = abs(xy.x / xy.y);
    float angle = 0.02 * atan(x);

    const float bhF = 70.0;
    float noise = bhValue(vec2(angle, u * (1.0 / BH_SIZE) * 0.05), bhF);
    noise = noise * 0.66 + 0.33 * bhValue(vec2(angle, u * (1.0 / BH_SIZE) * 0.05), bhF * 2.0);

    float extraWidth = noise * (1.0 - clamp(i * (1.0 / BH_STEPS) * 2.0 - 1.0, 0.0, 1.0));

    float alpha = clamp(noise * (intensity + extraWidth) * ((1.0 / BH_SIZE) * 10.0 + 0.01) * dist * distMult, 0.0, 1.0);

    vec3 colr = 2.0 * mix(vec3(0.3, 0.2, 0.15) * insideCol, insideCol, min(1.0, intensity * 2.0));
    o = clamp(vec4(colr * alpha + o.rgb * (1.0 - alpha), o.a * (1.0 - alpha) + alpha), vec4(0.0), vec4(1.0));

    float lp3 = lp2 * (1.0 / BH_SIZE);
    o.rgb += redShift * (intensity * 1.0 + 0.5) * (1.0 / BH_STEPS) * 100.0 * distMult / (lp3 * lp3);
  }

  o.rgb = clamp(o.rgb - 0.005, 0.0, 1.0);
  return o;
}

void bhRotate(inout vec3 v, vec2 angle){
  v.yz = cos(angle.y) * v.yz + sin(angle.y) * vec2(-1.0, 1.0) * v.zy;
  v.xz = cos(angle.x) * v.xz + sin(angle.x) * vec2(-1.0, 1.0) * v.zx;
}

// One black hole, local to its own footprint. world/center/gs are in the
// SAME world space the galaxies live in - gs sets how big the hole reads
// against them. seed staggers each instance's camera drift and disk noise.
vec4 blackHoleShot(vec2 world, vec2 center, float gs, float seed){
  vec2 local = (world - center) / gs;
  float rB = length(local);
  if (rB > 3.4) return vec4(0.0);

  vec3 ray = normalize(vec3(local * 0.15, 1.0));
  vec3 pos = vec3(0.0, 0.05, -6.0);
  vec2 angle = vec2(uTime * 0.025 + seed * 6.2832, 0.62 + 0.1 * sin(seed * 4.0));
  float dist0 = length(pos);
  bhRotate(pos, angle);
  angle.xy -= min(0.3 / dist0, 3.14159) * vec2(1.0, 0.5);
  bhRotate(ray, angle);

  vec4 col = vec4(0.0);
  vec4 glow = vec4(0.0);
  vec4 outCol = vec4(100.0);

  for (int disks = 0; disks < 20; disks++){
    for (int h = 0; h < 6; h++){
      float dotpos = dot(pos, pos);
      float invDist = inversesqrt(dotpos);
      float centDist = dotpos * invDist;
      float stepDist = 0.92 * abs(pos.y / ray.y);
      float farLimit = centDist * 0.5;
      float closeLimit = centDist * 0.1 + 0.05 * centDist * centDist * (1.0 / BH_SIZE);
      stepDist = min(stepDist, min(farLimit, closeLimit));

      float invDistSqr = invDist * invDist;
      float bendForce = stepDist * invDistSqr * BH_SIZE * 0.625;
      ray = normalize(ray - (bendForce * invDist) * pos);
      pos += stepDist * ray;

      glow += vec4(1.2, 1.1, 1.0, 1.0) * (0.01 * stepDist * invDistSqr * invDistSqr * clamp(centDist * 2.0 - 1.2, 0.0, 1.0));
    }

    float dist2 = length(pos);

    if (dist2 < BH_SIZE * 0.1){
      outCol = vec4(col.rgb * col.a + glow.rgb * (1.0 - col.a), 1.0);
      break;
    } else if (dist2 > BH_SIZE * 1000.0){
      vec4 bg = bhBackground(ray);
      outCol = vec4(col.rgb * col.a + bg.rgb * (1.0 - col.a) + glow.rgb * (1.0 - col.a), 1.0);
      break;
    } else if (abs(pos.y) <= BH_SIZE * 0.002){
      vec4 diskCol = raymarchDisk(ray, pos);
      pos.y = 0.0;
      pos += abs(BH_SIZE * 0.001 / ray.y) * ray;
      col = vec4(diskCol.rgb * (1.0 - col.a) + col.rgb, col.a + diskCol.a * (1.0 - col.a));
    }
  }

  if (outCol.r == 100.0) outCol = vec4(col.rgb + glow.rgb * (col.a + glow.a), 1.0);

  outCol.rgb = pow(max(outCol.rgb, 0.0), vec3(0.6));

  float edge = 1.0 - smoothstep(2.6, 3.4, rB); // soft footprint, no hard disc
  return vec4(outCol.rgb, edge);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float P = uProg;

  // Story parameters - the one c's journey through the theorem.
  float drive  = clamp((P - 0.32) / 0.20, 0.0, 1.0);
  float reveal = smoothstep(0.50, 0.62, P); // lace shatters into the dust regime...
  float drift  = smoothstep(0.61, 0.82, P); // ...which never sits still...
  float gone   = smoothstep(0.81, 0.89, P); // ...until it evaporates into black
  float life   = 1.0 - smoothstep(0.84, 0.91, P); // the field's overall presence

  // ONE camera for the whole approach: warp tunnel, arrival and dolly all
  // share a single CENTRED axis - the home galaxy at cell (0,0) sits dead
  // centre from the universe's first frame to the close-up. The camera
  // NEVER stands still: a slow 12x approach begins the moment the
  // universe starts entering (it resolves while already nearing, and the
  // long quiet glide is what sells the vastness), then the dive covers
  // the remaining 140x. By construction the landing frame IS chapter 2's
  // framing - the join cannot show.
  const float S_T = 0.22;    // home galaxy scale in world units
  const float Z0  = 0.002;   // TRUE deep space - 50x farther than any body
                             // resolves; the universe is born as dust
  const float Z1  = 3.3670;  // = 1/(1.35*S_T): the close-up framing
  // The zoom curve (approach 0.17-0.32, dive 0.32-0.42) lives on the CPU,
  // where it is EASED toward, not scrubbed: uLz already carries the
  // exponential-decay landing.
  float lz = uLz;
  float zp = (lz - log(Z0)) / (log(Z1) - log(Z0)); // normalized dolly progress
  float zoomP = exp(lz);
  vec2 world = uv / zoomP;

  // The home galaxy's c: the base orbit plus the whole dissolution journey.
  vec2 cHome = vec2(-0.745, 0.186)
             + 0.045 * vec2(cos(0.19 * t + drive * 2.6), sin(0.15 * t + drive * 2.1))
             * (1.0 - 0.5 * drive)
             + reveal * reveal * vec2(-0.50, 0.19)
             + drift * vec2(-0.20, 0.08)
             + gone * vec2(-0.55, 0.22);

  // Arrival: the universe may only develop once the travel has died -
  // the gate lives on the CPU, tied to the real warp velocity, so a
  // parked mid-burst frame is stars on black, never a materializing
  // world behind flying stars.
  float uniViz = uUniViz;

  vec3 col = vec3(0.0);
  if (life > 0.004){
    // Honest LOD for the 1700x total zoom: pixels per world unit. Each
    // layer renders at whatever detail its on-screen cell size has earned
    // (nothing -> gaussian dust -> the full equation) - from this deep a
    // departure the universe is born as single-pixel dust among the
    // deposited traffic, and the dolly grows it into galaxies. Nothing
    // ever fades in as an already-formed shape.
    float lodK = zoomP * uRes.y;
    // ONE cosmic-web sample per pixel, shared by every layer - so a dense
    // supercluster is dense at ALL depths at once (galaxies piled through
    // the whole field) and a void is empty through and through. The camera
    // flies through these as it dives. Coherent AND cheap: one noise lookup.
    float cf = webDensity(world);
    // near layer (carries the home galaxy)
    // close range runs thinner than the deep field - the eye needs room
    vec3 field = layerField(world, t, cHome, reveal, zp, true, 0.75, lodK, cf) * uniViz;
    // NO dynamic manager, nothing created or destroyed mid-flight: a fixed
    // stack, always on. Two near background layers get the full rich
    // ecosystem (detailed galaxies you can read); four far layers get the
    // cheap glimmer (distant sparkle on every corner) - the same look as
    // dumping seven full layers, at a fraction of the cost. Only the
    // global arrival gate (uniViz) and the final clear (stackFade) touch
    // them, so a body never morphs and never pops.
    float stackFade = 1.0 - smoothstep(0.74, 0.90, zp);
    if (stackFade > 0.004){
      float a = stackFade * uniViz;
      // ONE full-ecosystem layer of hero galaxies (the costly 24-way
      // dispatch), then FIVE cheap glimmer layers - the glimmer carries the
      // density and the dramatic clustering, so the field looks packed for
      // a fraction of the cost of stacking full layers.
      field += bodyField(world * 0.70 + vec2(7.3,   4.1), t, cHome, reveal, zp, false, 1.0, cf) * 0.90 * a;
      field += glimmerField(world * 1.45 + vec2(-13.7, 9.2), 0.75, cf) * 0.82 * a;
      field += glimmerField(world * 2.55 + vec2(23.1,-17.9), 0.80, cf) * 0.72 * a;
      field += glimmerField(world * 4.20 + vec2(-5.1, 31.7), 0.85, cf) * 0.62 * a;
      field += glimmerField(world * 6.80 + vec2(41.3, 12.4), 0.90, cf) * 0.52 * a;
      field += glimmerField(world * 10.5 + vec2(-27.9,-8.3), 0.90, cf) * 0.44 * a;
    }

    // copy-protection ring: only once the close-up has landed, released by
    // the shatter; floored so the stage stays translucent, never a hole
    float ring = mix(0.45, 1.0, smoothstep(0.26, 0.48, length(uv * vec2(1.0, 1.3))));
    float maskOn = smoothstep(0.42, 0.48, P);
    float mask = mix(1.0, max(ring, reveal), maskOn);
    col += life * (BG * 0.9 + mask * field);

    // sparse star specks between the bodies, universe view only - LOD-gated
    // like everything else so they resolve instead of fading in; they ride
    // the whole dive with the depth stack, clearing only at the end
    float uvw = 1.0 - smoothstep(0.62, 0.78, P);
    if (uvw > 0.004){
      vec2 sp = world * 24.0;
      float sh = hash21(floor(sp));
      if (sh > 0.98){
        vec2 sc = vec2(0.2) + 0.6 * vec2(fract(sh * 13.7), fract(sh * 7.31));
        vec2 sd = fract(sp) - sc;
        col += warmTint(fract(sh * 9.7)) * exp(-dot(sd, sd) * 90.0) * 0.35 * uvw
             * smoothstep(2.5, 9.0, lodK / 24.0)
             * (0.6 + 0.4 * sin(t * 1.5 + sh * 40.0));
      }
      // ultra-distant glimmer: a finer, denser dust of barely-there dots
      vec2 sp2 = world * 57.0 + 31.7;
      float sh2 = hash21(floor(sp2));
      if (sh2 > 0.972){
        vec2 sc2 = vec2(0.25) + 0.5 * vec2(fract(sh2 * 17.3), fract(sh2 * 5.9));
        vec2 sd2 = fract(sp2) - sc2;
        col += warmTint(fract(sh2 * 6.3)) * exp(-dot(sd2, sd2) * 160.0) * 0.16 * uvw * uniViz
             * smoothstep(2.5, 9.0, lodK / 57.0)
             * (0.5 + 0.5 * sin(t * 2.3 + sh2 * 60.0));
      }
    }

    // Two feature black holes, fixed in the same world the galaxies live
    // in - their screen footprint sweeps past exactly like any other body
    // as the camera dollies by, but each is its own full lensed raymarch.
    vec4 bh1 = blackHoleShot(world, vec2(1.5, -0.9), 0.55, 0.15);
    if (bh1.a > 0.0) col = mix(col, bh1.rgb, bh1.a * life * uniViz);
    vec4 bh2 = blackHoleShot(world, vec2(-1.9, 1.1), 0.65, 0.63);
    if (bh2.a > 0.0) col = mix(col, bh2.rgb, bh2.a * life * uniViz);
  }

  // The deposited stars BELONG to the universe: from the halt onward they
  // are world-locked - they ride exactly the same zoom as every galaxy,
  // so the traffic that flew past IS the starfield chapter 1 opens on,
  // and the dolly carries it out of frame like everything else it passes.
  float persist = 1.0 - smoothstep(0.30, 0.40, P);
  if (persist > 0.004 && P > 0.06){
    col += flyField(uv * (Z0 / zoomP), uTrav, uVel, persist);
  }

  // The dive: the hero art peels away, the camera pushes through its green
  // backdrop, the green deepens into space, and the universe fades in
  // already zooming - one continuous plunge from page to cosmos.
  float dive = smoothstep(0.07, 0.16, P); // green holds until the zoom has finished
  vec3 back = HERO * (1.0 - 0.93 * dive);
  col = mix(back, col, smoothstep(0.10, 0.16, P)); // the warp punches through the darkening sky

  // The finale heart: near-pixel points, CPU-animated, GPU-splatted.
  if (uHeartAmt > 0.004){
    for (int i = 0; i < 96; i++){
      vec2 d = uv - uHeart[i].xy;
      float dd = dot(d, d);
      float g = exp(-dd * 400000.0 * uHeart[i].w) * 1.5 + 0.02 / (1.0 + dd * 30000.0);
      vec3 pc = mix(AMBER, vec3(1.0, 0.93, 0.74), hash21(vec2(float(i), 91.7)));
      col += pc * g * uHeart[i].z;
    }
  }

  // The text stage: a gentle dim behind visible copy - subtle by design.
  float dTS = length((uv - vec2(0.0, -0.02)) * vec2(1.0, 1.4));
  col *= 1.0 - uText * 0.22 * (1.0 - smoothstep(0.2, 0.72, dTS));

  float vig = 1.0 - 0.45 * smoothstep(0.45, 1.1, length(uv));
  col *= vig;
  col += (hash21(gl_FragCoord.xy + fract(t) * 7.0) - 0.5) * 0.03; // grain
  outColor = vec4(col, 1.0);
}`

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

const CHAPTER_LABELS = ["compete", "insight", "community", "trust"] as const

type Beat = {
  in: number
  peak: number
  hold: number // full-opacity plateau: the copy RESTS from peak to here
  out: number // > 1.5 means the beat holds to the end of the film (finale)
  kicker: string
  title: React.ReactNode
  body: React.ReactNode
  lean?: string
  cta?: boolean // render the Start-solving call to action (finale beat)
}

// The four stories — same copy as the static sections this film replaces.
// Timings are in STORY progress (post-hero).
const BEATS: Beat[] = [
  {
    in: 0.13, peak: 0.17, hold: 0.27, out: 0.315,
    kicker: "// competition",
    title: (
      <>Learn through <span className="italic">Competition</span></>
    ),
    body: "Work through a bottomless pool of fresh problems, climb the global leaderboards, earn exclusive badges, and prove your skills in officially hosted competitions. Every solve pushes you up the ranks.",
  },
  {
    in: 0.43, peak: 0.465, hold: 0.545, out: 0.585,
    kicker: "// practice",
    title: (
      <>Never stay <span className="italic">stuck</span></>
    ),
    body: (
      <>
        After a few honest attempts, every practice problem reveals its{" "}
        <span className="text-amber-200/90">key insight</span> — backed by a{" "}
        <span className="text-amber-200/90">machine-checked formal proof in Lean&nbsp;4</span>{" "}
        you can open, copy, and verify yourself. No hand-waving, no &ldquo;trust me.&rdquo;
      </>
    ),
    lean: `theorem am_gm (a b : ℝ) :\n    a * b ≤ ((a + b) / 2) ^ 2 := by\n  nlinarith [sq_nonneg (a - b)]`,
  },
  {
    in: 0.63, peak: 0.665, hold: 0.755, out: 0.80,
    kicker: "// community",
    title: "Grow with the Community",
    body: (
      <>
        Submit your own challenges, and on every community problem join an open{" "}
        <span className="text-amber-200/90">discussion</span> to contest an answer, suggest a
        sharper solution, and compare methods with solvers who see the problem differently.
      </>
    ),
  },
  {
    in: 0.88, peak: 0.93, hold: 2, out: 2, cta: true,
    kicker: "// quality",
    title: (
      <>Quality you can <span className="italic">trust</span></>
    ),
    body: (
      <>
        Nothing goes live unchecked. Every question is reviewed for quality and correctness
        before it reaches you, and its answer is enforced by a formal Lean&nbsp;4 certificate —
        so the problems you train on are the real deal.
      </>
    ),
  },
]

export default function EquationFilm({ onAbort }: { onAbort: () => void }) {
  const driverRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const beatRefs = useRef<Array<HTMLDivElement | null>>([])
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    const driver = driverRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    const hero = heroRef.current
    if (!driver || !stage || !canvas || !hero) return

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    })
    if (!gl || gl.isContextLost()) { onAbort(); return }

    function compile(type: number, src: string): WebGLShader | null {
      const s = gl!.createShader(type)
      if (!s) return null
      gl!.shaderSource(s, src)
      gl!.compileShader(s)
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        console.error("[equation-film] shader compile failed:", gl!.getShaderInfoLog(s))
        return null
      }
      return s
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) { onAbort(); return }
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[equation-film] link failed:", gl.getProgramInfoLog(prog))
      onAbort()
      return
    }
    gl.useProgram(prog)
    gl.bindVertexArray(gl.createVertexArray()) // empty VAO; the vertex shader is bufferless
    const uRes = gl.getUniformLocation(prog, "uRes")
    const uTime = gl.getUniformLocation(prog, "uTime")
    const uProg = gl.getUniformLocation(prog, "uProg")
    const uTrav = gl.getUniformLocation(prog, "uTrav")
    const uVel = gl.getUniformLocation(prog, "uVel")
    const uLz = gl.getUniformLocation(prog, "uLz")
    const uUniViz = gl.getUniformLocation(prog, "uUniViz")
    const uText = gl.getUniformLocation(prog, "uText")
    const uHeartAmt = gl.getUniformLocation(prog, "uHeartAmt")
    const uHeart = gl.getUniformLocation(prog, "uHeart[0]")

    // ---- state ----
    let qualityStep = 0
    let cssW = 0, cssH = 0, glW = 0, glH = 0
    let current = 0, target = 0 // raw driver progress (hero segment included)
    let rafId = 0
    let visible = false
    let disposed = false
    let navHover = false
    let textAmt = 0 // current beat-copy visibility, fed to uText
    let mouseX = 1e5, mouseY = 1e5 // css px; far offscreen until the first move
    let smoothMX = 1e5, smoothMY = 1e5 // lerped for trailing softness
    let mouseAmt = 0

    // The finale heart: 40 points on the classic parametric heart curve,
    // animated entirely on the CPU each frame (formation from scattered dust,
    // idle drift, cursor repulsion + ignition) and splatted by the GPU.
    const N_HEART = 96 // near-pixel points need numbers to read as a curve
    const heartBase = new Float32Array(N_HEART * 2) // UNIT curve; aspect-scaled per frame
    const heartScatter = new Float32Array(N_HEART * 2)
    const heartH1 = new Float32Array(N_HEART)
    const heartH2 = new Float32Array(N_HEART)
    for (let i = 0; i < N_HEART; i++) {
      const th = ((i + 0.5) / N_HEART) * Math.PI * 2
      heartBase[i * 2] = 0.16 * Math.pow(Math.sin(th), 3)
      heartBase[i * 2 + 1] = 0.013 * (13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th))
      const s1 = Math.sin(i * 127.1 + 311.7) * 43758.5453
      const s2 = Math.sin(i * 269.5 + 183.3) * 28001.8384
      heartH1[i] = s1 - Math.floor(s1)
      heartH2[i] = s2 - Math.floor(s2)
      heartScatter[i * 2] = (heartH1[i] - 0.5) * 1.8
      heartScatter[i * 2 + 1] = (heartH2[i] - 0.5) * 1.1
    }
    const heartData = new Float32Array(N_HEART * 4) // xy pos, z glow, w size

    function animateHeart(amt: number, tSec: number) {
      const muX = (smoothMX - 0.5 * cssW) / cssH
      const muY = (0.5 * cssH - smoothMY) / cssH
      // Aspect-adaptive: full size on wide screens, shrinking on narrow ones
      // so the lobes never clip the viewport edges.
      const aspect = cssW / cssH
      const scale = 2.6 * Math.min(1, (0.5 * aspect - 0.05) / 0.46)
      for (let i = 0; i < N_HEART; i++) {
        const h1 = heartH1[i], h2 = heartH2[i]
        const form = clamp01((amt - h1 * 0.5) / 0.5)
        const f = form * form * (3 - 2 * form)
        const bx = heartBase[i * 2] * scale
        const by = heartBase[i * 2 + 1] * scale + 0.03
        let px = heartScatter[i * 2] + (bx - heartScatter[i * 2]) * f
        let py = heartScatter[i * 2 + 1] + (by - heartScatter[i * 2 + 1]) * f
        px += 0.006 * Math.sin(tSec * (0.5 + h1) + h2 * 40)
        py += 0.006 * Math.cos(tSec * (0.4 + h2) + h1 * 40)
        const ax = px - muX, ay = py - muY
        const md2 = ax * ax + ay * ay
        const rep = 0.05 * Math.exp(-md2 * 55) * mouseAmt
        const inv = 1 / Math.max(Math.sqrt(md2), 1e-3)
        px += ax * inv * rep
        py += ay * inv * rep
        const excite = 1 + 1.7 * Math.exp(-md2 * 40) * mouseAmt
        const tw = 0.55 + 0.45 * Math.sin(tSec * (0.8 + 1.4 * h1) + h2 * 6.28318)
        heartData[i * 4] = px
        heartData[i * 4 + 1] = py
        heartData[i * 4 + 2] = 0.85 * tw * excite * amt
        heartData[i * 4 + 3] = 0.7 + 0.7 * h2 // per-point size variety
      }
    }
    let immersed = false
    let activeChapter = -1
    const started = performance.now()

    const story = (raw: number) => clamp01((raw - HERO_SEG) / (1 - HERO_SEG))

    function resize() {
      cssW = window.innerWidth
      cssH = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const scale = (Math.min(cssW * dpr, MAX_INTERNAL_WIDTH) / cssW) * QUALITY_STEPS[qualityStep]
      glW = Math.max(2, Math.round(cssW * scale))
      glH = Math.max(2, Math.round(cssH * scale))
      canvas!.width = glW
      canvas!.height = glH
      canvas!.style.width = cssW + "px"
      canvas!.style.height = cssH + "px"
      gl!.viewport(0, 0, glW, glH)
    }

    function progress() {
      const rect = driver!.getBoundingClientRect()
      const total = rect.height - cssH
      return total <= 0 ? 0 : clamp01(-rect.top / total)
    }

    // Manual pin — see file header for why this is not position:sticky.
    function updatePin() {
      const rect = driver!.getBoundingClientRect()
      const maxScroll = Math.max(0, rect.height - cssH)
      if (rect.top > 0) {
        stage!.style.position = "absolute"; stage!.style.top = "0px"
      } else if (-rect.top < maxScroll) {
        stage!.style.position = "fixed"; stage!.style.top = "0px"
      } else {
        stage!.style.position = "absolute"; stage!.style.top = `${maxScroll}px`
      }
    }

    // ---- the motion engine (o2b model): scroll position sets TARGETS,
    // time does the moving. The warp velocity eases toward its throttle
    // and, past the deceleration, decays exponentially to a TRUE
    // standstill - resting particles must not move while the scrubbed
    // universe holds. The camera's log-zoom eases toward its scroll
    // target the same way: the landing on the home galaxy is exponential
    // decay, and after any scroll stops the camera is still gliding -
    // ever slower, never a snap.
    let warpVel = 0
    let warpTrav = 0
    let lzS: number | null = null // smoothed log(zoom)
    const LZ0 = Math.log(0.002), LZM = Math.log(0.024), LZ1 = Math.log(3.3670)
    function warpThrottle(pStory: number): number {
      return sstep(0.09, 0.14, pStory) * (1 - sstep(0.17, 0.24, pStory))
    }
    function lzTarget(pStory: number): number {
      const za = sstep(0.17, 0.32, pStory) // the approach - long and gentle
      const zd = sstep(0.32, 0.42, pStory) // the dive - the plunge home
      const a = LZ0 + (LZM - LZ0) * za
      return a + (LZ1 - a) * zd
    }
    function warpStep(pStory: number, dt: number) {
      warpVel += (warpThrottle(pStory) - warpVel) * Math.min(1, dt * 2.8)
      warpTrav += dt * warpVel * 1.9
      if (lzS === null) lzS = lzTarget(pStory) // first frame (and ?jump) snaps
      else lzS += (lzTarget(pStory) - lzS) * (1 - Math.exp(-dt * 1.4))
    }
    // The universe may only materialize once the travel has DIED: its
    // reveal is gated by the real (eased) warp velocity, not by scroll
    // position alone - park mid-burst and you hold on stars over black.
    function uniVizNow(pStory: number): number {
      return sstep(0.16, 0.24, pStory) * (1 - sstep(0.10, 0.30, warpVel))
    }

    function draw(pStory: number, tSec: number) {
      gl!.uniform2f(uRes, glW, glH)
      gl!.uniform1f(uTime, tSec)
      gl!.uniform1f(uProg, pStory)
      gl!.uniform1f(uTrav, warpTrav)
      gl!.uniform1f(uVel, warpVel)
      if (lzS === null) lzS = lzTarget(pStory) // warm frame renders pre-tick
      gl!.uniform1f(uLz, lzS)
      gl!.uniform1f(uUniViz, uniVizNow(pStory))
      gl!.uniform1f(uText, textAmt)
      const heartAmt = sstep(0.86, 0.97, pStory)
      gl!.uniform1f(uHeartAmt, heartAmt)
      if (heartAmt > 0.004) {
        animateHeart(heartAmt, tSec)
        gl!.uniform4fv(uHeart, heartData)
      }
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    }

    // The launch. The camera flies INTO the hero's green sky: the art zooms
    // hard (accelerating, origin up toward the sky) while holding opacity
    // until deep in the zoom, so the green fully swallows the frame before
    // space begins - a rocket departure, not a crossfade.
    // The launch is a MICROSCOPIC straight-ahead push. Pixel-scanning the
    // art found its flattest dark-green patch nearly dead centre (50%,
    // ~70% - measured RGB 20,25,15, a whisker off the shader's backdrop,
    // with flat sky spanning ~40-60% x 66-74%), so the camera flies
    // straight in with only a whisper of downward tilt - the same axis
    // the warp and the dolly continue on. The PROFILE is ignition, not a
    // constant climb: raising the log-zoom to the 2.4th power holds the
    // first moments to a near-still drift (engines lit, nothing moving
    // yet), then throws the camera - by the time the fade may begin the
    // frame is deep inside the flat green and still accelerating, so the
    // hand-off into the hyper travel reads as one continuous burn. A
    // bitmap has no zoom limit when the target is flat colour.
    hero.style.transformOrigin = "50% 71%"
    function updateHero(raw: number) {
      const z = sstep(0.0, 0.15, raw)
      const a = 1 - sstep(0.13, 0.165, raw)
      hero!.style.opacity = String(a)
      // Two-part throttle so it NEVER looks frozen: a gentle linear drift
      // (0.16*z) moves the frame from the very first pixel, plus the
      // z^28 detonation (0.84 weight) that still slams four orders of
      // magnitude at the end. Both sum to 1 at z=1, so the 60000x peak
      // and its explosive speed are unchanged - only the dead-still
      // opening is gone.
      const f = 0.16 * z + 0.84 * Math.pow(z, 28.0)
      hero!.style.transform = `scale(${Math.exp(f * Math.log(60000))})`
      hero!.style.pointerEvents = a > 0.5 ? "auto" : "none"
    }

    function updateOverlays(pStory: number) {
      let maxA = 0
      for (const el of beatRefs.current) {
        if (!el) continue
        const bIn = parseFloat(el.dataset.in || "0")
        const bPeak = parseFloat(el.dataset.peak || "0")
        const bHold = parseFloat(el.dataset.hold || el.dataset.peak || "0")
        const bOut = parseFloat(el.dataset.out || "1")
        let a = 0
        if (pStory >= bIn && pStory <= bOut) {
          a = pStory < bPeak ? (pStory - bIn) / Math.max(1e-4, bPeak - bIn)
            : bOut > 1.5 ? 1 // finale: holds to the end of the film
            : pStory < bHold ? 1 // the plateau: copy RESTS at full opacity
            : 1 - (pStory - bHold) / Math.max(1e-4, bOut - bHold)
        }
        a = clamp01(a)
        maxA = Math.max(maxA, a)
        el.style.opacity = String(a)
        el.style.transform = `translateY(${(1 - a) * 16}px)`
        el.style.pointerEvents = a > 0.5 ? "auto" : "none" // the finale CTA must be clickable
      }
      textAmt = maxA // the shader dims its field behind visible copy
      const ch = pStory < 0.37 ? 0 : pStory < 0.60 ? 1 : pStory < 0.85 ? 2 : 3
      if (ch !== activeChapter) {
        activeChapter = ch
        labelRefs.current.forEach((el, i) => {
          if (el) el.style.opacity = i === ch ? "0.95" : "0.4"
        })
      }
    }

    function updateImmersion(pinned: boolean, pStory: number) {
      const want = pinned && pStory > 0.01 && pStory < 0.985 && !navHover
      if (want !== immersed) {
        immersed = want
        if (want) document.body.setAttribute("data-film-immersed", "1")
        else document.body.removeAttribute("data-film-immersed")
      }
    }

    // ---- watchdog: judge p95 frame time, degrade, abort if hopeless ----
    const dts: number[] = []
    let lastFrameAt = 0
    function watchdog(now: number) {
      if (lastFrameAt > 0) dts.push(now - lastFrameAt)
      lastFrameAt = now
      if (dts.length < 110) return
      const sorted = [...dts].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)]
      dts.length = 0
      if (p95 > P95_DEGRADE_MS && qualityStep < QUALITY_STEPS.length - 1) {
        qualityStep++
        resize()
        console.info(`[equation-film] p95 ${p95.toFixed(1)}ms — degrading to ${QUALITY_STEPS[qualityStep]}x`)
      } else if (p95 > P95_ABORT_MS && qualityStep === QUALITY_STEPS.length - 1) {
        console.warn(`[equation-film] p95 ${p95.toFixed(1)}ms at minimum quality — aborting to static page`)
        cleanup()
        onAbort()
      }
    }

    // ---- the committed launch: one downward gesture past the threshold
    // hands the scroll to an autopilot that rides ignition -> hyperspace
    // at one cinematic pace, then returns control with the stars already
    // streaming (the warp engine is time-driven, so pausing there still
    // flies). A firm upward scroll is the escape hatch. Disabled under
    // the ?jump dev contract so harnesses keep full authority.
    const TAKEOFF_START = 0.02, TAKEOFF_END = 0.23, TAKEOFF_SECS = 1.5
    const devDriven = new URLSearchParams(window.location.search).get("jump") !== null
    let autoT = -1 // <0 idle, 0..1 riding
    let lastRawSeen = -1
    let upEscape = 0
    function takeoffStep(dt: number) {
      const rawNow = progress()
      if (lastRawSeen < 0) lastRawSeen = rawNow // arm AFTER any ?jump landing
      if (!devDriven && autoT < 0 &&
          lastRawSeen < TAKEOFF_START && rawNow >= TAKEOFF_START && rawNow < TAKEOFF_END) {
        autoT = 0; upEscape = 0
      }
      lastRawSeen = rawNow
      if (autoT >= 0) {
        autoT = Math.min(1, autoT + dt / TAKEOFF_SECS)
        const e = autoT * autoT * (3 - 2 * autoT)
        const r = TAKEOFF_START + (TAKEOFF_END - TAKEOFF_START) * e
        const rect = driver!.getBoundingClientRect()
        const driverTop = window.scrollY + rect.top
        window.scrollTo({ top: driverTop + r * (rect.height - cssH), left: 0, behavior: "instant" })
        if (autoT >= 1) autoT = -1
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (autoT >= 0 && e.deltaY < 0) {
        upEscape += -e.deltaY
        if (upEscape > 260) autoT = -1 // the rider wants out - let go
      }
    }
    window.addEventListener("wheel", onWheel, { passive: true })

    let lastTickAt = 0
    function tick(now: number) {
      if (disposed) return
      const dt = lastTickAt > 0 ? Math.min(0.05, (now - lastTickAt) / 1000) : 0.016
      lastTickAt = now
      takeoffStep(dt) // may drive the scroll - must precede progress()
      target = progress()
      current = Math.abs(target - current) < 0.0004 ? target : lerp(current, target, 0.12)
      updatePin()
      const rect = driver!.getBoundingClientRect()
      const pinned = rect.top <= 0 && -rect.top < rect.height - cssH
      const pStory = story(current)
      warpStep(pStory, dt)
      smoothMX = lerp(smoothMX, mouseX, 0.1)
      smoothMY = lerp(smoothMY, mouseY, 0.1)
      updateOverlays(pStory) // before draw: textAmt feeds this frame's uText
      draw(pStory, (now - started) / 1000)
      updateHero(current)
      updateImmersion(pinned, pStory)
      watchdog(now)
      rafId = requestAnimationFrame(tick)
    }

    // Render only while the film is anywhere near the viewport.
    const io = new IntersectionObserver((entries) => {
      const nowVisible = entries[0].isIntersecting
      if (nowVisible && !visible) {
        visible = true
        lastFrameAt = 0
        rafId = requestAnimationFrame(tick)
      } else if (!nowVisible && visible) {
        visible = false
        cancelAnimationFrame(rafId)
        updateImmersion(false, story(current))
      }
    }, { rootMargin: "25%" })
    io.observe(driver)

    // The film ignores the cursor while scrolling (nobody mouses mid-film) —
    // EXCEPT at the resting finale, where the heart's points respond to it.
    // The listener also drives the top-edge navbar reveal.
    const onMouse = (e: MouseEvent) => {
      navHover = e.clientY < 90
      mouseX = e.clientX
      mouseY = e.clientY
      if (mouseAmt === 0) { smoothMX = e.clientX; smoothMY = e.clientY }
      mouseAmt = 1
    }
    window.addEventListener("mousemove", onMouse, { passive: true })

    const onResize = () => { resize(); if (!visible) { updatePin(); draw(story(current), (performance.now() - started) / 1000) } }
    window.addEventListener("resize", onResize)

    resize()
    updatePin()

    // Dev contract: ?jump=<scrollY> lands pre-scrolled and settled.
    // behavior:'instant' bypasses atomix's global scroll-behavior:smooth.
    const jump = new URLSearchParams(window.location.search).get("jump")
    if (jump !== null) {
      history.scrollRestoration = "manual"
      window.scrollTo({ top: Number(jump) || 0, left: 0, behavior: "instant" })
      current = target = progress()
      updatePin()
    }

    updateOverlays(story(current))
    draw(story(current), 0) // warm frame — first scroll never shows an empty canvas
    updateHero(current)

    ;(window as unknown as { __ready?: boolean }).__ready = true
    ;(window as unknown as { __filmState?: () => object }).__filmState = () => ({
      raw: current, story: story(current), quality: QUALITY_STEPS[qualityStep], res: [glW, glH], visible,
      warpVel, warpTrav, lz: lzS,
    })

    function cleanup() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(rafId)
      io.disconnect()
      window.removeEventListener("mousemove", onMouse)
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("resize", onResize)
      document.body.removeAttribute("data-film-immersed")
      delete (window as unknown as { __filmState?: unknown }).__filmState
      // Deliberately NOT losing the GL context here — see file header.
    }
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // #12170d = the hero's backdrop — the pre-pin peek and shader frame one
  // both continue it, so hero -> film is one unbroken surface.
  return (
    <div ref={driverRef} style={{ height: `${DRIVER_VH}vh` }} className="relative bg-[#12170d]">
      <div ref={stageRef} className="absolute top-0 left-0 right-0 h-screen w-full overflow-hidden bg-[#12170d]">
        <canvas ref={canvasRef} className="absolute inset-0" />

        {BEATS.map((b, i) => (
          <div
            key={i}
            ref={(el) => { beatRefs.current[i] = el }}
            data-in={b.in}
            data-peak={b.peak}
            data-hold={b.hold}
            data-out={b.out}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center opacity-0 pointer-events-none"
          >
            {/* Radial scrim: guarantees legibility even where the field is
                bright, second line of defence after the shader's own carve. */}
            <div className="flex flex-col items-center [background:radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(4,3,1,0.18),transparent_82%)] px-16 py-14 rounded-full">
              <p className="font-code text-amber-300/70 text-xs tracking-[0.25em] uppercase mb-3">
                {b.kicker}
              </p>
              <p className="font-display text-4xl md:text-5xl font-bold text-white! [text-shadow:0_2px_24px_rgba(0,0,0,0.7)]">
                {b.title}
              </p>
              <div className="mt-6 mx-auto h-px w-16 bg-linear-to-r from-transparent via-amber-300/40 to-transparent" />
              <p className="text-lg text-gray-200 mt-6 max-w-xl mx-auto [text-shadow:0_1px_12px_rgba(0,0,0,0.8)]">
                {b.body}
              </p>
              {b.lean && (
                <pre className="mt-6 font-code text-left text-[13px] leading-relaxed text-emerald-200/90 bg-black/45 border border-amber-200/10 rounded-lg px-5 py-4 whitespace-pre">
                  {b.lean}
                </pre>
              )}
              {b.cta && (
                <Link
                  href="/home"
                  className="
                    mt-8 px-7 py-2 rounded-full
                    bg-amber-50/95 text-black!
                    font-medium tracking-widest uppercase text-xs
                    inline-block text-center
                    shadow-[0_0_20px_rgba(255,255,255,0.3)]
                    transition-all duration-500 ease-out will-change-transform
                    hover:scale-105 hover:bg-amber-50
                    hover:shadow-[0_0_60px_rgba(255,255,255,0.7)]
                    active:scale-95 active:duration-150
                  "
                >
                  Start solving
                </Link>
              )}
            </div>
          </div>
        ))}

        {/* Quiet chapter readout */}
        <div className="absolute bottom-6 left-6 z-10 hidden md:flex items-center gap-2 font-code text-[10px] tracking-[0.2em] uppercase text-white/70 pointer-events-none">
          {CHAPTER_LABELS.map((label, i) => (
            <span key={label} className="flex items-center gap-2">
              {i > 0 && <span className="opacity-30">·</span>}
              <span ref={(el) => { labelRefs.current[i] = el }} style={{ opacity: 0.4 }}>
                {label}
              </span>
            </span>
          ))}
        </div>

        {/* The hero — the film's true frame one, dissolving away on scroll. */}
        <div ref={heroRef} className="absolute inset-0 z-20 will-change-transform">
          <HeroContent />
        </div>
      </div>
    </div>
  )
}
