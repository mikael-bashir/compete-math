// The finale: when the target is proven, the universe shows what the proof is built from. The final step cites some of the driver's saved
// theorems and some Mathlib lemmas; each saved theorem cites earlier ones and more lemmas, and every chain ends in the stars. This module
// traces that ancestry (pure, so it can be tested) and times the light that runs back through it.

/** What a saved theorem was built from: the earlier saves its proof cites (indices among the saves) and the stars it cites itself. */
export interface LineageSave {
  deps: number[];
  stars: number[];
}

/** One thing the proof rests on: a saved theorem or a star, how many steps from the target, and what it hangs from (-1 = the target itself). */
export interface LineageNode {
  type: 'save' | 'star';
  id: number;
  depth: number;
  parent: number;
}

export interface Lineage {
  nodes: LineageNode[];
  maxDepth: number;
  /** the trace stopped at a limit: some of what the proof rests on is not shown */
  truncated: boolean;
}

export const LINEAGE_MAX_NODES = 400;
export const LINEAGE_MAX_DEPTH = 8;

/**
 * Trace the ancestry of the final step: breadth first, so each thing is attached at the shallowest point it is reached (a lemma cited by
 * both the target and a saved theorem hangs from the target), never twice, and never in a cycle.
 */
export function traceLineage(root: { saves: number[]; stars: number[] }, saves: LineageSave[], maxNodes = LINEAGE_MAX_NODES, maxDepth = LINEAGE_MAX_DEPTH): Lineage {
  const nodes: LineageNode[] = [];
  const seenSave = new Set<number>();
  const seenStar = new Set<number>();
  let truncated = false;
  let frontier: { type: 'save'; id: number; at: number }[] = [];
  const add = (type: 'save' | 'star', id: number, depth: number, parent: number): number => {
    const seen = type === 'save' ? seenSave : seenStar;
    if (seen.has(id)) return -1;
    if (nodes.length >= maxNodes) {
      truncated = true;
      return -1;
    }
    seen.add(id);
    nodes.push({ type, id, depth, parent });
    return nodes.length - 1;
  };
  for (const s of root.saves) {
    if (s < 0 || s >= saves.length) continue;
    const at = add('save', s, 1, -1);
    if (at >= 0) frontier.push({ type: 'save', id: s, at });
  }
  for (const st of root.stars) add('star', st, 1, -1);
  let depth = 1;
  while (frontier.length) {
    if (depth >= maxDepth) {
      truncated = true;
      break;
    }
    const next: typeof frontier = [];
    depth++;
    for (const f of frontier) {
      const s = saves[f.id];
      for (const d of s.deps) {
        if (d < 0 || d >= saves.length) continue;
        const at = add('save', d, depth, f.at);
        if (at >= 0) next.push({ type: 'save', id: d, at });
      }
      for (const st of s.stars) add('star', st, depth, f.at);
    }
    frontier = next;
  }
  return { nodes, maxDepth: nodes.reduce((m, n) => Math.max(m, n.depth), 0), truncated };
}

/** Seconds after the proof closes: the sky holds its breath, then the target is born, then light starts running back through its ancestry. */
export const FINALE = { stillness: 1.2, ignite: 2.0, travel: 0.8, settle: 8 } as const;

/** When the light reaches a node of the given depth (seconds after the proof closed). The whole run back finishes within about six seconds however deep. */
export function igniteTime(depth: number, maxDepth: number): number {
  const step = Math.min(0.9, 6 / Math.max(1, maxDepth));
  return FINALE.ignite + (Math.max(1, depth) - 1) * step;
}

/** Duration for the closing line: "42 s", "17 min", "9 h 12 min". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** The one line under the finale: what the proof is built from, and how long it took. */
export function lineageSummary(l: Lineage, libraryOf: (star: number) => number, seconds: number): string {
  const stars = l.nodes.filter((n) => n.type === 'star');
  const own = l.nodes.filter((n) => n.type === 'save').length;
  const libs = new Set(stars.map((n) => libraryOf(n.id)));
  const parts: string[] = [];
  if (libs.size) parts.push(`built from ${plural(libs.size, 'library', 'libraries')}`);
  if (stars.length) parts.push(`${plural(stars.length, 'Mathlib lemma', 'Mathlib lemmas')}${l.truncated ? '+' : ''}`);
  if (own) parts.push(`${own.toLocaleString('en-US')} of its own`);
  if (seconds > 0) parts.push(formatDuration(seconds));
  return parts.join(' · ');
}
