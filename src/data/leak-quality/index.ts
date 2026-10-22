import erdos396 from './erdos-396.json';

// The star ratings of the theorems a target's runs saved, one file per target, made by tools/leak-rank (`pnpm rank:bank -- --export`).
// Numbers and flags keyed by the entry's own id: no theorem text, so it can sit in a public repository.
export interface QualityEntry {
  s: number; // stars, 1 to 5
  u: number; // how many other saved entries rest on it
  d?: number; // depth of the argument, 1 to 5 (the reader)
  g?: number; // generality, 1 to 5 (the reader)
  w?: number; // worth to the target, 0 to 3 (the reader)
  k?: string; // kind (the reader)
  c?: 1; // a one-line automatic tactic proves it
  l?: 1; // one existing lemma proves it
  n?: 1; // a numeric fact with no variable in it
  m?: 1; // the reader says Mathlib already has it
  v?: 1; // the hypotheses look unsatisfiable
  x?: 1; // repeats another entry
  t?: 1; // states the target from smaller hypotheses
  r?: string; // the date it was rated
  rv?: number; // the version of the rule that rated it
}

export interface QualityFile {
  targetId: string;
  rankedAt: string;
  draws: number;
  method: string;
  count: number;
  entries: Record<string, QualityEntry>;
}

export const QUALITY_FILES: Record<string, QualityFile> = {
  'erdos-396': erdos396 as QualityFile,
};
