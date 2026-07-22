// Uniforms every other chunk reads, the film's fixed palette, and hash21 -
// the one PRNG primitive every other chunk hashes off of. Must come first:
// #version has to be the source's very first line once all chunks join.
export const FRAG_HEADER = `#version 300 es
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
`
