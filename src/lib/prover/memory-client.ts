import type { MemoryFrame } from './run-prover-stream';

// Client side of Leak's memory (the Control II variants). A saved theorem is a compile-ready closure the bridge verified
// on Leak IV during a run; the bridge keeps nothing between runs, so the browser holds the signed-in account's entries,
// sends them with each run, and persists the frames the run emits. See src/app/lib/data/leak-memory.ts for the table.

export interface MemoryEntry {
  id: string;
  name: string;
  kind: string;
  statement: string;
  closure: string;
  origin: string;
  savedAt: string;
  attempt: number | null;
  isTarget: boolean;
  nominated: boolean;
  subsumes: string[];
  subsumedBy: string | null;
  hits: number;
  // the star rating the sleep stage gave it (numbers and flags; see src/data/leak-quality)
  quality?: import('@/data/leak-quality').QualityEntry | null;
}

export interface MemoryVariant {
  key: string;
  label: string;
  blurb: string;
}

// Names match STRATEGIES in public/local-claude-bridge.mjs and VARIANTS in public/leak-memory.mjs.
export const MEMORY_VARIANTS: MemoryVariant[] = [
  { key: 'control-honoured', label: 'Control II Honoured', blurb: 'a library of verified theorems and a recall tool; the agent decides when to look' },
  { key: 'control-flint', label: 'Control II Flint', blurb: 'no tool: the most recent verified theorems are replayed into each fresh attempt' },
  { key: 'control-paragon', label: 'Control II Paragon', blurb: 'the library is also folded into the search results the agent already reads' },
  { key: 'control-lucid', label: 'Control II Lucid', blurb: 'Honoured, plus an hourly pass that merges the library into fewer, more general lemmas and gives every saved theorem a one-to-five star rating' },
  // The same four with Leak II (Pantograph) added to the agent's tools, as Control IV is Control II plus Leak II.
  { key: 'control-honoured-iv', label: 'Control IV Honoured', blurb: 'Honoured, plus Leak II: the agent can step a goal one tactic at a time' },
  { key: 'control-flint-iv', label: 'Control IV Flint', blurb: 'Flint, plus Leak II: the agent can step a goal one tactic at a time' },
  { key: 'control-paragon-iv', label: 'Control IV Paragon', blurb: 'Paragon, plus Leak II: the agent can step a goal one tactic at a time' },
  { key: 'control-lucid-iv', label: 'Control IV Lucid', blurb: 'Lucid, plus Leak II: the agent can step a goal one tactic at a time' },
];

export const isMemoryStrategy = (s: string) => MEMORY_VARIANTS.some((v) => v.key === s);

// The bridge reads a 2 MB body; the rest of the request is small, so entries get at most this much. Nominated and most
// used theorems go first, then the newest.
export const MEMORY_BYTES_PER_RUN = 1_200_000;

export function packMemory(entries: MemoryEntry[], maxBytes = MEMORY_BYTES_PER_RUN): MemoryEntry[] {
  const ranked = [...entries]
    .filter((e) => !e.subsumedBy || e.nominated) // merged into a more general lemma: hidden, unless the account nominated it
    .sort((a, b) => Number(b.nominated) - Number(a.nominated) || b.hits - a.hits || Date.parse(b.savedAt) - Date.parse(a.savedAt));
  const out: MemoryEntry[] = [];
  let used = 0;
  for (const e of ranked) {
    const size = e.closure.length + e.statement.length + 400;
    if (used + size > maxBytes) continue;
    out.push(e);
    used += size;
  }
  return out;
}

// Fold one `memory` frame into the list. save/update replace by id (the bridge only emits an update when the proof got
// shorter or the entry was merged); nominate flips the flag.
export function applyMemoryFrame(entries: MemoryEntry[], frame: MemoryFrame): MemoryEntry[] {
  if (frame.op === 'save' || frame.op === 'update') {
    const e = frame.entry as unknown as MemoryEntry;
    if (!e?.id) return entries;
    const prior = entries.find((x) => x.id === e.id);
    const next: MemoryEntry = { ...e, nominated: prior?.nominated ?? false };
    return prior ? entries.map((x) => (x.id === e.id ? next : x)) : [next, ...entries];
  }
  if (frame.op === 'nominate') return entries.map((x) => (x.id === frame.id ? { ...x, nominated: frame.nominated } : x));
  return entries;
}

export type MemoryApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(url: string, init?: RequestInit): Promise<MemoryApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: String(j?.error ?? j?.reason ?? res.statusText) };
    return { ok: true, data: j as T };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

export const loadMemory = (target: string) =>
  call<{ entries: MemoryEntry[]; limits: { maxNominated: number; minNominatedForAudit: number } }>(`/api/leak/memory?target=${encodeURIComponent(target)}`);

export const saveMemoryEntries = (target: string, entries: MemoryEntry[]) =>
  call<{ saved: number; skipped: number }>('/api/leak/memory', { method: 'POST', body: JSON.stringify({ target, entries }) });

export const setMemoryNominated = (target: string, id: string, nominated: boolean) =>
  call<{ ok: boolean; reason?: string; nominated: number }>('/api/leak/memory', { method: 'PATCH', body: JSON.stringify({ target, id, nominated }) });

export const deleteMemoryEntry = (target: string, id: string) =>
  call<{ deleted: boolean }>(`/api/leak/memory?target=${encodeURIComponent(target)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
