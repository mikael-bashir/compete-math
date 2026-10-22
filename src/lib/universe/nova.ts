// The supernova at the end of a proof. When the target is born in the finale (lineage.ts: FINALE.stillness seconds after the proof closes) the
// star it becomes goes off: a flash of light that reaches across the whole screen, and the whole page, for a moment; the view shakes; and a
// shock wave runs out from the star, but only a corner of a galaxy wide, because light crosses the universe at once and matter does not.
// The wave is a few hundredths of the view at the finale's own camera and fills the screen only when the reader has zoomed far into the galaxy.
//
// Everything here is a pure function of `born`, the seconds since the star was born, so scrubbing a replay draws exactly the frame it should.
// No DOM, no GL: the engine (engine.ts) and the page flash (page-flash.ts) take their numbers from here, and tests/universe/nova.test.ts reads them.

export const NOVA = {
  /** world units (the universe is about 1.3 across, a galaxy a few tenths): where the blast wave stops. A corner of a galaxy. */
  rMax: 0.012,
  /** the second, faster, thinner ripple that leaves the first behind and is gone before it gets far */
  rMax2: 0.02,
  /** Sedov-Taylor, R ~ t^(2/5): a point explosion leaps out and then slows */
  exponent: 0.4,
  t0: 0.03,
  /** seconds for the front to reach rMax */
  growS: 6.5,
  /** the shake: seconds it lasts, and its size as a fraction of the view's height */
  shakeS: 1.1,
  shakeAmp: 0.012,
  /** debris: how many sparks, and how long the longest lives */
  sparks: 26,
  sparkLife: 3.4,
  /** how bright the flash is at its peak, over the picture (the page flash is its own, see pageFlash) */
  flashPeak: 0.9,
} as const;

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const hash = (n: number): number => {
  n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35) >>> 0;
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
};

/** The front's radius in world units, `born` seconds after the detonation: the Sedov-Taylor law, scaled to stop at rMax. Nothing before it. */
export function blastRadius(born: number, rMax: number = NOVA.rMax): number {
  if (born <= 0) return 0;
  const k = rMax / Math.pow(NOVA.growS + NOVA.t0, NOVA.exponent);
  return Math.min(rMax, k * Math.pow(born + NOVA.t0, NOVA.exponent));
}

/** The second ripple's radius: faster at first, then it simply stops being there. */
export function rippleRadius(born: number): number {
  return born <= 0 ? 0 : NOVA.rMax2 * (1 - Math.exp(-born * 1.2));
}

/** One flash, not a strobe: up in about 30 ms, then only down. 0 before the detonation. */
export function flashEnvelope(born: number): number {
  return born <= 0 ? 0 : smoothstep(0, 0.03, born) * Math.exp(-born * 5.5);
}

/** How bright the wave's front is: it rises at once and fades over about six seconds, as the real thing cools. */
export function ringBrightness(born: number): number {
  return born <= 0 ? 0 : smoothstep(0, 0.05, born) * Math.exp(-born * 0.55);
}

export function rippleBrightness(born: number): number {
  return born <= 0 ? 0 : smoothstep(0, 0.04, born) * Math.exp(-born * 1.1);
}

/**
 * The shake, as an offset of the view in fractions of its height, each axis within +-shakeAmp. A sum of two incommensurate waves under a
 * decaying envelope, so it is rough rather than a wobble and stops by itself; a function of `born`, so a replay scrubbed to any moment shakes
 * exactly as it would have.
 */
export function shakeOffset(born: number, amp: number = NOVA.shakeAmp): [number, number] {
  if (born <= 0 || born >= NOVA.shakeS) return [0, 0];
  const env = smoothstep(0, 0.02, born) * Math.exp(-born * 3.4) * (1 - smoothstep(NOVA.shakeS * 0.8, NOVA.shakeS, born));
  const x = (Math.sin(born * 61 + 1.3) + 0.6 * Math.sin(born * 97 + 4.1)) / 1.6;
  const y = (Math.sin(born * 53 + 2.7) + 0.6 * Math.sin(born * 89 + 0.4)) / 1.6;
  return [amp * env * x, amp * env * y];
}

export interface Spark {
  /** offset from the star, world units */
  dx: number;
  dy: number;
  alpha: number;
  /** a pinpoint, in the glow sprite's size units */
  size: number;
  /** 0 = ember, 1 = white-hot */
  hot: number;
}

/** The debris: pinpoints leaving the star along their own rays, slowing as they go, cooling from white to ember as they fade. */
export function sparks(born: number): Spark[] {
  if (born <= 0) return [];
  const out: Spark[] = [];
  for (let i = 0; i < NOVA.sparks; i++) {
    const a = hash(i * 3 + 1) * Math.PI * 2;
    const reach = NOVA.rMax * (0.7 + 1.1 * hash(i * 3 + 2));
    const life = NOVA.sparkLife * (0.35 + 0.65 * hash(i * 3 + 3));
    const r = reach * (1 - Math.exp(-born * 1.6));
    const alpha = smoothstep(0, 0.05, born) * Math.exp(-born / life);
    if (alpha < 0.01) continue;
    out.push({ dx: Math.cos(a) * r, dy: Math.sin(a) * r, alpha, size: 3 + 2.5 * hash(i * 3 + 4), hot: Math.exp(-born / (0.5 * life)) });
  }
  return out;
}

/** The page flash: how much of the whole page is covered by light, over a duration, as WAAPI keyframes. One flash that decays; never repeated. */
export const PAGE_FLASH = { durationMs: 1700, peak: 0.6, calmPeak: 0.12 } as const;
export function pageFlashFrames(peak: number): { opacity: number; offset: number }[] {
  return [
    { opacity: 0, offset: 0 },
    { opacity: peak, offset: 0.02 },
    { opacity: peak * 0.45, offset: 0.12 },
    { opacity: peak * 0.14, offset: 0.4 },
    { opacity: 0, offset: 1 },
  ];
}

/** What the shock wave looks like to the tone-mapping pass, for a view `dist` world units tall on a canvas `heightPx` tall. */
export interface NovaView {
  /** radius of the front, in screen heights */
  ring: number;
  /** half-width of the front, in screen heights */
  width: number;
  /** 0..1: how bright the front is, fading to nothing as it becomes only a few pixels (zoomed out, it is not there) */
  k: number;
  ring2: number;
  k2: number;
}

export function novaView(born: number, dist: number, heightPx: number): NovaView {
  const px = 1 / Math.max(1, heightPx);
  const r1 = blastRadius(born) / dist;
  const r2 = rippleRadius(born) / dist;
  const vis = (r: number): number => smoothstep(3 * px, 14 * px, r);
  return {
    ring: r1,
    width: Math.max(1.5 * px, r1 * 0.055),
    k: ringBrightness(born) * vis(r1),
    ring2: r2,
    k2: rippleBrightness(born) * vis(r2) * 0.6,
  };
}

/** Fire the page flash only when the star is born while it is being watched (not when a replay is scrubbed into the middle of the nova). */
export function shouldFire(prevBorn: number, born: number, watching: boolean): boolean {
  return watching && prevBorn <= 0 && born > 0 && born < 0.6;
}
