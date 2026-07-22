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
//
// Placement note (see equation-film's main() for the call sites): position
// and size both scale with the SAME zoomP, so a body's apparent-size ÷
// distance-from-screen-centre ratio (gs / |center|) is CONSTANT for its
// entire flight - it's not "grows as it approaches", it's a fixed angular
// size relative to its offset the whole time. Pick that ratio directly to
// place a body "small and off to the side" (low ratio) vs. "looming near
// the centre" (high ratio, where the home galaxy always sits).
//
// Iteration counts trimmed after a real-device FPS test (120Hz display,
// 8.3ms budget) showed 84fps where this fires - down from the original
// 20 bend-loop steps x 6 substeps (worst case 120 bend + 240 disk = 360
// total raymarch iterations) to 13 x 4 (worst case 52 bend + 104 disk =
// 156). This body is small, far, and glimpsed briefly (see main.ts's
// placement note) - it never needs the geodesic-integration precision a
// screen-filling hero shot would, so the accuracy this loses is not
// visible at the size/distance it's actually placed at.
export const FRAG_BLACK_HOLE = `
const float BH_SPEED = 3.0;   // disk rotation speed
const int   BH_STEPS_I = 8;   // disk texture layers (was 12)
const float BH_STEPS = 8.0;
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

  for (int disks = 0; disks < 13; disks++){
    for (int h = 0; h < 4; h++){
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
`
