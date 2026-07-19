'use client'

import { useEffect, useRef } from "react"
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
//   Chapter 1 — the arena      golden ink-chaos with drifting embers
//   Chapter 2 — the insight    a rim-lit Julia set condenses out of the ink
//                              and FRAMES the copy (masked off the centre),
//                              then its parameter c is driven OUT of the
//                              Mandelbrot set and the Fatou-Julia dichotomy
//                              shatters it into Cantor dust -> the stars
//   Chapter 3 — the community  a starfield with faint cell walls (voronoi)
//   Chapter 4 — the proof      the SAME stars slide into alignment and the
//                              SAME cell walls straighten into the lattice;
//                              a certification wave stills every twinkle
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
uniform float uProg;  // STORY progress 0..1 (the hero segment is already removed)
uniform float uText;  // beat-copy visibility 0..1 - carves a quiet stage for the text
out vec4 outColor;

const vec3 BG     = vec3(0.043, 0.027, 0.012); // warm near-black
const vec3 HERO   = vec3(0.071, 0.090, 0.051); // #12170d - the hero backdrop the film develops from
const vec3 AMBER  = vec3(1.00, 0.78, 0.42);
const vec3 GOLD   = vec3(0.98, 0.62, 0.19);
const vec3 CERT   = vec3(1.00, 0.93, 0.74);    // certified starlight - calmer, whiter
const vec3 SETTLE = vec3(0.075, 0.090, 0.051); // #13170d - the sections below

float hash21(vec2 p){
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++){
    v += a * vnoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}

// Chapter 1 - the arena. Domain-warped golden ink with drifting embers.
// Embers are clamped to their cell interiors: centres near a cell edge got
// their glow clipped square, which read as smudge artifacts.
vec3 ink(vec2 p, float t){
  p *= 1.35;
  vec2 q = vec2(fbm(p + 0.15 * t), fbm(p + vec2(5.2, 1.3) - 0.11 * t));
  vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + 0.09 * t),
                fbm(p + 2.6 * q + vec2(8.3, 2.8)));
  float f = fbm(p + 2.2 * r);
  vec3 col = mix(BG, GOLD * 0.8, smoothstep(0.42, 0.98, f));
  col = mix(col, AMBER * 0.85, smoothstep(0.78, 1.0, f) * 0.35);
  float fil = fbm(p * 2.6 + r * 1.4 - 0.05 * t);
  col += GOLD * 0.16 * smoothstep(0.66, 0.92, fil) * smoothstep(0.35, 0.6, f);
  vec2 ep = p * 5.0 + q * 1.6 + vec2(0.0, -0.45 * t);
  vec2 ei = floor(ep), ef = fract(ep);
  float eh = hash21(ei);
  if (eh > 0.955){
    vec2 ec = vec2(0.25) + 0.5 * vec2(fract(eh * 13.7), fract(eh * 7.31));
    float ed = length(ef - ec);
    col += AMBER * exp(-ed * ed * 90.0) * 0.45 * (0.6 + 0.4 * sin(t * 2.0 + eh * 40.0));
  }
  return col;
}

// Chapter 2 - the insight. Rim-lit Julia filigree, returned as PURE LIGHT
// (no base) so main() can mask it into a frame around the copy. 'condense'
// pulls it out of the ink's smoke. 'reveal' is the exit, and the exit is a
// theorem: c is pushed OUT of the Mandelbrot set, so by the Fatou-Julia
// dichotomy the set stops being connected and shatters into Cantor dust,
// thinning and evaporating as c travels further - the mathematics itself
// performs the dissolve, no wipe, no slide, no fade.
vec3 julia(vec2 u, float t, float drive, float condense, float reveal){
  vec2 smoke = vec2(fbm(u * 1.8 + 0.1 * t), fbm(u * 1.8 + vec2(4.7, 2.9)));
  float zoom = mix(1.35, 1.55, reveal);
  vec2 z = (u + (smoke - 0.5) * (1.0 - condense) * 0.9) * zoom;
  vec2 c = vec2(-0.745, 0.186)
         + 0.045 * vec2(cos(0.19 * t + drive * 2.6), sin(0.15 * t + drive * 2.1))
         * (1.0 - 0.5 * drive)
         + reveal * reveal * vec2(-0.50, 0.19); // c leaves the Mandelbrot set: lace -> Cantor dust -> gone
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

// Chapters 3 & 4 are ONE field, returned as pure light. 'order' slides every
// star to its lattice position - and the voronoi cell walls STRAIGHTEN INTO
// THE GRID on their own (the walls of aligned cells are exact rows and
// columns). No second grid is drawn; the walls persist and become it.
// 'cert' (from the radial certification wave) stills the twinkle and
// whitens the light.
vec3 stars(vec2 p, float t, float scale, float order, float cert){
  vec2 g = p * scale;
  vec2 i = floor(g), f = fract(g);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 o = vec2(float(x), float(y));
      vec2 hrnd = vec2(hash21(i + o), hash21(i + o + 7.7));
      vec2 drift = 0.5 + 0.4 * sin(0.6 * t + 6.2831 * hrnd);
      vec2 h = mix(drift, vec2(0.5), order);
      float d = length(o + h - f);
      if (d < f1){ f2 = f1; f1 = d; } else if (d < f2){ f2 = d; }
    }
  }
  float twinkle = 0.5 + 0.5 * sin(1.4 * t + (f1 + f2) * 7.0);
  float steady = mix(twinkle, 1.0, max(order * 0.35, cert));
  float node = exp(-f1 * f1 * 140.0);
  float halo = exp(-f1 * f1 * 22.0) * 0.10;
  float ridge = exp(-abs(f2 - f1) * 30.0);
  vec3 starCol = mix(AMBER, CERT, cert * 0.85);
  vec3 col = vec3(0.0);
  col += starCol * (node * (0.35 + 0.65 * steady) + halo);
  col += GOLD * ridge * (0.14 + 0.12 * order + 0.2 * cert); // walls clarify as they straighten
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float P = uProg;

  // One continuous camera rise across the whole film.
  vec2 p = uv + vec2(0.0, P * 1.1);

  // Strictly sequential handoff: chapter 2 owns the screen through its full
  // dust dissolution; the starfield only enters once the dust is gone.
  float w1 = 1.0 - smoothstep(0.22, 0.32, P);
  float w2 = smoothstep(0.22, 0.32, P) * (1.0 - smoothstep(0.60, 0.66, P));
  float w3 = smoothstep(0.66, 0.74, P);
  float condense = smoothstep(0.26, 0.42, P);
  float reveal   = smoothstep(0.44, 0.60, P); // the dissolution gets its full, unhurried window
  float order    = smoothstep(0.78, 0.87, P);
  float wave     = max(0.0, (P - 0.87) / 0.10) * 1.9;

  float rWave = length(uv - vec2(0.0, -0.05));
  float cert = wave <= 0.0 ? 0.0 : smoothstep(rWave, rWave + 0.4, wave);

  vec3 col = vec3(0.0);
  if (w1 > 0.004) col += w1 * ink(p, t);
  if (w2 > 0.004){
    // The frame mask: filigree renders only OUTSIDE the copy's ellipse, so
    // the fireworks surround the story and can never touch it. The mask is
    // released as 'reveal' zooms the set down to its final point of light.
    // Floor at 0.28, never 0: the filigree stays faintly visible THROUGH the
    // copy's ellipse - a translucent stage, not a solid hole. The carve +
    // scrim on top keep the text readable.
    float ring = mix(0.28, 1.0, smoothstep(0.30, 0.50, length(uv * vec2(1.0, 1.3))));
    float mask = max(ring, reveal);
    vec3 jc = julia(uv, t, clamp((P - 0.26) / 0.21, 0.0, 1.0), condense, reveal);
    col += w2 * (BG * 0.9 + mask * jc);
  }
  if (w3 > 0.004){
    vec3 s = stars(p, t, 24.0, order, cert); // one fine field - the coarse layer read as a clumsy dual grid
    s += AMBER * exp(-abs(rWave - wave) * 4.5) * step(0.001, wave) * step(wave, 2.4) * 0.4;
    col += w3 * (BG * 0.85 + s);
  }

  // Frame one develops out of the hero's own backdrop (the hero -> film join).
  col = mix(HERO, col, smoothstep(0.0, 0.07, P));
  // And the last frame settles into the sections below (the film -> page join).
  col = mix(col, SETTLE, smoothstep(0.94, 1.0, P));

  // The text stage: while a story beat is visible, dim the field behind the
  // copy so the shader highlights the words instead of fighting them.
  float dTS = length((uv - vec2(0.0, -0.02)) * vec2(1.0, 1.4));
  col *= 1.0 - uText * 0.4 * (1.0 - smoothstep(0.26, 0.68, dTS));

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
  out: number
  kicker: string
  title: React.ReactNode
  body: React.ReactNode
  lean?: string
}

// The four stories — same copy as the static sections this film replaces.
// Timings are in STORY progress (post-hero).
const BEATS: Beat[] = [
  {
    in: 0.03, peak: 0.1, out: 0.21,
    kicker: "// competition",
    title: (
      <>Learn through <span className="italic">Competition</span></>
    ),
    body: "Work through a bottomless pool of fresh problems, climb the global leaderboards, earn exclusive badges, and prove your skills in officially hosted competitions. Every solve pushes you up the ranks.",
  },
  {
    in: 0.31, peak: 0.38, out: 0.5,
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
    in: 0.7, peak: 0.76, out: 0.84,
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
    in: 0.86, peak: 0.9, out: 0.99,
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
  const captionRef = useRef<HTMLDivElement>(null)
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
    const uText = gl.getUniformLocation(prog, "uText")

    // ---- state ----
    let qualityStep = 0
    let cssW = 0, cssH = 0, glW = 0, glH = 0
    let current = 0, target = 0 // raw driver progress (hero segment included)
    let rafId = 0
    let visible = false
    let disposed = false
    let navHover = false
    let textAmt = 0 // current beat-copy visibility, fed to uText
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

    function draw(pStory: number, tSec: number) {
      gl!.uniform2f(uRes, glW, glH)
      gl!.uniform1f(uTime, tSec)
      gl!.uniform1f(uProg, pStory)
      gl!.uniform1f(uText, textAmt)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    }

    // The hero dissolves and lifts away over the first stretch of scroll,
    // revealing the film developing beneath it — the hero IS frame one.
    function updateHero(raw: number) {
      const a = 1 - sstep(0.02, 0.1, raw)
      hero!.style.opacity = String(a)
      hero!.style.transform = `translateY(${(1 - a) * -6}vh) scale(${1 + (1 - a) * 0.04})`
      hero!.style.pointerEvents = a > 0.5 ? "auto" : "none"
    }

    function updateOverlays(pStory: number) {
      let maxA = 0
      for (const el of beatRefs.current) {
        if (!el) continue
        const bIn = parseFloat(el.dataset.in || "0")
        const bPeak = parseFloat(el.dataset.peak || "0")
        const bOut = parseFloat(el.dataset.out || "1")
        let a = 0
        if (pStory >= bIn && pStory <= bOut) {
          a = pStory < bPeak ? (pStory - bIn) / Math.max(1e-4, bPeak - bIn)
            : 1 - (pStory - bPeak) / Math.max(1e-4, bOut - bPeak)
        }
        a = clamp01(a)
        maxA = Math.max(maxA, a)
        el.style.opacity = String(a)
        el.style.transform = `translateY(${(1 - a) * 16}px)`
      }
      textAmt = maxA // the shader dims its field behind visible copy
      if (captionRef.current) {
        captionRef.current.style.opacity = String(clamp01(1 - pStory / 0.18) * clamp01(pStory / 0.02) * 0.8)
      }
      const ch = pStory < 0.24 ? 0 : pStory < 0.63 ? 1 : pStory < 0.8 ? 2 : 3
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

    function tick(now: number) {
      if (disposed) return
      target = progress()
      current = Math.abs(target - current) < 0.0004 ? target : lerp(current, target, 0.12)
      updatePin()
      const rect = driver!.getBoundingClientRect()
      const pinned = rect.top <= 0 && -rect.top < rect.height - cssH
      const pStory = story(current)
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

    // Mouse is only chrome UX (top-edge navbar reveal) — the film itself
    // deliberately ignores the cursor; nobody mouses mid-scroll.
    const onMouse = (e: MouseEvent) => {
      navHover = e.clientY < 90
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
    })

    function cleanup() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(rafId)
      io.disconnect()
      window.removeEventListener("mousemove", onMouse)
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
            data-out={b.out}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center opacity-0 pointer-events-none"
          >
            {/* Radial scrim: guarantees legibility even where the field is
                bright, second line of defence after the shader's own carve. */}
            <div className="flex flex-col items-center [background:radial-gradient(ellipse_58%_48%_at_50%_50%,rgba(4,3,1,0.3),transparent_78%)] px-16 py-14 rounded-full">
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
            </div>
          </div>
        ))}

        {/* The stump, stated plainly. Appears as the hero clears, fades as
            chapter 1 ends. */}
        <div
          ref={captionRef}
          className="absolute bottom-6 right-6 z-10 text-right font-code text-[11px] leading-relaxed text-white/60 pointer-events-none opacity-0"
        >
          <p>// no video, no images — one equation, rendered live</p>
        </div>

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
