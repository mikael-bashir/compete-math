// The timing of the proof supernova: what happens when a target is proved. Pure (no DOM, no GL) so that the shader, the overlay, the
// preview page's scrubber and the tests all read the same numbers; the GLSL gets its constants from here (shader.ts).
//
//   0.0 - 1.15 s   the quiet before: a lone star in the dark, a faint collapse rippling inward, a speck of a figure beside it for scale
//   1.15 s         detonation: white-hot flash, camera shake, the figure is gone
//   1.15 - ~6 s    the blast wave. Its radius follows the Sedov-Taylor law for a point explosion, R ~ t^(2/5), which is why it leaps out
//                  at first and then slows: fast enough to be violent, slow enough to read as enormous
//   ~2 - 9 s       the word, in the glow
//   9.4 - 11.5 s   the sky lets go and the page comes back

export const DETONATION_S = 1.15
export const TOTAL_S = 11.5
export const FADE_IN_S = 0.9
export const FADE_OUT_FROM_S = 9.4
export const TEXT_IN_S = DETONATION_S + 0.85
export const TEXT_OUT_FROM_S = 9.0

// Sedov-Taylor: R = K (t + t0)^(2/5), in screen heights. K puts the front at the edge of a 16:9 screen about five seconds after the
// detonation; t0 keeps it from being a point at t = 0.
export const SEDOV_EXPONENT = 0.4
export const SEDOV_K = 0.47
export const SEDOV_T0 = 0.022

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export const blastRadius = (sinceDetonationS: number) => SEDOV_K * Math.pow(Math.max(0, sinceDetonationS) + SEDOV_T0, SEDOV_EXPONENT)

// How much of the overlay is there: in over FADE_IN_S, out over the last stretch.
export const overlayAlpha = (t: number) => smoothstep(0, FADE_IN_S, t) * (1 - smoothstep(FADE_OUT_FROM_S, TOTAL_S, t))

// The flash that follows the detonation: up in 30 ms, then a long decay. One flash, never a strobe.
export const flashEnvelope = (sinceDetonationS: number) => (sinceDetonationS <= 0 ? 0 : smoothstep(0, 0.03, sinceDetonationS) * Math.exp(-sinceDetonationS * 5.5))

// The word's opacity: it arrives out of the glow and leaves before the sky does.
export const textOpacity = (t: number) => smoothstep(TEXT_IN_S, TEXT_IN_S + 1.1, t) * (1 - smoothstep(TEXT_OUT_FROM_S, TEXT_OUT_FROM_S + 1.4, t))
