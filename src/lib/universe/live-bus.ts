// A tiny pub/sub between the prover playground (which receives the run's events) and the universe visualiser (which draws them),
// so neither imports the other.

import type { ProverEventLike } from './events';

export type MemoryOp = 'save' | 'update' | 'load' | 'stats';
export type LiveMessage = { type: 'reset' } | { type: 'end' } | { type: 'event'; event: ProverEventLike } | { type: 'memory'; op: MemoryOp; size?: number };
type Listener = (m: LiveMessage) => void;

const listeners = new Set<Listener>();

export function publishRunReset(): void {
  for (const l of listeners) l({ type: 'reset' });
}

export function publishRunEnd(): void {
  for (const l of listeners) l({ type: 'end' });
}

export function publishProverEvent(event: ProverEventLike): void {
  for (const l of listeners) l({ type: 'event', event });
}

/** The memory saved a theorem, was loaded, or reported how many it holds. */
export function publishMemory(op: MemoryOp, size?: number): void {
  for (const l of listeners) l({ type: 'memory', op, size });
}

export function subscribeLive(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
