import { clamp01 } from "./constants"

// The finale heart: 96 points on the classic parametric heart curve,
// animated entirely on the CPU each frame (formation from scattered dust,
// idle drift, cursor repulsion + ignition) and splatted by the GPU.
const N_HEART = 96 // near-pixel points need numbers to read as a curve

export type HeartView = {
  cssW: number
  cssH: number
  mouseAmt: number
  smoothMX: number
  smoothMY: number
}

export function createHeart() {
  const heartBase = new Float32Array(N_HEART * 2) // UNIT curve; aspect-scaled per frame
  const heartScatter = new Float32Array(N_HEART * 2)
  const heartH1 = new Float32Array(N_HEART)
  const heartH2 = new Float32Array(N_HEART)
  for (let i = 0; i < N_HEART; i++) {
    const th = ((i + 0.5) / N_HEART) * Math.PI * 2
    heartBase[i * 2] = 0.16 * Math.pow(Math.sin(th), 3)
    heartBase[i * 2 + 1] = 0.013 * (13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th))
    const s1 = Math.sin(i * 127.1 + 311.7) * 43758.5453
    const s2 = Math.sin(i * 269.5 + 183.3) * 28001.8384
    heartH1[i] = s1 - Math.floor(s1)
    heartH2[i] = s2 - Math.floor(s2)
    heartScatter[i * 2] = (heartH1[i] - 0.5) * 1.8
    heartScatter[i * 2 + 1] = (heartH2[i] - 0.5) * 1.1
  }
  const heartData = new Float32Array(N_HEART * 4) // xy pos, z glow, w size

  function animate(amt: number, tSec: number, view: HeartView) {
    const { cssW, cssH, mouseAmt, smoothMX, smoothMY } = view
    const muX = (smoothMX - 0.5 * cssW) / cssH
    const muY = (0.5 * cssH - smoothMY) / cssH
    // Aspect-adaptive: full size on wide screens, shrinking on narrow ones
    // so the lobes never clip the viewport edges.
    const aspect = cssW / cssH
    const scale = 2.6 * Math.min(1, (0.5 * aspect - 0.05) / 0.46)
    for (let i = 0; i < N_HEART; i++) {
      const h1 = heartH1[i], h2 = heartH2[i]
      const form = clamp01((amt - h1 * 0.5) / 0.5)
      const f = form * form * (3 - 2 * form)
      const bx = heartBase[i * 2] * scale
      const by = heartBase[i * 2 + 1] * scale + 0.03
      let px = heartScatter[i * 2] + (bx - heartScatter[i * 2]) * f
      let py = heartScatter[i * 2 + 1] + (by - heartScatter[i * 2 + 1]) * f
      px += 0.006 * Math.sin(tSec * (0.5 + h1) + h2 * 40)
      py += 0.006 * Math.cos(tSec * (0.4 + h2) + h1 * 40)
      const ax = px - muX, ay = py - muY
      const md2 = ax * ax + ay * ay
      const rep = 0.05 * Math.exp(-md2 * 55) * mouseAmt
      const inv = 1 / Math.max(Math.sqrt(md2), 1e-3)
      px += ax * inv * rep
      py += ay * inv * rep
      const excite = 1 + 1.7 * Math.exp(-md2 * 40) * mouseAmt
      const tw = 0.55 + 0.45 * Math.sin(tSec * (0.8 + 1.4 * h1) + h2 * 6.28318)
      heartData[i * 4] = px
      heartData[i * 4 + 1] = py
      heartData[i * 4 + 2] = 0.85 * tw * excite * amt
      heartData[i * 4 + 3] = 0.7 + 0.7 * h2 // per-point size variety
    }
  }

  return { heartData, animate }
}
