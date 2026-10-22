import { QUALITY_FILES, type QualityEntry, type QualityFile } from '@/data/leak-quality';

// What a star rating means and what stands behind a particular one. Pure, so the wording and the lookup are tested. The rating itself is made
// offline by tools/leak-rank (see its README): features of the entry, two questions put to Leak IV, and a model's reading.

export interface Rung {
  stars: 1 | 2 | 3 | 4 | 5;
  name: string;
  lead: string;
  earnedBy: string;
  example: string;
}

export const RUNGS: Rung[] = [
  { stars: 1, name: 'Adds nothing', lead: 'Safe to ignore: it does not move the proof forward.', earnedBy: 'A one-line automatic tactic proves it, or it repeats another entry, or it is a routine numeric case.', example: 'A particular instance such as the case k = 4, or anything decide or simp closes.' },
  { stars: 2, name: 'True but routine', lead: 'Correct, but a small step or already available.', earnedBy: 'One existing lemma proves it, or it is a numeric fact with no variable in it, or the reader found it a small step.', example: 'A restatement of a library lemma, or an unfolded definition.' },
  { stars: 3, name: 'Solid lemma', lead: 'A reusable result a competent user would still have to write.', earnedBy: 'No tactic or single lemma closes it, and it has real content and some generality.', example: 'A valuation bound for a central binomial coefficient.' },
  { stars: 4, name: 'Reusable and not routine', lead: 'Worth keeping and building on.', earnedBy: 'A non-routine proof with real generality, or a real reduction of the target to something smaller.', example: 'The carry criterion for p dividing C(2n,n), or a conditional reduction of the target.' },
  { stars: 5, name: 'Standout', lead: 'Rare on purpose: deep, general, much used and worth a lot to the target.', earnedBy: 'The weighted score reaches 4.5 of 5.', example: 'None so far.' },
];

export const rungOf = (stars: number): Rung | null => RUNGS.find((r) => r.stars === stars) ?? null;

export const starText = (n: number): string => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

// the rating of one saved entry, or null when it has not been rated (a theorem saved since the last time the target was ranked)
export function qualityOf(targetId: string, entryId: string, files: Record<string, QualityFile> = QUALITY_FILES): QualityEntry | null {
  const q = files[targetId]?.entries[entryId];
  return q && Number.isInteger(q.s) && q.s >= 1 && q.s <= 5 ? q : null;
}

export const rankedAt = (targetId: string, files: Record<string, QualityFile> = QUALITY_FILES): string | null => files[targetId]?.rankedAt ?? null;

// the evidence behind one rating, one plain sentence each, most decisive first: what capped it, then what the reading and the reuse said
export function evidenceLines(q: QualityEntry): string[] {
  const out: string[] = [];
  if (q.x) out.push('It repeats another saved entry.');
  if (q.c) out.push('A one-line automatic tactic proves it, which caps it at one star.');
  else if (q.l) out.push('One existing lemma proves it, which caps it at two stars.');
  if (q.n) out.push('It is a numeric fact with no variable in it, which caps it at two stars.');
  if (q.m) out.push('The reader says Mathlib already has it, which caps it at two stars.');
  if (q.v) out.push('Its hypotheses look unsatisfiable, which caps it at one star.');
  if (q.t) out.push('It states the target from smaller hypotheses.');
  if (q.d != null && q.g != null && q.w != null) out.push(`Reader: depth ${q.d.toFixed(1)} of 5, generality ${q.g.toFixed(1)} of 5, worth to the target ${q.w.toFixed(1)} of 3.`);
  out.push(q.u === 0 ? 'No other saved entry rests on it.' : `${q.u} other saved ${q.u === 1 ? 'entry rests' : 'entries rest'} on it.`);
  return out;
}

// a short line for the modal's header: how many of the saved entries have a rating
export function ratedSummary(targetId: string, entryIds: string[], files: Record<string, QualityFile> = QUALITY_FILES): { rated: number; total: number } {
  return { rated: entryIds.filter((id) => qualityOf(targetId, id, files)).length, total: entryIds.length };
}
