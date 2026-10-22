import collatz from './collatz.json';
import erdos396 from './erdos-396.json';

// A written line of attack for a target: a chain of steps, each saying what it claims and why it follows (or might).
// 'holds' follows from the steps before it; 'repaired' is a step whose first version fails, in the version that holds;
// 'hole' is claimed but not established, and says what is settled and what to try. `lean` names verified theorems among
// the target's seeds. It is NOT in the opening prompt: the bridge hands it over only when the agent is reminded to keep
// going (public/leak-memory.mjs, cleanGuide/renderGuide; docs/leak-memory.md).
export interface LeakGuideStep {
  id: string;
  tag: 'holds' | 'repaired' | 'hole';
  title: string;
  says: string;
  why?: string;
  fill?: string;
  lean?: string[];
}
export interface LeakGuide {
  intro?: string;
  notation?: string;
  steps: LeakGuideStep[];
  next?: string[];
}

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
  guide?: LeakGuide;
}

export const LEAK_TARGETS: LeakTarget[] = [erdos396 as LeakTarget, collatz as LeakTarget];

export function findLeakTarget(id: string | null | undefined): LeakTarget | undefined {
  return LEAK_TARGETS.find((t) => t.id === id);
}
