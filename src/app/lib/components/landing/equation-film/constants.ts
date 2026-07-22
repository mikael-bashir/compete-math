export const DRIVER_VH = 600 // total scroll distance: hero handoff + four chapters
export const HERO_SEG = 0.1 // first fraction of the driver: hero dissolves into frame one
export const MAX_INTERNAL_WIDTH = 2560 // shader render width cap (device px). DPR is respected up to 2x —
// ignoring it made the star/grid chapters visibly soft on retina displays.
export const QUALITY_STEPS = [1, 0.82, 0.66] // watchdog degrade ladder (internal-res multipliers)
export const P95_DEGRADE_MS = 27 // step down when p95 frame time exceeds this
export const P95_ABORT_MS = 45 // at the last step, give up and restore the static page

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
