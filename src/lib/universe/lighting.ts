// The laws of light in the universe, kept apart from the WebGL so that they can be tested. The engine and the star shader both use these.
//
//  1. A star keeps its light however far away you are: below the smallest sprite it gives only the light of the area it really covers, so a
//     galaxy has the same surface brightness at any distance and its total light falls as the square of the distance.
//  2. Light fades with age as 1/(1 + age/τ): what happened a moment ago burns bright, older work dims and never vanishes, and summed over
//     any history it grows only like a logarithm, so months of work leave the sky as readable as a day of it.
//  3. A library is as much sky as the same number of theorems anywhere else: it follows the size law of the galaxies.

/** How a sub-pixel star's light falls with its drawn size. 2 conserves light exactly; the extra 0.12 offsets how a sub-pixel sprite is sampled. */
export const STAR_FLUX_EXPONENT = 2.12;

/** Light given by a star whose true size is `raw` pixels when the smallest sprite it can be drawn as is `lo` pixels (1 = full light). */
export function starFlux(raw: number, lo: number): number {
  return raw < lo ? Math.pow(Math.max(raw, 0) / lo, STAR_FLUX_EXPONENT) : 1;
}

/** Seconds: the age at which a piece of work has half its light. */
export const FADE_TAU = 2400;

/** The share of its light that work of the given age (seconds) still gives. 1 for now, falling slowly, never 0. */
export function fadeOf(ageSeconds: number): number {
  return 1 / (1 + Math.max(0, ageSeconds) / FADE_TAU);
}

/** The radius (in universe units) of a library holding n theorems: the galaxies' own law, radius ~ n^0.35 (184 theorems 0.025, 39,000 theorems 0.12), capped below the largest galaxy. */
export function libRadius(n: number): number {
  return Math.min(0.1, Math.max(0.012, 0.0254 * Math.pow(Math.max(1, n) / 184, 0.35)));
}

/** Light each seed of an n-theorem library gives, falling as the library grows so that thousands of seeds are a textured cloud and never a solid ball. */
export function seedGain(n: number): number {
  return 0.42 * Math.min(1, Math.sqrt(1200 / Math.max(1, n)));
}

/** The key of an unordered pair of stars (a < 400,000), for counting how often two lemmas were used together. */
export function pairKey(a: number, b: number): number {
  return Math.min(a, b) * 400000 + Math.max(a, b);
}

/** The strongest links of a weighted web, strongest first, dropping those whose light has faded away. */
export function strongestLinks(weights: Map<number, number>, cap = 300, floor = 0.02): { a: number; b: number; w: number }[] {
  return [...weights.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, cap)
    .filter((x) => x[1] > floor)
    .map(([k, w]) => ({ a: Math.floor(k / 400000), b: k % 400000, w }));
}

/** The brightness (0..1) of a web link whose faded uses add up to w: towards 1 for one used again and again, lately. */
export function linkBrightness(w: number): number {
  return 1 - Math.exp(-w / 1.4);
}

/**
 * The emptiest patch of sky near `p`, for a library to live in: the position, among 24 directions at two distances, where the galaxies pull
 * least, weighted by how many theorems and how wide each is.
 */
export function emptySky(p: [number, number, number], libs: { c: [number, number, number]; r: number; t: number; u: number }[]): [number, number, number] {
  let best: [number, number, number] = p;
  let bs = Infinity;
  for (const dist of [0.2, 0.3]) {
    for (let k = 0; k < 24; k++) {
      const an = (k / 24) * Math.PI * 2;
      const q: [number, number, number] = [p[0] + Math.cos(an) * dist, p[1] + Math.sin(an) * dist, p[2]];
      let sc = dist * 0.5;
      for (const l of libs) {
        const m = Math.sqrt(l.t + l.u);
        const d2 = (q[0] - l.c[0]) ** 2 + (q[1] - l.c[1]) ** 2;
        sc += (m / (d2 + (0.7 * l.r) ** 2)) * 0.002;
      }
      if (sc < bs) {
        bs = sc;
        best = q;
      }
    }
  }
  return best;
}
