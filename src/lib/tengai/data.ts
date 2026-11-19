// What the Tengai page reads: the index of anomalous-archangel's drips and its queue of proof requests, both plain JSON committed to
// competemath/tengai (docs/anomalous-archangel.md there says what is in them). Everything read from the network is parsed here, field by field,
// into bounded plain strings and numbers: the page renders text, never markup, and a file that is not what it should be becomes an empty list.

export const TENGAI_REPO = 'competemath/tengai';
export const TENGAI_URL = `https://github.com/${TENGAI_REPO}`;
// TENGAI_RAW_BASE: where the two files are read from (a local folder served over http, to look at the page with data in it)
const RAW = process.env.TENGAI_RAW_BASE || `https://raw.githubusercontent.com/${TENGAI_REPO}/main`;
export const INDEX_URL = `${RAW}/drips/index.json`;
export const REQUESTS_URL = `${RAW}/drips/requests.json`;
export const WORKFLOW_URL = `${TENGAI_URL}/actions/workflows/drip.yml`;
export const RUN_COMMAND = `gh workflow run drip.yml -R ${TENGAI_REPO} -f budget_usd=8`;
export const DRY_RUN_COMMAND = `gh workflow run drip.yml -R ${TENGAI_REPO} -f dry_run=true`;
const MAX_BYTES = 2_000_000;

export const LABELS = ['note', 'observation', 'conjecture'] as const;
export type Label = (typeof LABELS)[number];

export interface Finding {
  kind: string;
  label: Label;
  title: string;
  lens: string;
}
export interface Drip {
  id: string;
  started: string;
  mode: 'live' | 'dry';
  summary: string;
  findings: number;
  landed: number;
  requests: number;
  refused: number;
  spentUsd: number;
  modules: number;
  theorems: number;
  lenses: string[];
  top: Finding[];
  landedPaths: string[];
  reportUrl: string;
}
export interface TengaiIndex {
  updated: string | null;
  modules: number;
  theorems: number;
  openRequests: number;
  drips: Drip[];
}
export interface ProofRequest {
  id: string;
  statement: string;
  informal: string;
  why: string;
  status: 'open' | 'claimed' | 'proved' | 'abandoned' | 'unchecked';
  lens: string;
  drip: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const SAFE_ID = /^[0-9A-Za-z._-]{1,80}$/;

export function parseIndex(raw: unknown): TengaiIndex {
  const empty: TengaiIndex = { updated: null, modules: 0, theorems: 0, openRequests: 0, drips: [] };
  if (!isObj(raw)) return empty;
  const tree = isObj(raw.tree) ? raw.tree : {};
  const drips: Drip[] = [];
  for (const d of arr(raw.drips, 30)) {
    if (!isObj(d) || typeof d.id !== 'string' || !SAFE_ID.test(d.id)) continue;
    const counts = isObj(d.counts) ? d.counts : {};
    const t = isObj(d.tree) ? d.tree : {};
    const top: Finding[] = [];
    for (const f of arr(d.top, 6)) {
      if (!isObj(f)) continue;
      const label = LABELS.find((l) => l === f.label);
      if (!label || !str(f.title, 160)) continue; // a claim without a known label is not shown
      top.push({ kind: str(f.kind, 24), label, title: str(f.title, 160), lens: str(f.lens, 24) });
    }
    drips.push({
      id: d.id,
      started: str(d.started, 40),
      mode: d.mode === 'dry' ? 'dry' : 'live',
      summary: str(d.summary, 600),
      findings: num(counts.findings),
      landed: num(counts.landed),
      requests: num(counts.requests),
      refused: num(counts.spawn_refused),
      spentUsd: num(d.spent_usd),
      modules: num(t.modules),
      theorems: num(t.theorems),
      lenses: arr(d.lenses, 8).map((x) => str(x, 24)).filter(Boolean),
      top,
      landedPaths: arr(d.landed, 10).map((x) => str(x, 120)).filter(Boolean),
      reportUrl: `${TENGAI_URL}/blob/main/drips/${d.id}/report.md`,
    });
  }
  return {
    updated: typeof raw.updated === 'string' ? raw.updated.slice(0, 40) : null,
    modules: num(tree.modules),
    theorems: num(tree.theorems),
    openRequests: num(raw.open_requests),
    drips,
  };
}

const STATUSES = ['open', 'claimed', 'proved', 'abandoned', 'unchecked'] as const;
export function parseRequests(raw: unknown): ProofRequest[] {
  if (!isObj(raw)) return [];
  const out: ProofRequest[] = [];
  for (const r of arr(raw.requests, 400)) {
    if (!isObj(r) || typeof r.id !== 'string' || !SAFE_ID.test(r.id)) continue;
    const status = STATUSES.find((s) => s === r.status);
    const statement = str(r.statement, 600);
    if (!status || !statement) continue;
    out.push({ id: r.id, statement, informal: str(r.informal, 300), why: str(r.why, 300), status, lens: str(r.lens, 24), drip: str(r.drip, 80) });
  }
  return out;
}

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

async function getJson(url: string): Promise<Loaded<unknown>> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return { ok: true, data: null }; // nothing published yet is not an error
    if (!res.ok) return { ok: false, error: `GitHub answered ${res.status}` };
    const text = await res.text();
    if (text.length > MAX_BYTES) return { ok: false, error: 'the file is larger than the page reads' };
    return { ok: true, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'unreachable' };
  }
}

export async function loadIndex(): Promise<Loaded<TengaiIndex>> {
  const r = await getJson(INDEX_URL);
  return r.ok ? { ok: true, data: parseIndex(r.data) } : r;
}

export async function loadRequests(): Promise<Loaded<ProofRequest[]>> {
  const r = await getJson(REQUESTS_URL);
  return r.ok ? { ok: true, data: parseRequests(r.data) } : r;
}
