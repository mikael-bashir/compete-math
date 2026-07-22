'use client'

import { useEffect, useRef } from "react"
import Link from "next/link"
import HeroContent from "../hero"
import { DRIVER_VH, HERO_SEG, MAX_INTERNAL_WIDTH, QUALITY_STEPS, P95_DEGRADE_MS, P95_ABORT_MS, clamp01, lerp, sstep } from "./constants"
import { CHAPTER_LABELS, BEATS } from "./beats"
import { VERT, FRAG } from "./shader"
import { compileShader, linkProgram } from "./glProgram"
import { createHeart } from "./heart"
import { createWarpEngine } from "./warpEngine"

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
//
// MODULE MAP (this file is the wiring; each concern lives in its own file -
// edit that file directly instead of loading this whole tree):
//   shader/           the GLSL, one file per concern (join order in shader/index.ts)
//   constants.ts      timing/quality knobs + math helpers
//   beats.tsx         the four chapters' copy and timing
//   heart.ts          the finale heart's CPU point animation
//   warpEngine.ts      the CPU-integrated warp velocity / camera log-zoom
//   glProgram.ts       shader compile/link helpers
// ---------------------------------------------------------------------------

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

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT)
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = vs && fs ? linkProgram(gl, vs, fs) : null
    if (!prog) { onAbort(); return }
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

    const heart = createHeart()
    const warp = createWarpEngine()

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
      gl!.uniform1f(uTrav, warp.warpTrav)
      gl!.uniform1f(uVel, warp.warpVel)
      gl!.uniform1f(uLz, warp.lzFor(pStory))
      gl!.uniform1f(uUniViz, warp.uniVizNow(pStory))
      gl!.uniform1f(uText, textAmt)
      const heartAmt = sstep(0.86, 0.97, pStory)
      gl!.uniform1f(uHeartAmt, heartAmt)
      if (heartAmt > 0.004) {
        heart.animate(heartAmt, tSec, { cssW, cssH, mouseAmt, smoothMX, smoothMY })
        gl!.uniform4fv(uHeart, heart.heartData)
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
      warp.step(pStory, dt)
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
      warpVel: warp.warpVel, warpTrav: warp.warpTrav, lz: warp.lzS,
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
