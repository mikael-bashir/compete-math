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
export const FRAG_SPIRALS = `
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
`
