import type { SqlTag } from '../db/sql-tag';

// The memory of Leak's Control II variants: verified theorems a run proved on the way to a target. One row per (account, target,
// statement). Every query is filtered by the account's username, so nothing an account saved is visible to another account; only
// what an account nominates AND that clears the Tengoku audit ever leaves its rows. The store takes the database as a parameter so
// tests/leak-memory/store.test.ts runs it against a real Postgres (PGlite); data/leak-memory.ts wires in the real one.

export const MAX_ENTRIES_PER_TARGET = 600;
export const MAX_ENTRIES_PER_ACCOUNT = 3000;
export const MAX_NOMINATED = 10;
export const MIN_NOMINATED_FOR_AUDIT = 3;
const MAX_STATEMENT = 20_000;
const MAX_CLOSURE = 60_000;
const ORIGINS = ['verified', 'abstracted', 'saved'];

// The rating the sleep stage gives a theorem (public/leak-quality.mjs): numbers and flags only. Anything else in it is dropped.
export interface Quality {
  s: number;
  u: number;
  d?: number;
  g?: number;
  w?: number;
  k?: string;
  c?: 1;
  l?: 1;
  n?: 1;
  m?: 1;
  v?: 1;
  x?: 1;
  t?: 1;
  r?: string;
  rv?: number;
}
const KINDS = ['numeric-instance', 'special-case', 'reformulation', 'general-lemma', 'structural', 'reduction', 'other'];
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10) / 10 : undefined);

export function cleanQuality(raw: unknown): Quality | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.s !== 'number' || !Number.isInteger(r.s) || r.s < 1 || r.s > 5) return null;
  const q: Quality = { s: r.s, u: typeof r.u === 'number' && Number.isInteger(r.u) && r.u >= 0 ? Math.min(r.u, 1e6) : 0 };
  const d = num(r.d, 1, 5);
  const g = num(r.g, 1, 5);
  const w = num(r.w, 0, 3);
  if (d !== undefined) q.d = d;
  if (g !== undefined) q.g = g;
  if (w !== undefined) q.w = w;
  if (typeof r.k === 'string' && KINDS.includes(r.k)) q.k = r.k;
  for (const f of ['c', 'l', 'n', 'm', 'v', 'x', 't'] as const) if (r[f] === 1) q[f] = 1;
  if (typeof r.r === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.r)) q.r = r.r;
  if (typeof r.rv === 'number' && Number.isInteger(r.rv) && r.rv >= 1 && r.rv < 1000) q.rv = r.rv;
  return q;
}

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
  quality?: Quality | null;
}

export interface Limits {
  perTarget: number;
  perAccount: number;
  nominated: number;
}
const DEFAULT_LIMITS: Limits = { perTarget: MAX_ENTRIES_PER_TARGET, perAccount: MAX_ENTRIES_PER_ACCOUNT, nominated: MAX_NOMINATED };

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const HEX = /^[0-9a-f]{8,64}$/;

// Accept only what the bridge's memory module produces; anything else is dropped rather than stored. The project's own seed lemmas
// are never stored (the bridge does not emit them), and a caller that sends one anyway is refused.
export function cleanEntry(raw: unknown): MemoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 64);
  const statement = str(r.statement, MAX_STATEMENT);
  const closure = str(r.closure, MAX_CLOSURE + 1);
  if (!HEX.test(id) || !statement.trim() || !closure.trim() || closure.length > MAX_CLOSURE) return null;
  if (/\b(sorry|admit)\b/.test(closure)) return null;
  const origin = str(r.origin, 40) || 'verified';
  if (!ORIGINS.includes(origin)) return null;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && HEX.test(x)).slice(0, 50) : []);
  return {
    id,
    name: str(r.name, 200) || id.slice(0, 8),
    kind: r.kind === 'lemma' ? 'lemma' : 'theorem',
    statement,
    closure,
    origin,
    savedAt: typeof r.savedAt === 'string' && !Number.isNaN(Date.parse(r.savedAt)) ? r.savedAt : new Date().toISOString(),
    attempt: typeof r.attempt === 'number' && Number.isFinite(r.attempt) ? Math.trunc(r.attempt) : null,
    isTarget: r.isTarget === true,
    nominated: false, // never taken from the caller; see setNominated
    subsumes: ids(r.subsumes),
    subsumedBy: typeof r.subsumedBy === 'string' && HEX.test(r.subsumedBy) ? r.subsumedBy : null,
    hits: typeof r.hits === 'number' && r.hits >= 0 ? Math.min(1e6, Math.trunc(r.hits)) : 0,
    quality: cleanQuality(r.quality),
  };
}

export function leakMemoryStore(db: SqlTag, limits: Partial<Limits> = {}) {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  let ready: Promise<void> | null = null;

  // Self-creating like the other tables here; /api/admin/migrate calls it too.
  const ensure = (): Promise<void> => {
    ready ??= (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS leak_memory (
          username TEXT NOT NULL,
          target_id TEXT NOT NULL,
          entry_id TEXT NOT NULL,
          entry JSONB NOT NULL,
          nominated BOOLEAN NOT NULL DEFAULT FALSE,
          saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (username, target_id, entry_id)
        )`;
      await db`CREATE INDEX IF NOT EXISTS idx_leak_memory_user_target ON leak_memory(username, target_id)`;
    })().catch((e) => {
      ready = null;
      throw e;
    });
    return ready;
  };

  const list = async (username: string, targetId: string): Promise<MemoryEntry[]> => {
    await ensure();
    const { rows } = await db`
      SELECT entry, nominated FROM leak_memory
      WHERE username = ${username} AND target_id = ${targetId}
      ORDER BY saved_at DESC, entry_id
      LIMIT ${lim.perTarget}`;
    return rows.map((r) => ({ ...(r.entry as MemoryEntry), nominated: !!r.nominated }));
  };

  // Insert or replace entries a run saved. The nominated flag stays whatever the account set; it is not part of the update.
  const save = async (username: string, targetId: string, raw: unknown[]): Promise<{ saved: number; skipped: number }> => {
    await ensure();
    const entries = raw.map(cleanEntry).filter((e): e is MemoryEntry => !!e);
    const { rows: cnt } = await db`
      SELECT
        COUNT(*) FILTER (WHERE target_id = ${targetId})::int AS here,
        COUNT(*)::int AS total
      FROM leak_memory WHERE username = ${username}`;
    let here = Number(cnt[0]?.here ?? 0);
    let total = Number(cnt[0]?.total ?? 0);
    let saved = 0;
    for (const e of entries) {
      const { rows: ex } = await db`SELECT 1 AS x FROM leak_memory WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${e.id}`;
      const isNew = ex.length === 0;
      if (isNew && (here >= lim.perTarget || total >= lim.perAccount)) continue;
      await db`
        INSERT INTO leak_memory (username, target_id, entry_id, entry)
        VALUES (${username}, ${targetId}, ${e.id}, ${JSON.stringify(e)}::jsonb)
        ON CONFLICT (username, target_id, entry_id)
        DO UPDATE SET entry = EXCLUDED.entry, updated_at = NOW()`;
      if (isNew) {
        here++;
        total++;
      }
      saved++;
    }
    return { saved, skipped: raw.length - saved };
  };

  const countNominated = async (username: string, targetId: string): Promise<number> => {
    const { rows } = await db`SELECT COUNT(*)::int AS n FROM leak_memory WHERE username = ${username} AND target_id = ${targetId} AND nominated`;
    return Number(rows[0]?.n ?? 0);
  };

  // Mark or unmark an entry as nominated for the Tengoku audit: at most `nominated` per target. The cap is checked inside the UPDATE,
  // so two requests at once cannot both slip past it.
  const setNominated = async (username: string, targetId: string, entryId: string, on: boolean): Promise<{ ok: boolean; reason?: string; nominated: number }> => {
    await ensure();
    if (on) {
      const { rows } = await db`
        UPDATE leak_memory SET nominated = TRUE, updated_at = NOW()
        WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${entryId}
          AND (nominated OR (SELECT COUNT(*) FROM leak_memory
                WHERE username = ${username} AND target_id = ${targetId} AND nominated) < ${lim.nominated})
        RETURNING entry_id`;
      if (rows.length) return { ok: true, nominated: await countNominated(username, targetId) };
      const { rows: ex } = await db`SELECT 1 AS x FROM leak_memory WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${entryId}`;
      return {
        ok: false,
        reason: ex.length ? `At most ${lim.nominated} theorems can be nominated per target.` : 'No such saved theorem.',
        nominated: await countNominated(username, targetId),
      };
    }
    const { rows } = await db`
      UPDATE leak_memory SET nominated = FALSE, updated_at = NOW()
      WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${entryId}
      RETURNING entry_id`;
    const n = await countNominated(username, targetId);
    return rows.length ? { ok: true, nominated: n } : { ok: false, reason: 'No such saved theorem.', nominated: n };
  };

  const remove = async (username: string, targetId: string, entryId: string): Promise<boolean> => {
    await ensure();
    const { rows } = await db`DELETE FROM leak_memory WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${entryId} RETURNING entry_id`;
    return rows.length > 0;
  };

  return { ensure, list, save, setNominated, remove };
}
