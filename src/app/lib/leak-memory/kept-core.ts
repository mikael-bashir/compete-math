import type { SqlTag } from '../db/sql-tag';
import { cleanEntry, type MemoryEntry } from './memory-core';
import { cleanHarness, type Evidence, type HarnessClaim } from './harness';
import { REJECT_CODES, RETURN_CODES } from './notices-catalogue';

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

/** What a code owner decided on a submitted theorem (the intake's reports, `review`): returned (the author may come back with a better one) or rejected (never offered again). */
export type ReviewState = 'returned' | 'rejected';

/** One pull request's decisions, as the intake reports them: hold the decided theorems of the bundle, and free the others once the pull request is closed. */
export interface Review {
  username: string;
  target: string;
  /** the bundle (sha-256) the theorems were submitted in: a report about any other bundle changes nothing */
  bundle: string;
  returned: { id: string; code: string }[];
  rejected: { id: string; code: string }[];
  accepted: string[];
}

const HEXID = /^[0-9a-f]{8,64}$/;
const TARGET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** One review, or null when it is not a well-formed one. An item with a code the grammar does not have, or an id that is not hex, is dropped; the rest stands. */
export function cleanReview(raw: unknown): Review | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.username !== 'string' || !r.username || r.username.length > 100) return null;
  if (typeof r.target !== 'string' || !TARGET_ID.test(r.target)) return null;
  if (typeof r.bundle !== 'string' || !/^[0-9a-f]{64}$/.test(r.bundle)) return null;
  const items = (v: unknown, codes: readonly string[]) =>
    Array.isArray(v)
      ? v
          .filter((x): x is { id: string; code: string } => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' && HEXID.test((x as { id: string }).id) && typeof (x as { code?: unknown }).code === 'string' && codes.includes((x as { code: string }).code))
          .map((x) => ({ id: x.id, code: x.code }))
          .slice(0, 10)
      : [];
  const accepted = Array.isArray(r.accepted) ? r.accepted.filter((x): x is string => typeof x === 'string' && HEXID.test(x)).slice(0, 10) : [];
  return { username: r.username, target: r.target, bundle: r.bundle, returned: items(r.returned, RETURN_CODES), rejected: items(r.rejected, REJECT_CODES), accepted };
}

/** the text of a theorem as a reviewer saw it: a returned theorem comes back when this changed (the id is the hash of the statement only, so a better proof keeps its id) */
const textOf = (e: { name?: unknown; statement?: unknown; closure?: unknown }): string => JSON.stringify([e.name, e.statement, e.closure]);

/** a kept theorem with what the server saw of the harness when it was kept (harness.ts) */
export type KeptCandidate = MemoryEntry & { evidence: Evidence };

export interface Candidate {
  username: string;
  target: string;
  /** the theorems of this bundle, with their proofs and their evidence: what the intake job re-derives from */
  entries: KeptCandidate[];
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
      await db`ALTER TABLE leak_memory_kept ADD COLUMN IF NOT EXISTS evidence JSONB`;
      // a code owner's decision on a submitted theorem (see `review`): returned or rejected, with the code, and when
      await db`ALTER TABLE leak_memory_kept ADD COLUMN IF NOT EXISTS review_state TEXT`;
      await db`ALTER TABLE leak_memory_kept ADD COLUMN IF NOT EXISTS review_code TEXT`;
      await db`ALTER TABLE leak_memory_kept ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`;
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
  // `evaluate` reads what the harness claimed with each theorem (harness.ts) against the server's clock; a copy kept without it has no evidence.
  const keep = async (username: string, targetId: string, raw: unknown[], evaluate?: (claim: HarnessClaim | null) => Evidence): Promise<number> => {
    const worth = raw
      .map((r) => ({ e: cleanEntry(r), claim: cleanHarness((r as { harness?: unknown } | null)?.harness) }))
      .filter((x): x is { e: MemoryEntry; claim: HarnessClaim | null } => !!x.e && (x.e.quality?.s ?? 0) >= KEEP_AT);
    if (!worth.length) return 0;
    await ensure();
    const { rows: cnt } = await db`
      SELECT COUNT(*) FILTER (WHERE target_id = ${targetId})::int AS here, COUNT(*)::int AS total
      FROM leak_memory_kept WHERE username = ${username}`;
    let here = Number(cnt[0]?.here ?? 0);
    let total = Number(cnt[0]?.total ?? 0);
    let written = 0;
    for (const { e, claim } of worth) {
      const evidence = evaluate ? evaluate(claim) : null;
      const { rows: ex } = await db`SELECT submitted_at, review_state, entry FROM leak_memory_kept WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${e.id}`;
      const isNew = ex.length === 0;
      if (!isNew && ex[0].submitted_at) {
        // A theorem a code owner RETURNED comes back when its text changed (name, statement or proof): the new copy replaces the held one and is a candidate again, with the evidence of
        // this save. One the owner rejected, or one that is merely waiting in an open pull request, is never replaced: what the intake saw is what was judged.
        if (ex[0].review_state === 'returned' && textOf(ex[0].entry as Record<string, unknown>) !== textOf(e)) {
          const { rows: back } = await db`
            UPDATE leak_memory_kept SET entry = ${JSON.stringify({ ...e, nominated: false })}::jsonb, stars = ${e.quality!.s}, evidence = ${evidence ? JSON.stringify(evidence) : null}::jsonb,
              kept_at = NOW(), submitted_at = NULL, bundle = NULL, review_state = NULL, review_code = NULL, reviewed_at = NULL
            WHERE username = ${username} AND target_id = ${targetId} AND entry_id = ${e.id} AND review_state = 'returned' RETURNING entry_id`;
          written += back.length;
        }
        continue;
      }
      if (isNew && (here >= lim.perTarget || total >= lim.perAccount)) continue;
      await db`
        INSERT INTO leak_memory_kept (username, target_id, entry_id, entry, stars, evidence)
        VALUES (${username}, ${targetId}, ${e.id}, ${JSON.stringify({ ...e, nominated: false })}::jsonb, ${e.quality!.s}, ${evidence ? JSON.stringify(evidence) : null}::jsonb)
        ON CONFLICT (username, target_id, entry_id)
        DO UPDATE SET entry = EXCLUDED.entry, stars = EXCLUDED.stars,
          -- a later save without good evidence (an older bridge, a rating update) never replaces evidence that was good
          evidence = CASE WHEN EXCLUDED.evidence IS NOT NULL AND (EXCLUDED.evidence->'ticket'->>'ok' = 'true' OR leak_memory_kept.evidence IS NULL OR leak_memory_kept.evidence->'ticket'->>'ok' <> 'true')
                          THEN EXCLUDED.evidence ELSE leak_memory_kept.evidence END
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
  // Only theorems whose ticket and receipt passed (harness.ts) are offered; `accept` is a last check by the caller (the build, which needs the network).
  const candidates = async (limit = 20, accounts: Set<string> = new Set(), accept?: (evidence: Evidence) => Promise<boolean>): Promise<Candidate[]> => {
    if (accounts.size === 0) return []; // fail closed: no allowed account, no candidates
    await ensure();
    const { rows } = await db`
      SELECT k.username, k.target_id, k.entry, k.evidence
      FROM leak_memory_kept k JOIN leak_memory_share s ON s.username = k.username AND s.share
      WHERE k.submitted_at IS NULL AND k.evidence->'ticket'->>'ok' = 'true' AND k.evidence->'receipt'->>'ok' = 'true'
      ORDER BY k.username, k.target_id, k.stars DESC, k.kept_at, k.entry_id`;
    const out: Candidate[] = [];
    for (const r of rows) {
      const username = String(r.username);
      if (!accounts.has(username)) continue;
      const evidence = r.evidence as Evidence;
      if (accept && !(await accept(evidence))) continue;
      const target = String(r.target_id);
      let c = out.find((x) => x.username === username && x.target === target);
      if (!c) {
        if (out.length >= limit) continue;
        c = { username, target, entries: [] };
        out.push(c);
      }
      if (c.entries.length < lim.perBundle) c.entries.push({ ...(r.entry as MemoryEntry), evidence });
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

  // A code owner's decisions on the theorems of a pull request (the intake reports them; `Review`). The decided theorems of that bundle are HELD: a rejected one is never offered
  // again, a returned one only when its text changes (`keep`). Once the pull request is closed the others of the bundle (`accepted`) are FREED: marked not submitted again, so the
  // next bundle takes them. Everything is guarded by the bundle the report names: a report about a bundle a theorem is no longer in (it was freed and bundled again, or the intake
  // reports an old pull request twice) changes nothing, so the call can be repeated as often as the reporter likes.
  const review = async (r: Review): Promise<{ held: number; freed: number }> => {
    await ensure();
    let held = 0;
    let freed = 0;
    for (const [state, list] of [['returned', r.returned], ['rejected', r.rejected]] as const) {
      for (const d of list) {
        const { rows } = await db`
          UPDATE leak_memory_kept SET review_state = ${state}, review_code = ${d.code}, reviewed_at = NOW()
          WHERE username = ${r.username} AND target_id = ${r.target} AND entry_id = ${d.id} AND bundle = ${r.bundle} AND submitted_at IS NOT NULL RETURNING entry_id`;
        held += rows.length;
      }
    }
    for (const id of r.accepted) {
      const { rows } = await db`
        UPDATE leak_memory_kept SET submitted_at = NULL, bundle = NULL
        WHERE username = ${r.username} AND target_id = ${r.target} AND entry_id = ${id} AND bundle = ${r.bundle} AND review_state IS NULL RETURNING entry_id`;
      freed += rows.length;
    }
    return { held, freed };
  };

  /** The reviews of one call of the intake: cleaned, only for accounts the owner lists, each applied. */
  const reviewAll = async (raw: unknown[], accounts: Set<string>): Promise<{ held: number; freed: number; dropped: number }> => {
    let held = 0;
    let freed = 0;
    let dropped = 0;
    for (const x of raw.slice(0, 100)) {
      const r = cleanReview(x);
      if (!r || !accounts.has(r.username)) {
        dropped++;
        continue;
      }
      const o = await review(r);
      held += o.held;
      freed += o.freed;
    }
    return { held, freed, dropped };
  };

  return { ensure, keep, summary, getShare, setShare, candidates, markSubmitted, review, reviewAll };
}
