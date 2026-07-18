'use client'

import { useEffect, useRef } from "react"
import Link from "next/link"

// ---------------------------------------------------------------------------
// "The Proof" — the scroll-film hero.
//
// One continuous camera rise, told entirely in procedurally-drawn canvas
// (no footage, no images — see PR description for why): a single spark of
// light in the dark lifts into embers, the embers become a starfield above a
// sleeping skyline, the stars draw themselves into a laurel of light, and the
// laurel blooms into the page itself. Five chapters, one direction: up.
//
// Structure follows the scroll-film engine recipe: a tall scroll driver with
// a pinned stage inside it. Progress is derived from the driver's bounding
// rect every scroll tick and lerped for a buttery playhead.
//
// The stage is pinned manually (fixed while in range, absolute before/after)
// rather than via `position: sticky` — the root layout wraps every page in
// an `overflow-hidden` div (src/app/layout.tsx, there to stop unrelated
// decorative elements from causing horizontal scroll), which becomes the
// sticky containing block and never itself scrolls, so CSS sticky never
// engages inside it. Fixed positioning driven from scroll math sidesteps
// that entirely and is what ScrollTrigger's `pin: true` does under the hood.
// ---------------------------------------------------------------------------

const CHAPTERS = [
  { key: "ignite", label: "Ignite", from: 0.0, to: 0.2 },
  { key: "lift", label: "Lift", from: 0.2, to: 0.38 },
  { key: "sky", label: "Sky", from: 0.38, to: 0.58 },
  { key: "constellation", label: "Constellation", from: 0.58, to: 0.8 },
  { key: "reveal", label: "Reveal", from: 0.8, to: 1.0 },
] as const

const DRIVER_VH = 600 // total scroll distance for the whole film, in vh

// Deterministic PRNG so particle layout is stable across resizes/re-renders.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function lerpColor(hexA: string, hexB: string, t: number) {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  const r = Math.round(lerp(a.r, b.r, t))
  const g = Math.round(lerp(a.g, b.g, t))
  const bl = Math.round(lerp(a.b, b.b, t))
  return `rgb(${r},${g},${bl})`
}

// Palette — warm amber-black, deepening to night-indigo, blooming to
// parchment-amber at the very end (the seam colour the content below opens on).
const COL_WARM_DARK = "#0b0703"
const COL_NIGHT = "#04050c"
const COL_BLOOM = "#f2c988"
// The film settles here for its last frame — matches the after-film section's
// background exactly, so the sticky-stage handoff has no visible seam.
const COL_SETTLE = "#13170d"
export const PROOF_FILM_SEAM_COLOR = COL_SETTLE

type Particle = {
  seed: number
  originX: number
  originY: number
  targetX: number
  targetY: number
  startAt: number
  duration: number
  depth: number // 0..1, smaller = farther/smaller/dimmer
  twinklePhase: number
  isStar: boolean
}

type Building = { x: number; w: number; h: number; windows: number[] }

function buildParticles(count: number, rand: () => number): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const depth = 0.25 + rand() * 0.75
    // Origin: clustered near the beam (lower-left to center), tight spread.
    const beamT = rand()
    const originX = lerp(-0.32, 0.08, beamT) + (rand() - 0.5) * 0.06
    const originY = lerp(0.22, -0.1, beamT) + (rand() - 0.5) * 0.08
    // Target: scattered across the whole frame, denser toward the top (sky).
    const targetX = (rand() - 0.5) * 1.15
    const targetY = lerp(-0.55, 0.15, Math.pow(rand(), 1.4)) - 0.1
    particles.push({
      seed: rand(),
      originX,
      originY,
      targetX,
      targetY,
      startAt: rand() * 0.18, // staggered lift-off within chapter 2
      duration: 0.32 + rand() * 0.28,
      depth,
      twinklePhase: rand() * Math.PI * 2,
      isStar: depth > 0.4,
    })
  }
  return particles
}

function buildSkyline(rand: () => number): Building[] {
  const buildings: Building[] = []
  let x = -0.62
  while (x < 0.62) {
    const w = 0.03 + rand() * 0.05
    const h = 0.05 + rand() * 0.16
    const windowCount = Math.round(h * 40)
    const windows: number[] = []
    for (let i = 0; i < windowCount; i++) windows.push(rand())
    buildings.push({ x, w, h, windows })
    x += w + 0.006
  }
  return buildings
}

// Laurel/medal hub points — two mirrored arcs converging top and bottom,
// in normalized (-1..1 x, -1..1 y) space, drawn small and centred.
function buildLaurelHubs() {
  const left: [number, number][] = []
  const right: [number, number][] = []
  const n = 6
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const angle = lerp(-Math.PI * 0.42, Math.PI * 0.42, t)
    const r = 0.16 + Math.sin(t * Math.PI) * 0.05
    left.push([-Math.sin(angle) * r - 0.03, -Math.cos(angle) * r])
    right.push([Math.sin(angle) * r + 0.03, -Math.cos(angle) * r])
  }
  return { left, right }
}

export default function ProofFilm() {
  const driverRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const beatRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const driver = driverRef.current
    const stage = stageRef.current
    if (!canvas || !driver || !stage) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const rand = mulberry32(1337)
    const particles = buildParticles(160, rand)
    const buildings = buildSkyline(rand)
    const laurel = buildLaurelHubs()

    let dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0
    let h = 0
    let current = 0 // lerped playhead (0..1)
    let target = 0 // raw scroll progress (0..1)
    let rafId = 0
    let startedAt = performance.now()

    // Pre-rendered soft-glow sprite (avoids per-particle shadowBlur cost).
    const spriteSize = 64
    const sprite = document.createElement("canvas")
    sprite.width = spriteSize
    sprite.height = spriteSize
    const sctx = sprite.getContext("2d")!
    const grad = sctx.createRadialGradient(
      spriteSize / 2, spriteSize / 2, 0,
      spriteSize / 2, spriteSize / 2, spriteSize / 2,
    )
    grad.addColorStop(0, "rgba(255,214,140,1)")
    grad.addColorStop(0.4, "rgba(255,180,90,0.55)")
    grad.addColorStop(1, "rgba(255,180,90,0)")
    sctx.fillStyle = grad
    sctx.fillRect(0, 0, spriteSize, spriteSize)

    function resize() {
      const rect = driver!.getBoundingClientRect()
      w = window.innerWidth
      h = window.innerHeight
      canvas!.width = Math.round(w * dpr)
      canvas!.height = Math.round(h * dpr)
      canvas!.style.width = w + "px"
      canvas!.style.height = h + "px"
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      void rect
    }

    function computeProgress() {
      const rect = driver!.getBoundingClientRect()
      const total = rect.height - h
      if (total <= 0) return 0
      return clamp(-rect.top / total, 0, 1)
    }

    // Manual pin (see file header for why this isn't `position: sticky`):
    // fixed to the viewport while the driver is in range, absolute-parked
    // at the top before it and at the bottom after it.
    function updatePin() {
      const rect = driver!.getBoundingClientRect()
      const maxScroll = Math.max(0, rect.height - h)
      if (rect.top > 0) {
        stage!.style.position = "absolute"
        stage!.style.top = "0px"
      } else if (-rect.top < maxScroll) {
        stage!.style.position = "fixed"
        stage!.style.top = "0px"
      } else {
        stage!.style.position = "absolute"
        stage!.style.top = `${maxScroll}px`
      }
    }

    // Normalized (-1..1) to screen space, with a slight upward camera push
    // (parallax) that grows across the whole film for a continuous "rise".
    function project(nx: number, ny: number, p: number, depth: number) {
      const rise = p * 0.22
      const scale = Math.min(w, h) * (0.62 + depth * 0.1)
      const px = w / 2 + nx * scale
      const py = h / 2 + (ny + rise) * scale
      return { px, py }
    }

    function drawProofCurve(revealT: number, alpha: number) {
      if (alpha <= 0 || revealT <= 0) return
      ctx!.save()
      ctx!.strokeStyle = `rgba(255,206,130,${alpha})`
      ctx!.lineWidth = Math.max(2, w * 0.004)
      ctx!.lineCap = "round"
      ctx!.shadowColor = "rgba(255,180,90,0.9)"
      ctx!.shadowBlur = w * 0.02
      const p0 = project(-0.02, 0.14, 0, 0.6)
      const p1 = project(0.09, -0.02, 0, 0.6)
      const p2 = project(-0.07, -0.1, 0, 0.6)
      const p3 = project(0.01, -0.22, 0, 0.6)
      const total = 3 // three cubic segments approximated by sampling
      ctx!.beginPath()
      const samples = 64
      const cut = Math.round(samples * revealT)
      for (let i = 0; i <= cut; i++) {
        const t = i / samples
        // simple 3-point catmull-ish chain through p0..p3
        const seg = t * total
        const si = Math.min(2, Math.floor(seg))
        const st = seg - si
        const a = [p0, p1, p2, p3][si]
        const b = [p0, p1, p2, p3][si + 1]
        const x = lerp(a.px, b.px, easeInOut(st))
        const y = lerp(a.py, b.py, easeInOut(st))
        if (i === 0) ctx!.moveTo(x, y)
        else ctx!.lineTo(x, y)
      }
      ctx!.stroke()
      ctx!.restore()
    }

    function draw(p: number, t: number) {
      // --- background ---
      let bg: string
      if (p < 0.34) bg = COL_WARM_DARK
      else if (p < 0.58) bg = lerpColor(COL_WARM_DARK, COL_NIGHT, easeInOut((p - 0.34) / 0.24))
      else if (p < 0.88) bg = COL_NIGHT
      else bg = lerpColor(COL_NIGHT, COL_SETTLE, easeInOut((p - 0.88) / 0.12))
      ctx!.fillStyle = bg
      ctx!.fillRect(0, 0, w, h)

      // --- warm beam (chapter 1 only) ---
      const beamAlpha = clamp(1 - p / 0.22, 0, 1)
      if (beamAlpha > 0) {
        const bg2 = ctx!.createLinearGradient(w * 0.05, h * 0.05, w * 0.55, h * 0.95)
        bg2.addColorStop(0, `rgba(255,190,110,${0.22 * beamAlpha})`)
        bg2.addColorStop(1, "rgba(255,190,110,0)")
        ctx!.fillStyle = bg2
        ctx!.fillRect(0, 0, w, h)
      }

      // --- the seed spark: one point of light, visible from scroll 0 ---
      const seedOrigin = project(-0.02, 0.14, 0, 0.6)
      const seedAlpha = clamp(1 - p / 0.1, 0, 1)
      if (seedAlpha > 0) {
        const pulse = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 1.4)
        const size = w * 0.02 * pulse
        ctx!.globalAlpha = seedAlpha
        ctx!.drawImage(sprite, seedOrigin.px - size, seedOrigin.py - size, size * 2, size * 2)
        ctx!.globalAlpha = 1
      }

      // --- the proof curve draws itself outward from the spark, then dissolves ---
      const curveReveal = clamp(0.22 + p / 0.11, 0, 1)
      const curveAlpha = p < 0.18 ? 1 : clamp(1 - (p - 0.18) / 0.1, 0, 1)
      drawProofCurve(curveReveal, curveAlpha)

      // --- skyline (rises into view through chapter 3, then settles) ---
      const skylineT = clamp((p - 0.34) / 0.16, 0, 1)
      const skylineAlpha = clamp((p - 0.3) / 0.12, 0, 1) * clamp(1 - (p - 0.78) / 0.1, 0, 1)
      if (skylineAlpha > 0) {
        const baseY = h * (1.02 - easeOut(skylineT) * 0.22) + p * h * 0.12
        ctx!.save()
        ctx!.globalAlpha = skylineAlpha
        ctx!.fillStyle = "rgba(4,4,10,0.92)"
        for (const b of buildings) {
          const bx = w / 2 + b.x * w
          const bw = b.w * w
          const bh = b.h * h * 0.9
          ctx!.fillRect(bx, baseY - bh, bw, bh + h)
          ctx!.fillStyle = `rgba(255,196,120,${0.5 * skylineAlpha})`
          for (const wt of b.windows) {
            if (wt > 0.86) {
              const wx = bx + 2 + (wt % 1) * (bw - 4)
              const wy = baseY - bh + ((wt * 97) % bh)
              ctx!.fillRect(wx, wy, 1.4, 1.4)
            }
          }
          ctx!.fillStyle = "rgba(4,4,10,0.92)"
        }
        ctx!.restore()
      }

      // --- particles: embers -> stars, with gentle continuous twinkle ---
      for (const particle of particles) {
        const localT = clamp((p - particle.startAt) / particle.duration, 0, 1)
        if (localT <= 0 && p < 0.02) continue
        const formed = easeOut(localT)
        const nx = lerp(particle.originX, particle.targetX, formed)
        const ny = lerp(particle.originY, particle.targetY, formed)
        const { px, py } = project(nx, ny, p, particle.depth)
        if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue

        const twinkle = reducedMotion
          ? 1
          : 0.75 + 0.25 * Math.sin(t * (0.6 + particle.depth) + particle.twinklePhase)
        const bornAlpha = clamp(localT * 3, 0, 1)
        // constellation phase dims un-selected background stars slightly so hubs read clearly
        const constellationDim = p > 0.58 && p < 0.86 ? 0.55 : 1
        const alpha = bornAlpha * twinkle * (0.35 + particle.depth * 0.65) * constellationDim
        const size = (particle.isStar ? 1.4 : 2.6) * particle.depth * (w / 1280)

        ctx!.globalAlpha = clamp(alpha, 0, 1)
        ctx!.drawImage(sprite, px - size * 6, py - size * 6, size * 12, size * 12)
      }
      ctx!.globalAlpha = 1

      // --- constellation: laurel hubs connect with growing amber lines ---
      const laurelT = clamp((p - 0.58) / 0.2, 0, 1)
      const laurelAlpha = clamp((p - 0.56) / 0.08, 0, 1) * clamp(1 - (p - 0.92) / 0.08, 0, 1)
      if (laurelAlpha > 0 && laurelT > 0) {
        ctx!.save()
        ctx!.strokeStyle = `rgba(255,210,140,${0.85 * laurelAlpha})`
        ctx!.lineWidth = Math.max(1.2, w * 0.0016)
        ctx!.shadowColor = "rgba(255,190,110,0.85)"
        ctx!.shadowBlur = w * 0.01
        for (const side of [laurel.left, laurel.right]) {
          const segs = side.length - 1
          const drawSegs = laurelT * segs
          ctx!.beginPath()
          for (let i = 0; i <= segs; i++) {
            const segT = clamp(drawSegs - i, 0, 1)
            if (segT <= 0 && i > 0) break
            const [nx, ny] = side[i]
            const { px, py } = project(nx, ny, p, 0.9)
            if (i === 0) ctx!.moveTo(px, py)
            else {
              const [pnx, pny] = side[i - 1]
              const prevPt = project(pnx, pny, p, 0.9)
              const ex = lerp(prevPt.px, px, segT)
              const ey = lerp(prevPt.py, py, segT)
              ctx!.lineTo(ex, ey)
            }
          }
          ctx!.stroke()
        }
        ctx!.restore()
      }

      // --- bloom: a single flash as the laurel completes, then it recedes,
      // settling back to dark so the finale copy lands on a legible surface
      // and the page content below can pick up exactly where it settled. ---
      let bloomAlpha = 0
      if (p >= 0.84 && p <= 1) {
        bloomAlpha = p < 0.9 ? easeOut((p - 0.84) / 0.06) : 1 - easeInOut((p - 0.9) / 0.1)
      }
      if (bloomAlpha > 0) {
        const r = Math.max(w, h) * 0.95
        const g2 = ctx!.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, r)
        g2.addColorStop(0, `rgba(242,201,136,${bloomAlpha * 0.95})`)
        g2.addColorStop(1, "rgba(242,201,136,0)")
        ctx!.fillStyle = g2
        ctx!.fillRect(0, 0, w, h)
      }

      // --- vignette (constant, cheap, sells "one shot") ---
      const vg = ctx!.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
      vg.addColorStop(0, "rgba(0,0,0,0)")
      vg.addColorStop(1, "rgba(0,0,0,0.45)")
      ctx!.fillStyle = vg
      ctx!.fillRect(0, 0, w, h)
    }

    function updateBeats(p: number) {
      for (const el of beatRefs.current) {
        if (!el) continue
        const inP = parseFloat(el.dataset.in || "0")
        const peakP = parseFloat(el.dataset.peak || "0")
        const outP = parseFloat(el.dataset.out || "1")
        let alpha = 0
        if (p >= inP && p <= outP) {
          if (p < peakP) alpha = (p - inP) / Math.max(1e-4, peakP - inP)
          else if (outP > 1.5) alpha = 1
          else alpha = 1 - (p - peakP) / Math.max(1e-4, outP - peakP)
        }
        alpha = clamp(alpha, 0, 1)
        el.style.opacity = String(alpha)
        el.style.transform = `translateY(${(1 - alpha) * 14}px)`
        el.style.pointerEvents = alpha > 0.4 ? "auto" : "none"
      }
    }

    function tick(now: number) {
      target = computeProgress()
      current = reducedMotion ? target : lerp(current, target, 0.14)
      const tSec = (now - startedAt) / 1000
      updatePin()
      draw(current, tSec)
      updateBeats(current)
      rafId = requestAnimationFrame(tick)
    }

    resize()

    // --- dev contract: ?jump=<scrollY> lands pre-scrolled + settled ---
    const params = new URLSearchParams(window.location.search)
    const jump = params.get("jump")
    if (jump !== null) {
      history.scrollRestoration = "manual"
      // behavior: "instant" bypasses the site-wide `scroll-behavior: smooth`
      // (set globally by atomix's base CSS) — without it this animates and
      // races with the per-frame pin/progress update below.
      window.scrollTo({ top: Number(jump) || 0, left: 0, behavior: "instant" })
      current = computeProgress()
      target = current
    }

    updatePin()
    draw(current, 0)
    updateBeats(current)
    rafId = requestAnimationFrame(tick)

    const onResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      resize()
      updatePin()
      draw(current, (performance.now() - startedAt) / 1000)
    }
    window.addEventListener("resize", onResize)

    ;(window as unknown as { __ready?: boolean }).__ready = true

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return (
    <div ref={driverRef} style={{ height: `${DRIVER_VH}vh` }} className="relative">
      <div ref={stageRef} className="absolute top-0 left-0 right-0 h-screen w-full overflow-hidden bg-[#0b0703]">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {/* Beat 1 — hero, visible at scroll 0 */}
        <div
          ref={(el) => { beatRefs.current[0] = el }}
          data-in="-0.1"
          data-peak="0.04"
          data-out="0.17"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 text-center opacity-0 transition-none"
        >
          <p className="font-code text-amber-300/80 text-xs md:text-sm tracking-[0.3em] uppercase mb-3">
            // prove it
          </p>
          <p className="font-display text-2xl md:text-4xl font-semibold text-white/90 max-w-xl">
            Every proof starts with one spark.
          </p>
        </div>

        {/* Beat 2 */}
        <div
          ref={(el) => { beatRefs.current[1] = el }}
          data-in="0.2"
          data-peak="0.3"
          data-out="0.44"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 text-center opacity-0"
        >
          <p className="font-display text-3xl md:text-5xl font-semibold text-white max-w-xl">
            One spark. <span className="italic text-amber-200">A thousand stars.</span>
          </p>
        </div>

        {/* Beat 3 */}
        <div
          ref={(el) => { beatRefs.current[2] = el }}
          data-in="0.56"
          data-peak="0.66"
          data-out="0.79"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 text-center opacity-0"
        >
          <p className="font-display text-3xl md:text-5xl font-semibold text-white max-w-xl">
            A thousand stars, drawn into <span className="italic text-amber-200">one arena.</span>
          </p>
        </div>

        {/* Beat 4 — finale, the payoff. Fades in as the flash recedes to
            dark; never fades out (data-out > 1.5) so it holds through the
            last frame of the pin. */}
        <div
          ref={(el) => { beatRefs.current[3] = el }}
          data-in="0.93"
          data-peak="0.99"
          data-out="2"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 text-center opacity-0"
        >
          <h1 className="font-display text-4xl md:text-6xl font-bold text-white tracking-tight">
            <span className="pt-5 md:text-[58pt] xs:text-[36pt] text-[26pt] tracking-tight font-bold text-white opacity-90">
              Competition<span className="text-amber-300">.</span>
            </span>
          </h1>
          <div className="pb-7 pt-2">
            <p className="font-code text-white/75 text-base md:text-lg">
              <span className="text-amber-300/80">$</span> the best way to master mathematics
            </p>
          </div>
          <Link
            href="/home"
            className="
              px-7 py-2 rounded-full
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
        </div>

        {/* Chapter readout */}
        <div className="absolute bottom-6 left-6 z-10 hidden md:flex items-center gap-2 font-code text-[10px] tracking-[0.2em] uppercase text-white/50">
          <ChapterReadout />
        </div>
      </div>
    </div>
  )
}

function ChapterReadout() {
  // Static label list — the active chapter is driven visually by the film
  // itself; this is a quiet ambient readout, not interactive.
  return (
    <>
      {CHAPTERS.map((c, i) => (
        <span key={c.key} className="flex items-center gap-2">
          {i > 0 && <span className="opacity-30">·</span>}
          <span className="opacity-60">{c.label}</span>
        </span>
      ))}
    </>
  )
}
