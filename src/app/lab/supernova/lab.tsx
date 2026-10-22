'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Maximize2 } from 'lucide-react';

import { ProofSupernova } from '@/components/prover/supernova/proof-supernova';
import { useProofCelebration } from '@/components/prover/supernova/use-proof-celebration';
import { DETONATION_S, TOTAL_S } from '@/components/prover/supernova/timeline';
import { ProverConsole } from '@/components/prover/prover-console';
import type { ProverEvent, ProverEventKind } from '@/lib/prover/types';

// What a run looks like, up to the proof: the shape of the events the playground gets from the bridge (a short invented run on a small
// theorem; the point is the moment the last one arrives).
const THEOREM = 'theorem sum_two_odds_even (a b : ℕ) (ha : Odd a) (hb : Odd b) : Even (a + b) := by\n  exact Nat.odd_add_odd ha hb';
const RUN: { after: number; kind: ProverEventKind; label: string; extra?: Partial<ProverEvent> }[] = [
  { after: 300, kind: 'received', label: 'Problem received by prover' },
  { after: 900, kind: 'system', label: 'claude-sonnet-5-5 · Leak I, Leak IV', extra: { detail: 'tools: loogle_search, moogle_search, verify_full_script' } },
  { after: 800, kind: 'text', label: 'Asking the tree what it already knows about the sum of two odd numbers.' },
  { after: 700, kind: 'tool_call', label: 'mcp__Leak_I__loogle_search', extra: { tool: 'mcp__Leak_I__loogle_search', input: 'Odd _ → Odd _ → Even (_ + _)' } },
  { after: 900, kind: 'tool_result', label: 'loogle: 3 hits', extra: { tool: 'mcp__Leak_I__loogle_search', detail: 'Nat.odd_add_odd : Odd m → Odd n → Even (m + n)' } },
  { after: 800, kind: 'text', label: 'Nat.odd_add_odd is the statement. One line.' },
  { after: 700, kind: 'tool_call', label: 'mcp__Leak_IV__verify_full_script', extra: { tool: 'mcp__Leak_IV__verify_full_script', input: THEOREM } },
  { after: 1500, kind: 'tool_result', label: 'Compilation Successful', extra: { tool: 'mcp__Leak_IV__verify_full_script', detail: '✅ Compilation Successful! The proof is 100% verified.' } },
  { after: 500, kind: 'verified', label: 'Proof verified by the guardrail', extra: { verified: true, proof: THEOREM } },
];

const fmt = (s: number) => `${s.toFixed(2)} s`;

export function SupernovaLab() {
  // ---- the stage: replay and scrub
  const [playId, setPlayId] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null);
  const [figure, setFigure] = useState(true);
  const [clock, setClock] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (scrub != null) return;
    startedAt.current = performance.now();
    let raf = 0;
    const tick = () => {
      const T = (performance.now() - startedAt.current) / 1000;
      setClock(Math.min(T, TOTAL_S));
      if (T < TOTAL_S) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playId, scrub]);
  const replay = () => {
    setScrub(null);
    setPlayId((n) => n + 1);
  };

  // ---- full-screen, exactly as the playground plays it
  const [fullId, setFullId] = useState(0);

  // ---- a replayed run: the console fills, the proof lands, the overlay fires through the same hook the playground uses
  const [events, setEvents] = useState<ProverEvent[]>([]);
  const [running, setRunning] = useState(false);
  const timers = useRef<number[]>([]);
  const proved = events.some((e) => e.kind === 'verified');
  const celebration = useProofCelebration(proved);
  const stopRun = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  const replayRun = useCallback(() => {
    stopRun();
    setEvents([]);
    setRunning(true);
    let at = 0;
    RUN.forEach((step, i) => {
      at += step.after;
      timers.current.push(
        window.setTimeout(() => {
          setEvents((prev) => [...prev, { id: i + 1, ts: Date.now(), kind: step.kind, label: step.label, ...step.extra }]);
          if (i === RUN.length - 1) setRunning(false);
        }, at),
      );
    });
  }, [stopRun]);
  useEffect(() => stopRun, [stopRun]);

  const T = scrub ?? clock;
  const phase = T < DETONATION_S ? 'the quiet before' : T < DETONATION_S + 0.4 ? 'detonation' : T < 6.2 ? 'the blast wave (R ∝ t^(2/5))' : T < 9.4 ? 'the remnant' : 'the sky lets go';

  return (
    <main className="min-h-screen bg-[#07080d] px-4 pb-8 pt-28 text-zinc-200 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500">preview · not shipped to production</p>
          <h1 className="text-3xl font-semibold text-white">The proof supernova</h1>
          <p className="max-w-3xl text-sm text-zinc-400">
            What plays when a target is proved, in place of “no sorry left”. A star collapses, goes off, and the blast wave runs out at the Sedov–Taylor rate (radius ∝ t^(2/5)),
            so it leaps out and then slows, which is what reads as enormous. The speck of a figure at the start is the scale. Click or press Esc in the full-screen version to close it.
          </p>
        </header>

        <section className="space-y-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
            <ProofSupernova playId={playId} mode="inline" time={scrub} figure={figure} title="sum_two_odds_even" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={replay} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15">
              <RotateCcw className="size-4" /> Replay
            </button>
            <button onClick={() => setFullId((n) => n + 1)} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">
              <Maximize2 className="size-4" /> Full screen
            </button>
            <label className="ml-2 inline-flex items-center gap-2 text-sm text-zinc-400">
              <input type="checkbox" checked={figure} onChange={(e) => setFigure(e.target.checked)} /> speck of a figure, for scale
            </label>
            <span className="ml-auto font-mono text-xs text-zinc-500">
              {fmt(T)} · {phase}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={TOTAL_S}
              step={0.01}
              value={T}
              onChange={(e) => setScrub(Number(e.target.value))}
              className="w-full accent-red-500"
              aria-label="Scrub the animation"
            />
            {scrub != null && (
              <button onClick={replay} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10">
                <Play className="size-3.5" /> play from here
              </button>
            )}
          </div>
          <p className="font-mono text-[11px] text-zinc-600">detonation at {DETONATION_S} s · total {TOTAL_S} s · scrub to any frame; it is drawn exactly, not interpolated</p>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-medium text-white">Replay a run</h2>
            <button onClick={replayRun} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15">
              <Play className="size-4" /> {events.length ? 'Replay run' : 'Start the run'}
            </button>
            <span className="text-xs text-zinc-500">the console fills with a short invented run; when the proof lands the overlay plays, through the same hook the playground uses</span>
          </div>
          <ProverConsole events={events} running={running} title="Replayed run" emptyHint="Press “Start the run”." />
        </section>
      </div>

      <ProofSupernova playId={fullId} title="sum_two_odds_even" figure={figure} />
      <ProofSupernova playId={celebration.playId} title="sum_two_odds_even" figure={figure} />
    </main>
  );
}
