import 'server-only';

import { sql } from '@vercel/postgres';
import type { SqlTag } from '../db/sql-tag';
import { leakMemoryStore } from '../leak-memory/memory-core';

export { MAX_ENTRIES_PER_ACCOUNT, MAX_ENTRIES_PER_TARGET, MAX_NOMINATED, MIN_NOMINATED_FOR_AUDIT, cleanEntry } from '../leak-memory/memory-core';
export type { MemoryEntry } from '../leak-memory/memory-core';

// The account's saved theorems per Leak target: the logic and the SQL are in ../leak-memory/memory-core.ts, which the tests run
// against a real Postgres; this is that store on the real database.
const store = leakMemoryStore(sql as unknown as SqlTag);

export const ensureLeakMemoryTable = store.ensure;
export const listMemory = store.list;
export const saveMemory = store.save;
export const setNominated = store.setNominated;
export const deleteMemory = store.remove;
