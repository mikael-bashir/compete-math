'use client'

import { useEffect, useRef } from "react"

// ---------------------------------------------------------------------------
// The equation-film: the landing page's four stories told by ONE live GLSL
// fragment shader, scrubbed by scroll. No video, no images — every frame is
// computed on the GPU from the same equation, which is the point: on a site
// about mathematics, the film itself is mathematics.
//
//   Chapter 1 — the arena      golden ink-chaos (domain-warped fbm)
//   Chapter 2 — the insight    a Julia set crystallises out of the chaos
//   Chapter 3 — the community  a drifting constellation network (voronoi)
//   Chapter 4 — the proof      a lattice with a verification wave, settling
//                              into the page background for the handoff
//
// Mounted ONLY after the device gate in page.tsx passes (big screen, fine
// pointer, real GPU, no reduced-motion) — phones never download this module.
// A runtime watchdog measures frame-time p95 and steps internal resolution
// down, aborting to the static page if the device still can't hold 60fps.
//
// Pinning is manual (fixed/absolute switch) — `position: sticky` silently
// never engages inside the root layout's overflow-hidden wrapper. Programmatic
// scrolls must use behavior:'instant' to bypass atomix's global
// `scroll-behavior: smooth`. Both learned the hard way in the scroll-film
// build; see PR #3.
// ---------------------------------------------------------------------------

const DRIVER_VH = 520 // total scroll distance of the film
const MAX_INTERNAL_WIDTH = 1600 // shader render width cap; CSS upscales — invisible for this content, huge perf win
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
uniform float uProg;     // film progress 0..1
uniform vec2  uMouse;    // internal-resolution pixels, GL origin (bottom-left)
uniform float uMouseAmt; // 0 until the first real mousemove
out vec4 outColor;

const vec3 BG     = vec3(0.043, 0.027, 0.012); // warm near-black
const vec3 AMBER  = vec3(1.00, 0.78, 0.42);
const vec3 GOLD   = vec3(0.98, 0.62, 0.19);
const vec3 SETTLE = vec3(0.075, 0.090, 0.051); // #13170d — the section bg below

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

// Chapter 1 — the arena. Domain-warped golden ink: thousands of attempts,
// beautiful chaos.
vec3 ink(vec2 p, float t){
  vec2 q = vec2(fbm(p + 0.15 * t), fbm(p + vec2(5.2, 1.3) - 0.11 * t));
  vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + 0.09 * t),
                fbm(p + 2.6 * q + vec2(8.3, 2.8)));
  float f = fbm(p + 2.2 * r);
  vec3 col = mix(BG, GOLD * 0.85, smoothstep(0.35, 0.95, f));
  col = mix(col, AMBER, smoothstep(0.62, 1.0, f * length(q)) * 0.55);
  return col;
}

// Chapter 2 — the insight. A Julia set: literal live mathematics emerging
// from the ink. The parameter c travels as the chapter progresses — the
// structure visibly "resolves".
vec3 julia(vec2 p, float t, float drive){
  vec2 z = p * 1.45;
  vec2 c = vec2(-0.745, 0.186)
         + 0.055 * vec2(cos(0.21 * t + drive * 3.2), sin(0.17 * t + drive * 2.5))
         * (1.0 - 0.5 * drive);
  float trap = 1e9;
  float m = 56.0;
  for (int i = 0; i < 56; i++){
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(length(z) - 0.35));
    if (dot(z, z) > 16.0){ m = float(i); break; }
  }
  float glow = exp(-trap * 6.5);
  float edge = m / 56.0;
  vec3 col = BG;
  col += GOLD * glow * 0.85;
  col += AMBER * pow(edge, 3.0) * 0.8;
  return col;
}

// Chapter 3 — the community. A slowly drifting constellation: nodes are
// solvers, thin voronoi ridges are the discussions connecting them.
vec3 network(vec2 p, float t){
  vec2 g = p * 8.5;
  vec2 i = floor(g), f = fract(g);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 o = vec2(float(x), float(y));
      vec2 h = vec2(hash21(i + o), hash21(i + o + 7.7));
      h = 0.5 + 0.4 * sin(0.6 * t + 6.2831 * h);
      float d = length(o + h - f);
      if (d < f1){ f2 = f1; f1 = d; } else if (d < f2){ f2 = d; }
    }
  }
  float node = exp(-f1 * f1 * 90.0);           // small bright stars, not blobs
  float halo = exp(-f1 * f1 * 14.0) * 0.22;    // faint glow around each
  float edge = exp(-abs(f2 - f1) * 26.0);      // thin connecting ridges
  float pulse = 0.5 + 0.5 * sin(1.4 * t + (f1 + f2) * 7.0);
  vec3 col = BG * 0.85;
  col += AMBER * (node * (0.75 + 0.4 * pulse) + halo);
  col += GOLD * edge * 0.22;
  return col;
}

// Chapter 4 — the proof. Everything snaps to a lattice; a radial
// verification wave sweeps through; the field settles to the exact colour
// of the content below (the seam handoff).
vec3 lattice(vec2 p, float t, float drive){
  vec2 g = p * 6.0;
  vec2 f = abs(fract(g) - 0.5);
  float line = smoothstep(0.44, 0.5, max(f.x, f.y));
  float wave = exp(-abs(length(p) - drive * 2.1) * 3.2);
  float breathe = 0.5 + 0.5 * sin(0.8 * t);
  vec3 col = mix(BG, SETTLE, drive);
  col += GOLD * line * (0.18 + 0.85 * wave) * (1.0 - 0.25 * breathe);
  col += AMBER * wave * 0.12;
  col = mix(col, SETTLE, smoothstep(0.78, 1.0, drive));
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float P = uProg;

  // One continuous camera rise across the whole film.
  vec2 p = uv + vec2(0.0, P * 1.2);

  // Mouse warp — the proof it's live, not video. Gentle displacement field
  // around the cursor; zero until the first real mousemove.
  vec2 m = (uMouse - 0.5 * uRes) / uRes.y;
  vec2 away = uv - m;
  float md = length(away);
  p += (away / max(md, 1e-3)) * exp(-md * 3.0) * 0.055 * uMouseAmt;

  // Chapter weights with crossfades.
  float w1 = 1.0 - smoothstep(0.20, 0.30, P);
  float w2 = smoothstep(0.20, 0.30, P) * (1.0 - smoothstep(0.45, 0.55, P));
  float w3 = smoothstep(0.45, 0.55, P) * (1.0 - smoothstep(0.70, 0.80, P));
  float w4 = smoothstep(0.70, 0.80, P);

  // Uniform-driven branches: outside its crossfade a chapter costs nothing.
  vec3 col = vec3(0.0);
  if (w1 > 0.003) col += w1 * ink(p, t);
  if (w2 > 0.003) col += w2 * julia(p, t, clamp((P - 0.25) / 0.25, 0.0, 1.0));
  if (w3 > 0.003) col += w3 * network(p, t);
  if (w4 > 0.003) col += w4 * lattice(uv, t, clamp((P - 0.75) / 0.25, 0.0, 1.0));

  float vig = 1.0 - 0.45 * smoothstep(0.45, 1.1, length(uv));
  col *= vig;
  col += (hash21(gl_FragCoord.xy + fract(t) * 7.0) - 0.5) * 0.03; // grain
  outColor = vec4(col, 1.0);
}`

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

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
const BEATS: Beat[] = [
  {
    in: 0.02, peak: 0.09, out: 0.2,
    kicker: "// competition",
    title: (
      <>Learn through <span className="italic">Competition</span></>
    ),
    body: "Work through a bottomless pool of fresh problems, climb the global leaderboards, earn exclusive badges, and prove your skills in officially hosted competitions. Every solve pushes you up the ranks.",
  },
  {
    in: 0.27, peak: 0.35, out: 0.46,
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
    in: 0.52, peak: 0.6, out: 0.71,
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
    in: 0.77, peak: 0.85, out: 0.96,
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
  const beatRefs = useRef<Array<HTMLDivElement | null>>([])
  const captionRef = useRef<HTMLDivElement>(null)
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    const driver = driverRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!driver || !stage || !canvas) return

    // ---- WebGL setup (gate already probed WebGL2; this is the real context) ----
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
    const uMouse = gl.getUniformLocation(prog, "uMouse")
    const uMouseAmt = gl.getUniformLocation(prog, "uMouseAmt")

    // ---- state ----
    let qualityStep = 0
    let cssW = 0, cssH = 0, glW = 0, glH = 0
    let current = 0, target = 0
    let rafId = 0
    let visible = false
    let disposed = false
    let mouseX = -1e5, mouseY = -1e5, mouseAmt = 0, mouseAmtTarget = 0
    let navHover = false
    let immersed = false
    let activeChapter = -1
    const started = performance.now()

    function resize() {
      cssW = window.innerWidth
      cssH = window.innerHeight
      const scale = (Math.min(cssW, MAX_INTERNAL_WIDTH) / cssW) * QUALITY_STEPS[qualityStep]
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

    // Manual pin — see file header for why this is not `position: sticky`.
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

    function draw(p: number, tSec: number) {
      gl!.uniform2f(uRes, glW, glH)
      gl!.uniform1f(uTime, tSec)
      gl!.uniform1f(uProg, p)
      const r = glW / cssW
      gl!.uniform2f(uMouse, mouseX * r, glH - mouseY * r)
      gl!.uniform1f(uMouseAmt, mouseAmt)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    }

    function updateOverlays(p: number) {
      for (const el of beatRefs.current) {
        if (!el) continue
        const bIn = parseFloat(el.dataset.in || "0")
        const bPeak = parseFloat(el.dataset.peak || "0")
        const bOut = parseFloat(el.dataset.out || "1")
        let a = 0
        if (p >= bIn && p <= bOut) {
          a = p < bPeak ? (p - bIn) / Math.max(1e-4, bPeak - bIn)
            : 1 - (p - bPeak) / Math.max(1e-4, bOut - bPeak)
        }
        a = clamp01(a)
        el.style.opacity = String(a)
        el.style.transform = `translateY(${(1 - a) * 16}px)`
      }
      if (captionRef.current) {
        captionRef.current.style.opacity = String(clamp01(1 - p / 0.18) * 0.8)
      }
      const ch = p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.75 ? 2 : 3
      if (ch !== activeChapter) {
        activeChapter = ch
        labelRefs.current.forEach((el, i) => {
          if (el) el.style.opacity = i === ch ? "0.95" : "0.4"
        })
      }
    }

    function updateImmersion(pinned: boolean, p: number) {
      const want = pinned && p > 0.015 && p < 0.985 && !navHover
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
      mouseAmt = lerp(mouseAmt, mouseAmtTarget, 0.06)
      draw(current, (now - started) / 1000)
      updateOverlays(current)
      updateImmersion(pinned, current)
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
        updateImmersion(false, current)
      }
    }, { rootMargin: "25%" })
    io.observe(driver)

    const onMouse = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
      mouseAmtTarget = 1
      navHover = e.clientY < 90
    }
    window.addEventListener("mousemove", onMouse, { passive: true })

    const onResize = () => { resize(); if (!visible) { updatePin(); draw(current, (performance.now() - started) / 1000) } }
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

    draw(current, 0) // warm frame — first scroll never shows an empty canvas
    updateOverlays(current)

    ;(window as unknown as { __ready?: boolean }).__ready = true
    ;(window as unknown as { __filmState?: () => object }).__filmState = () => ({
      progress: current, quality: QUALITY_STEPS[qualityStep], res: [glW, glH], visible,
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
      // Deliberately NOT losing the GL context here: React StrictMode
      // remounts effects on the same canvas, and a lost context poisons the
      // remount (getContext returns the dead context; compiles fail with
      // empty logs). The context is reclaimed with the canvas on unmount.
    }
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={driverRef} style={{ height: `${DRIVER_VH}vh` }} className="relative bg-[#0b0703]">
      <div ref={stageRef} className="absolute top-0 left-0 right-0 h-screen w-full overflow-hidden">
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
        ))}

        {/* The stump, stated plainly. Fades out as chapter 1 ends. */}
        <div
          ref={captionRef}
          className="absolute bottom-6 right-6 z-10 text-right font-code text-[11px] leading-relaxed text-white/60 pointer-events-none"
        >
          <p>// no video, no images — one equation, rendered live</p>
          <p className="text-amber-300/60">move your mouse</p>
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
      </div>
    </div>
  )
}
