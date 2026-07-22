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
export const FRAG_FLY_FIELD = `
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
`
