import erdos396 from './erdos-396.json';

// The roadmap of things Leak can be pointed at. A target is one self-contained Lean statement with the evidence
// that it says what it claims to say (where the formalisation comes from, what it was compared against). Memory
// (the theorems a run proved on the way) is kept per signed-in account and per target id, so ids must not change.
export interface LeakTarget {
  id: string;
  title: string;
  short: string;
  kind: 'open-problem' | 'benchmark';
  status: string;
  statement: string;
  // 'yes-no': the statement asks a question whose answer is open, and a proof of its negation settles it too
  // (formal-conjectures' @[question] convention). The statement itself is the plain proposition, never a free slot.
  question?: 'yes-no';
  informal: string;
  direction: string;
  provenance: Record<string, unknown>;
  checks: Record<string, unknown>;
  seeds: string[];
}

export const LEAK_TARGETS: LeakTarget[] = [erdos396 as LeakTarget];

export function findLeakTarget(id: string | null | undefined): LeakTarget | undefined {
  return LEAK_TARGETS.find((t) => t.id === id);
}
