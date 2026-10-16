'use client';

// "Load visualiser": the Tengoku universe on the Leak page. The engine and its ~7.5 MB of data are fetched only when asked for. Once loaded it
// plays recorded runs, and when a prover run starts below it switches to live and draws that run's searches and verifications as they happen.

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { UNIVERSE_LEGEND } from '@/lib/universe/legend';
import { subscribeLive } from '@/lib/universe/live-bus';
import type { Universe } from '@/lib/universe/engine';

type State = 'idle' | 'loading' | 'ready' | 'error';

export function LeakUniverse() {
  const host = useRef<HTMLDivElement>(null);
  const universe = useRef<Universe | null>(null);
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');
  const [fraction, setFraction] = useState(0);
  const [count, setCount] = useState(0);

  const close = useCallback(() => {
    universe.current?.destroy();
    universe.current = null;
    setState('idle');
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    setMessage('Starting');
    try {
      const [{ Universe: Engine }, { loadUniverse }] = await Promise.all([import('@/lib/universe/engine'), import('@/lib/universe/load')]);
      const data = await loadUniverse('/universe', (m, f) => {
        setMessage(m);
        setFraction(f);
      });
      if (!host.current) return;
      universe.current?.destroy();
      universe.current = new Engine(host.current, data, { mode: 'replay' });
      setCount(data.meta.n);
      setState('ready');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong');
      setState('error');
    }
  }, []);

  // a prover run below drives the visualiser while it is open
  useEffect(
    () =>
      subscribeLive((m) => {
        const u = universe.current;
        if (!u) return;
        if (m.type === 'reset') {
          u.setMode('live');
          u.resetLive();
        } else u.pushProverEvent(m.event);
      }),
    [],
  );
  useEffect(() => () => universe.current?.destroy(), []);

  return (
    <div className="not-prose">
      <div className="flex flex-wrap items-center gap-2">
        {state !== 'ready' && (
          <Button size="sm" onClick={load} disabled={state === 'loading'} className="h-7 px-3 text-xs">
            {state === 'loading' ? `${message}…` : 'Load visualiser'}
          </Button>
        )}
        {state === 'ready' && (
          <Button variant="outline" size="sm" onClick={close} className="h-7 px-3 text-xs">
            Close visualiser
          </Button>
        )}
        {state === 'idle' && <span className="text-xs text-white/50">about 7.5 MB, loaded only when you ask</span>}
        {state === 'loading' && (
          <span className="h-1 w-40 overflow-hidden rounded bg-white/10" aria-hidden>
            <span className="block h-full bg-amber-300 transition-all" style={{ width: `${Math.round(fraction * 100)}%` }} />
          </span>
        )}
        {state === 'error' && <span className="text-xs text-rose-300">Could not start the visualiser: {message}. It needs WebGL 2.</span>}
      </div>
      <div
        ref={host}
        className={state === 'ready' ? 'mt-4 h-[72vh] min-h-[420px] overflow-hidden rounded-lg border border-white/10' : 'hidden'}
      />
      {state === 'ready' && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] leading-relaxed text-white/50">
          <span>
            <b className="font-semibold text-white/80">{count.toLocaleString()}</b> trusted theorems · every star one Leak can use while proving, every cluster a library
          </span>
          {UNIVERSE_LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <i className="inline-block size-2 rounded-full" style={{ background: l.color }} aria-hidden />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
