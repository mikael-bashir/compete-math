// Turns the prover's event stream into universe events: which tool was called, what it asked, which stars came back, whether a compile passed.
// The stream sends a call and, later, its result as separate events with no id linking them, so results are matched to the oldest call of the
// kind their text belongs to (the same way the recorded replays were built).

import type { ToolEventKind, UniverseEvent, UniverseEventKind } from './types';
import { NameIndex, extractNames, resultNames } from './names';

/** The part of a prover event this module needs (a ProverEvent satisfies it). */
export interface ProverEventLike {
  kind: string;
  tool?: string;
  input?: string;
  detail?: string;
  verified?: boolean;
}

export type Vec3 = [number, number, number];

export interface UniverseSink {
  start(ev: UniverseEvent): UniverseEvent;
  finish(ev: UniverseEvent, patch: Partial<UniverseEvent>): void;
  /** where a star sits, so an ambiguous name can resolve to the one nearest the driver's attention */
  starAt(i: number): Vec3;
  attention(): Vec3;
  verified(ok: boolean): void;
  /** how many theorems the memory holds now (it sizes the orb) */
  memorySize?(n: number): void;
}

const TOO_GENERIC = 12;

export function classifyTool(tool: string | undefined): UniverseEventKind | null {
  const t = (tool ?? '').toLowerCase();
  if (t.includes('loogle')) return 'loogle';
  if (t.includes('moogle')) return 'moogle';
  if (t.includes('memory_recall') || t.includes('memory_list')) return 'recall';
  if (t.includes('verify_full_script') || t.includes('lean_compile') || t.endsWith('compile')) return 'compile';
  return null;
}

// What the memory tools say back (public/leak-memory.mjs): a recall, a list, or an empty library.
const MEMORY_RESULT = /verified theorem\(s\) from this target's memory|No saved theorem matches|Memory is empty for this target|verified theorem\(s\) saved \(showing/;

/** How many saved theorems a memory tool's reply holds (0 for an empty or missed recall). */
export function memoryCount(body: string): number {
  const m = /(\d+) verified theorem\(s\) (?:from this target's memory|saved \(showing)/.exec(body);
  return m ? Number(m[1]) : 0;
}

/** Saved theorems a search result carries under Paragon's MEMORY heading, 0 when it has none. */
export function injectedCount(body: string): number {
  const i = body.indexOf('\u2014 MEMORY:');
  if (i < 0) return 0;
  return Math.max(1, (body.slice(i).match(/^(?:theorem|lemma)\b/gm) ?? []).length);
}

export function classifyResult(body: string, pending: Record<ToolEventKind, unknown[]>): UniverseEventKind {
  if (MEMORY_RESULT.test(body)) return 'recall';
  if (/Compilation|LEAK_NORMALIZED|"result"\s*:/.test(body)) return 'compile';
  if (/semantically related/.test(body) || (/Search allowance/.test(body) && pending.moogle.length > 0 && pending.loogle.length === 0)) return 'moogle';
  return 'loogle';
}

export function parseInput(input: unknown): { query?: string; script?: string } {
  let o: unknown = input;
  if (typeof input === 'string') {
    try {
      o = JSON.parse(input);
    } catch {
      return { script: input };
    }
  }
  if (!o || typeof o !== 'object') return {};
  const r = o as Record<string, unknown>;
  const q = r.query ?? r.concept;
  const s = r.script ?? r.code;
  return { query: typeof q === 'string' ? q.slice(0, 90) : undefined, script: typeof s === 'string' ? s : undefined };
}

export function compileOutcome(body: string): { ok: boolean; unk: string[] } {
  const ok = /success/i.test(body) && !/\u274c/.test(body) && !/\bfail/i.test(body);
  const unk = [...body.matchAll(/Unknown (?:constant|identifier) `([^`]+)`/g)].map((m) => m[1]).slice(0, 4);
  return { ok, unk };
}

export class LiveInterpreter {
  private readonly pending: Record<UniverseEventKind, UniverseEvent[]> = { loogle: [], moogle: [], compile: [], recall: [], save: [] };

  constructor(
    private readonly names: NameIndex,
    private readonly sink: UniverseSink,
  ) {}

  /** Star indices for lemma names; an ambiguous name takes the candidate nearest the driver's attention, a far too common one is dropped. */
  resolve(names: string[], cap = 40): number[] {
    return this.resolveNamed(names, cap).map((r) => r.id);
  }

  resolveNamed(names: string[], cap = 40): { id: number; name: string }[] {
    const ref = this.sink.attention();
    const out: { id: number; name: string }[] = [];
    const seen = new Set<number>();
    for (const n of names) {
      const cands = this.names.find(n);
      if (!cands.length || cands.length > TOO_GENERIC) continue;
      let best = cands[0];
      if (cands.length > 1) {
        let bd = Infinity;
        for (const c of cands) {
          const p = this.sink.starAt(c);
          const d = Math.hypot(p[0] - ref[0], p[1] - ref[1], p[2] - ref[2]);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
      }
      if (!seen.has(best)) {
        seen.add(best);
        out.push({ id: best, name: n });
        if (out.length >= cap) break;
      }
    }
    return out;
  }

  /** The memory itself changed (a theorem saved, the library loaded or counted): a spark, and the orb's size. */
  memory(op: 'save' | 'update' | 'load' | 'stats', size?: number): void {
    if (op === 'save') this.sink.finish(this.sink.start({ k: 'save', t: 0 }), {});
    if (typeof size === 'number') this.sink.memorySize?.(size);
  }

  handle(e: ProverEventLike): void {
    if (e.kind === 'tool_call') {
      const k = classifyTool(e.tool);
      if (!k) return;
      const { query, script } = parseInput(e.input);
      const ev: UniverseEvent = { k, t: 0, q: query };
      if (k === 'compile' && script) ev.used = this.resolve(extractNames(script), 18);
      this.pending[k].push(this.sink.start(ev));
    } else if (e.kind === 'tool_result' || e.kind === 'tool_error') {
      const body = e.detail ?? '';
      const k = classifyResult(body, this.pending);
      const ev = this.pending[k].shift() ?? this.pending.loogle.shift() ?? this.pending.moogle.shift() ?? this.pending.compile.shift();
      if (!ev) return;
      if (ev.k === 'recall') this.sink.finish(ev, { n: memoryCount(body) });
      else if (ev.k === 'compile') this.sink.finish(ev, compileOutcome(body));
      else if (/Search allowance/.test(body)) this.sink.finish(ev, { blocked: true, hits: [] });
      else {
        const named = this.resolveNamed(resultNames(body), 40);
        this.sink.finish(ev, { hits: named.map((r) => r.id), hn: named.map((r) => r.name) });
        // Paragon folds the library into a search result: that is a recall too
        const inj = injectedCount(body);
        if (inj) this.sink.finish(this.sink.start({ k: 'recall', t: 0 }), { n: inj });
      }
    } else if (e.kind === 'verified') {
      this.sink.verified(true);
    } else if (e.kind === 'rejected') {
      this.sink.verified(false);
    }
  }
}
