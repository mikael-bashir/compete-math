// What the universe visualiser draws. One star per Tengoku theorem; a "galaxy" is one library; a run is a list of tool events from Leak.

export interface UniverseLib {
  name: string;
  /** trusted / tentative theorem counts */
  t: number;
  u: number;
  /** galaxy centre in world units */
  c: [number, number, number];
  /** galaxy radius */
  r: number;
  /** hue 0..1 */
  h: number;
}

export interface UniverseMeta {
  n: number;
  scale: number;
  extent: number;
  n_trusted: number;
  n_tentative: number;
  libs: UniverseLib[];
}

export type UniverseEventKind = 'loogle' | 'moogle' | 'compile';

/** One tool call by the driver. Times are seconds on the run's own clock. */
export interface UniverseEvent {
  k: UniverseEventKind;
  t: number;
  /** when the result came back */
  te?: number;
  /** the query (loogle pattern or moogle concept) */
  q?: string;
  /** star indices the search returned, best first */
  hits?: number[];
  /** the lemma names of `hits`, same order, so the page can write them next to their stars */
  hn?: string[];
  /** star indices of the lemmas a compile attempt named */
  used?: number[];
  ok?: boolean;
  /** names the compiler did not know */
  unk?: string[];
  /** the search allowance was at zero */
  blocked?: boolean;
}

export interface ReplayRun {
  label: string;
  theorem: string;
  seconds: number;
  ok: boolean;
  events: UniverseEvent[];
}
