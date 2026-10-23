import 'server-only';

import { sql } from '@vercel/postgres';
import type { SqlTag } from '../db/sql-tag';
import { leakMemoryStore } from '../leak-memory/memory-core';
import { keptStore } from '../leak-memory/kept-core';

export { MAX_ENTRIES_PER_ACCOUNT, MAX_ENTRIES_PER_TARGET, MAX_NOMINATED, MIN_NOMINATED_FOR_AUDIT, cleanEntry } from '../leak-memory/memory-core';
export type { MemoryEntry } from '../leak-memory/memory-core';

// The account's saved theorems per Leak target: the logic and the SQL are in ../leak-memory/memory-core.ts, which the tests run
// against a real Postgres; this is that store on the real database.
const store = leakMemoryStore(sql as unknown as SqlTag);

export const ensureLeakMemoryTable = store.ensure;
export const listMemory = store.list;
// The kept tier (../leak-memory/kept-core.ts): a theorem rated four stars or more is copied there as it is saved, so nothing that later happens to
// the working library can lose it. A failure to keep never fails the save.
const kept = keptStore(sql as unknown as SqlTag);
export const saveMemory: typeof store.save = async (username, targetId, raw) => {
  const r = await store.save(username, targetId, raw);
  try {
    await kept.keep(username, targetId, raw);
  } catch (e) {
    console.error('[leak-memory] keep failed:', e);
  }
  return r;
};
export const keptSummary = kept.summary;
export const getShare = kept.getShare;
export const setShare = kept.setShare;
export const intakeCandidates = kept.candidates;
export const markSubmitted = kept.markSubmitted;
export const setNominated = store.setNominated;
export const deleteMemory = store.remove;
