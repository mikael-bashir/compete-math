// THE equation. The whole film is this one function seen at different
// magnifications and parameter values: a universe of celestial bodies all
// drawn from it (ch1), one copy filling the frame (ch2), its Cantor-dust
// regime (ch3), and its evaporation into the final heart.
export const FRAG_JULIA = `
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
`
