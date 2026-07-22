// The frame assembly: story timing, the ONE centred dolly camera, the
// layer stack (near home galaxy + full-ecosystem + glimmer shells + the
// feature black hole), the persisting warp starfield, the launch dive,
// the finale heart splat, and the text stage / vignette / grain that
// finish every frame regardless of chapter.
export const FRAG_MAIN = `
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
    // The gas between the stars: a continuous nebula wash (see
    // shader/nebula.ts) so the field reads as clouds and dust as much as
    // discrete bodies - present at every depth, thickest along the web.
    // Gated by stackFade too, same as the rest of the wide-field stack
    // below: world shrinks toward zero approaching the close-up dolly, and
    // without this gate the noise degenerates into a few flat low-frequency
    // blobs right when the home galaxy should be the sole focus.
    if (uniViz > 0.004 && stackFade > 0.004){
      // haze first (cheap, always-on floor so voids next to the wisps
      // don't read as artificially empty), wisps on top
      field += nebulaHaze(world, cf, t) * uniViz * stackFade;
      field += nebulaWash(world, cf, t) * uniViz * stackFade;
    }
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

    // ONE feature black hole, fixed far out in the same world the galaxies
    // live in - its screen footprint sweeps past exactly like any other
    // body as the camera dollies by, but it's its own full lensed raymarch.
    // Placed by the size/offset-ratio rule (shader/blackHole.ts): |center|
    // is large (this universe is enormous when deeply zoomed out, Z0=0.002 -
    // sitting at the screen's edge right as the universe fades in, zoomP
    // ~0.004-0.008, needs a world offset two orders of magnitude bigger
    // than the earlier mid-dive placement just to register there at all).
    // But the ratio itself (gs / |center|) stays MODEST - |center| alone
    // doesn't make something look big, apparent size is gs*zoomP
    // regardless of how far out |center| is. gs=1.0 (down from 6.0,
    // "exactly 6 times smaller" on request) - still not tiny in absolute
    // world terms since |center| itself is huge, but the ratio that
    // actually governs on-screen dominance is now a fraction of the
    // home galaxy's own S_T=0.22-equivalent presence.
    // Footprint (radius 3.4*gs) is still world-huge enough to be reachable
    // before the reveal at Z0's deep zoom - gate the call itself on
    // uniViz, not just its contribution afterward, or the full raymarch
    // runs for nothing throughout the entire pre-reveal hero dive.
    if (uniViz > 0.004){
      vec4 bh1 = blackHoleShot(world, vec2(142.0, -50.0), 1.0, 0.15);
      if (bh1.a > 0.0) col = mix(col, bh1.rgb, bh1.a * life * uniViz);
    }
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
}
`
