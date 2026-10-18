import "server-only";

import { sql } from "@vercel/postgres";

// The memory of Leak's Control II variants: verified theorems a run proved on the way to a target. One row per (account,
// target, statement). Every query is filtered by the signed-in username, so nothing an account saved is visible to
// another account; only what an account nominates AND that clears the Tengoku audit ever leaves its rows.

export const MAX_ENTRIES_PER_TARGET = 600;
export const MAX_ENTRIES_PER_ACCOUNT = 3000;
export const MAX_NOMINATED = 10;
export const MIN_NOMINATED_FOR_AUDIT = 3;
const MAX_STATEMENT = 20_000;
const MAX_CLOSURE = 60_000;

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
}

let ready: Promise<void> | null = null;

// Self-creating like the other tables here; /api/admin/migrate creates it too.
export function ensureLeakMemoryTable(): Promise<void> {
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS leak_memory (
        username TEXT NOT NULL,
        target_id TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        entry JSONB NOT NULL,
        nominated BOOLEAN NOT NULL DEFAULT FALSE,
        saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (username, target_id, entry_id)
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_leak_memory_user_target ON leak_memory(username, target_id);`;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

// Accept only what the bridge's memory module produces; anything else is dropped rather than stored.
export function cleanEntry(raw: unknown): MemoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 64);
  const statement = str(r.statement, MAX_STATEMENT);
  const closure = str(r.closure, MAX_CLOSURE + 1);
  if (!/^[0-9a-f]{8,64}$/.test(id) || !statement.trim() || !closure.trim() || closure.length > MAX_CLOSURE) return null;
  if (/\b(sorry|admit)\b/.test(closure)) return null;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^[0-9a-f]{8,64}$/.test(x)).slice(0, 50) : []);
  return {
    id,
    name: str(r.name, 200) || id.slice(0, 8),
    kind: r.kind === "lemma" ? "lemma" : "theorem",
    statement,
    closure,
    origin: str(r.origin, 40) || "verified",
    savedAt: typeof r.savedAt === "string" && !Number.isNaN(Date.parse(r.savedAt)) ? r.savedAt : new Date().toISOString(),
    attempt: typeof r.attempt === "number" && Number.isFinite(r.attempt) ? Math.trunc(r.attempt) : null,
    isTarget: r.isTarget === true,
    nominated: false, // never taken from the caller; see setNominated
    subsumes: ids(r.subsumes),
    subsumedBy: typeof r.subsumedBy === "string" && /^[0-9a-f]{8,64}$/.test(r.subsumedBy) ? r.subsumedBy : null,
    hits: typeof r.hits === "number" && r.hits >= 0 ? Math.min(1e6, Math.trunc(r.hits)) : 0,
  };
}

export async function listMemory(username: string, targetId: string): Promise<MemoryEntry[]> {
  await ensureLeakMemoryTable();
  const { rows } = await sql`
    SELECT entry, nominated FROM leak_memory
    WHERE username = ${username} AND target_id = ${targetId}
    ORDER BY saved_at DESC
    LIMIT ${MAX_ENTRIES_PER_TARGET};
  `;
  return rows.map((r) => ({ ...(r.entry as MemoryEntry), nominated: !!r.nominated }));
}

// Insert or replace entries a run saved. The nominated flag stays whatever the account set; it is not part of the update.
export async function saveMemory(username: string, targetId: string, raw: unknown[]): Promise<{ saved: number; skipped: number }> {
  await ensureLeakMemoryTable();
  const entries = raw.map(cleanEntry).filter((e): e is MemoryEntry => !!e);
  let saved = 0;
  const { rows: cnt } = await sql`
    SELECT
      COUNT(*) FILTER (WHERE target_id = ${targetId})::int AS here,
      COUNT(*)::int AS total
    FROM leak_memory WHERE username = ${username};
  `;
  let here = cnt[0]?.here ?? 0;
  let total = cnt[0]?.total ?? 0;
  for (const e of entries) {
    const { rows: ex } = await sql`SELECT 1 FROM leak_memory WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${e.id};`;
    const isNew = ex.length === 0;
    if (isNew && (here >= MAX_ENTRIES_PER_TARGET || total >= MAX_ENTRIES_PER_ACCOUNT)) continue;
    await sql`
      INSERT INTO leak_memory (username, target_id, entry_id, entry)
      VALUES (${username}, ${targetId}, ${e.id}, ${JSON.stringify(e)}::jsonb)
      ON CONFLICT (username, target_id, entry_id)
      DO UPDATE SET entry = EXCLUDED.entry, updated_at = NOW();
    `;
    if (isNew) {
      here++;
      total++;
    }
    saved++;
  }
  return { saved, skipped: raw.length - saved };
}

// Mark or unmark an entry as nominated for the Tengoku audit. At most MAX_NOMINATED per target.
export async function setNominated(username: string, targetId: string, entryId: string, on: boolean): Promise<{ ok: boolean; reason?: string; nominated: number }> {
  await ensureLeakMemoryTable();
  if (on) {
    const { rows } = await sql`
      SELECT COUNT(*)::int AS n FROM leak_memory
      WHERE username = ${username} AND target_id = ${targetId} AND nominated AND entry_id <> ${entryId};
    `;
    if ((rows[0]?.n ?? 0) >= MAX_NOMINATED) return { ok: false, reason: `At most ${MAX_NOMINATED} theorems can be nominated per target.`, nominated: rows[0].n };
  }
  const { rowCount } = await sql`
    UPDATE leak_memory SET nominated = ${on}, updated_at = NOW()
    WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${entryId};
  `;
  const { rows: after } = await sql`SELECT COUNT(*)::int AS n FROM leak_memory WHERE username = ${username} AND target_id = ${targetId} AND nominated;`;
  return rowCount ? { ok: true, nominated: after[0]?.n ?? 0 } : { ok: false, reason: "No such saved theorem.", nominated: after[0]?.n ?? 0 };
}

export async function deleteMemory(username: string, targetId: string, entryId: string): Promise<boolean> {
  await ensureLeakMemoryTable();
  const { rowCount } = await sql`DELETE FROM leak_memory WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${entryId};`;
  return !!rowCount;
}
