import { sstep } from "./constants"

// The motion engine (o2b model): scroll position sets TARGETS, time does
// the moving. The warp velocity eases toward its throttle and, past the
// deceleration, decays exponentially to a TRUE standstill - resting
// particles must not move while the scrubbed universe holds. The camera's
// log-zoom eases toward its scroll target the same way: the landing on the
// home galaxy is exponential decay, and after any scroll stops the camera
// is still gliding - ever slower, never a snap.
export function createWarpEngine() {
  let warpVel = 0
  let warpTrav = 0
  let lzS: number | null = null // smoothed log(zoom)
  const LZ0 = Math.log(0.002), LZM = Math.log(0.024), LZ1 = Math.log(3.3670)

  function warpThrottle(pStory: number): number {
    return sstep(0.09, 0.14, pStory) * (1 - sstep(0.17, 0.24, pStory))
  }
  function lzTarget(pStory: number): number {
    const za = sstep(0.17, 0.32, pStory) // the approach - long and gentle
    const zd = sstep(0.32, 0.42, pStory) // the dive - the plunge home
    const a = LZ0 + (LZM - LZ0) * za
    return a + (LZ1 - a) * zd
  }

  return {
    get warpVel() { return warpVel },
    get warpTrav() { return warpTrav },
    get lzS() { return lzS },
    step(pStory: number, dt: number) {
      warpVel += (warpThrottle(pStory) - warpVel) * Math.min(1, dt * 2.8)
      warpTrav += dt * warpVel * 1.9
      if (lzS === null) lzS = lzTarget(pStory) // first frame (and ?jump) snaps
      else lzS += (lzTarget(pStory) - lzS) * (1 - Math.exp(-dt * 1.4))
    },
    // draw() may run before the first step() (the warm pre-loop frame) -
    // this lazily seeds lzS exactly like step() does, so that frame isn't blank.
    lzFor(pStory: number): number {
      if (lzS === null) lzS = lzTarget(pStory)
      return lzS
    },
    // The universe may only materialize once the travel has DIED: its
    // reveal is gated by the real (eased) warp velocity, not by scroll
    // position alone - park mid-burst and you hold on stars over black.
    uniVizNow(pStory: number): number {
      return sstep(0.16, 0.24, pStory) * (1 - sstep(0.10, 0.30, warpVel))
    },
  }
}
