import type { SqlTag } from '../db/sql-tag';
import { cleanEntry, type MemoryEntry } from './memory-core';

// The kept tier: a copy of every theorem a run's sleep stage rated KEEP_AT stars or more, made the moment its rating is saved and never
// touched by what happens to the working library afterwards (a cleared library, an eviction, a merge). It is also the intake's queue: an
// account that has chosen to share (leak_memory_share) has its kept, not yet submitted theorems offered to the intake job as candidates, at
// most MAX_PER_BUNDLE for one target at a time. The store takes the database as a parameter so tests/leak-memory/kept.test.ts runs it against a
// real Postgres (PGlite); data/leak-memory.ts wires in the real one.
//
// Nothing here makes a theorem trusted. The stars are the producer's claim (a client writes them), so a kept row is a candidate for review and
// no more: the intake re-derives everything from the theorem text (compile on the real tree, allow-list lint, re-rating) and a human approves the PR.

/** the rating at which a theorem is kept; one place to change it. */
export const KEEP_AT = 4;
/** a bundle is at most this many theorems of one account for one target (the audit's ceiling). */
export const MAX_PER_BUNDLE = 10;
/** what one account may keep, per target and in all: a rating is a client's claim, so the queue is bounded. */
export const MAX_KEPT_PER_TARGET = 300;
export const MAX_KEPT_PER_ACCOUNT = 1500;

/**
 * The accounts that may share with the intake: LEAK_INTAKE_ACCOUNTS, comma separated, set on the host by the owner. Empty or unset: nobody (the
 * intake starts with the owner's own account only, and widening it is a host setting, not a code change). Compared exactly, case included.
 */
export const intakeAccounts = (env: Record<string, string | undefined> = process.env): Set<string> =>
  new Set((env.LEAK_INTAKE_ACCOUNTS ?? '').split(',').map((s) => s.trim()).filter(Boolean));

export interface Candidate {
  username: string;
  target: string;
  /** the theorems of this bundle, with their proofs: what the intake job re-derives from */
  entries: MemoryEntry[];
}

export function keptStore(db: SqlTag, limits: Partial<{ perTarget: number; perAccount: number; perBundle: number }> = {}) {
  const lim = { perTarget: MAX_KEPT_PER_TARGET, perAccount: MAX_KEPT_PER_ACCOUNT, perBundle: MAX_PER_BUNDLE, ...limits };
  let ready: Promise<void> | null = null;

  const ensure = (): Promise<void> => {
    ready ??= (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS leak_memory_kept (
          username TEXT NOT NULL,
          target_id TEXT NOT NULL,
          entry_id TEXT NOT NULL,
          entry JSONB NOT NULL,
          stars SMALLINT NOT NULL,
          kept_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          submitted_at TIMESTAMPTZ,
          bundle TEXT,
          PRIMARY KEY (username, target_id, entry_id)
        )`;
      await db`CREATE INDEX IF NOT EXISTS idx_leak_memory_kept_queue ON leak_memory_kept(submitted_at, username, target_id)`;
      await db`
        CREATE TABLE IF NOT EXISTS leak_memory_share (
          username TEXT PRIMARY KEY,
          share BOOLEAN NOT NULL DEFAULT FALSE,
          changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`;
    })().catch((e) => {
      ready = null;
      throw e;
    });
    return ready;
  };

  // Copy the entries of `raw` that carry a rating of KEEP_AT or more. An entry already kept is replaced only while it has not been submitted
  // (once a bundle holds it, its text is what the intake saw). Returns how many rows were written.
  const keep = async (username: string, targetId: string, raw: unknown[]): Promise<number> => {
    const worth = raw.map(cleanEntry).filter((e): e is MemoryEntry => !!e && (e.quality?.s ?? 0) >= KEEP_AT);
    if (!worth.length) return 0;
    await ensure();
    const { rows: cnt } = await db`
      SELECT COUNT(*) FILTER (WHERE target_id = ${targetId})::int AS here, COUNT(*)::int AS total
      FROM leak_memory_kept WHERE username = ${username}`;
    let here = Number(cnt[0]?.here ?? 0);
    let total = Number(cnt[0]?.total ?? 0);
    let written = 0;
    for (const e of worth) {
      const { rows: ex } = await db`SELECT submitted_at FROM leak_memory_kept WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${e.id}`;
      const isNew = ex.length === 0;
      if (!isNew && ex[0].submitted_at) continue;
      if (isNew && (here >= lim.perTarget || total >= lim.perAccount)) continue;
      await db`
        INSERT INTO leak_memory_kept (username, target_id, entry_id, entry, stars)
        VALUES (${username}, ${targetId}, ${e.id}, ${JSON.stringify({ ...e, nominated: false })}::jsonb, ${e.quality!.s})
        ON CONFLICT (username, target_id, entry_id)
        DO UPDATE SET entry = EXCLUDED.entry, stars = EXCLUDED.stars
        WHERE leak_memory_kept.submitted_at IS NULL`;
      if (isNew) {
        here++;
        total++;
      }
      written++;
    }
    return written;
  };

  const summary = async (username: string, targetId: string): Promise<{ kept: number; submitted: number }> => {
    await ensure();
    const { rows } = await db`
      SELECT COUNT(*)::int AS kept, COUNT(submitted_at)::int AS submitted
      FROM leak_memory_kept WHERE username = ${username} AND target_id = ${targetId}`;
    return { kept: Number(rows[0]?.kept ?? 0), submitted: Number(rows[0]?.submitted ?? 0) };
  };

  const getShare = async (username: string): Promise<boolean> => {
    await ensure();
    const { rows } = await db`SELECT share FROM leak_memory_share WHERE username = ${username}`;
    return rows[0]?.share === true;
  };

  const setShare = async (username: string, share: boolean): Promise<void> => {
    await ensure();
    await db`
      INSERT INTO leak_memory_share (username, share) VALUES (${username}, ${share})
      ON CONFLICT (username) DO UPDATE SET share = EXCLUDED.share, changed_at = NOW()`;
  };

  // What the intake job may take now: for each account that shares and each target, up to perBundle kept theorems not yet submitted, best
  // rated first. `limit` bounds the number of bundles in one answer.
  const candidates = async (limit = 20, accounts: Set<string> = new Set()): Promise<Candidate[]> => {
    if (accounts.size === 0) return []; // fail closed: no allowed account, no candidates
    await ensure();
    const { rows } = await db`
      SELECT k.username, k.target_id, k.entry
      FROM leak_memory_kept k JOIN leak_memory_share s ON s.username = k.username AND s.share
      WHERE k.submitted_at IS NULL
      ORDER BY k.username, k.target_id, k.stars DESC, k.kept_at, k.entry_id`;
    const out: Candidate[] = [];
    for (const r of rows) {
      const username = String(r.username);
      if (!accounts.has(username)) continue;
      const target = String(r.target_id);
      let c = out.find((x) => x.username === username && x.target === target);
      if (!c) {
        if (out.length >= limit) continue;
        c = { username, target, entries: [] };
        out.push(c);
      }
      if (c.entries.length < lim.perBundle) c.entries.push(r.entry as MemoryEntry);
    }
    return out;
  };

  // The intake job says which theorems it put in which bundle. Only rows of that account and target that are still waiting are marked, so a
  // wrong or repeated call changes nothing it should not.
  const markSubmitted = async (username: string, targetId: string, ids: string[], bundle: string): Promise<number> => {
    if (!ids.length) return 0;
    await ensure();
    let n = 0;
    for (const id of ids) {
      const { rows } = await db`
        UPDATE leak_memory_kept SET submitted_at = NOW(), bundle = ${bundle}
        WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${id} AND submitted_at IS NULL
        RETURNING entry_id`;
      n += rows.length;
    }
    return n;
  };

  return { ensure, keep, summary, getShare, setShare, candidates, markSubmitted };
}
