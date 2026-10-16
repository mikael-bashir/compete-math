// A tiny pub/sub between the prover playground (which receives the run's events) and the universe visualiser (which draws them),
// so neither imports the other.

import type { ProverEventLike } from './events';

export type LiveMessage = { type: 'reset' } | { type: 'event'; event: ProverEventLike };
type Listener = (m: LiveMessage) => void;

const listeners = new Set<Listener>();

export function publishRunReset(): void {
  for (const l of listeners) l({ type: 'reset' });
}

export function publishProverEvent(event: ProverEventLike): void {
  for (const l of listeners) l({ type: 'event', event });
}

export function subscribeLive(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
