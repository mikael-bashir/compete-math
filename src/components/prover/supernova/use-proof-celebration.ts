'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { prewarmSupernova } from './renderer';

// Fires the proof supernova once each time a run goes from "not proved" to "proved". `proved` is whatever the page knows: a `verified` event
// on the stream, or an outcome that says so. A run that starts clears its events, which clears `proved`, so the next proof plays again.
// `replay` plays it again on demand (the preview page).
export function useProofCelebration(proved: boolean) {
  const [playId, setPlayId] = useState(0);
  const was = useRef(false);
  useEffect(() => {
    if (proved && !was.current) setPlayId((n) => n + 1);
    was.current = proved;
  }, [proved]);
  const replay = useCallback(() => setPlayId((n) => n + 1), []);

  // compile the shaders now, on an idle tick, so that the proof does not wait for the driver
  useEffect(() => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => prewarmSupernova(), { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prewarmSupernova, 1500);
    return () => window.clearTimeout(id);
  }, []);
  return { playId, replay };
}

// the theorem's name for the line under the word, read off the statement the run was given
export function theoremNameOf(statement: string | undefined | null): string | undefined {
  const m = /\b(?:theorem|lemma)\s+([A-Za-z0-9_'.]+)/.exec(statement || '');
  return m?.[1];
}
