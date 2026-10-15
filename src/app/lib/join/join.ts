import 'server-only';

import { sql } from '@vercel/postgres';
import type { SqlTag } from '../db/sql-tag';
import { sendEmail } from '../email/send';
import { ensureJoinTable, hashAddress, sqlJoinStore, submitApplication, type Applicant, type JoinInput, type JoinResult } from './join-core';

const db = sql as unknown as SqlTag;
const OWNER_EMAIL = process.env.JOIN_FORM_TO || 'bashir.mikael@outlook.com';

let ensured = false;

export async function applyToJoin(input: Partial<JoinInput>, who: Applicant & { userId?: string }, ip: string): Promise<JoinResult> {
  if (!ensured) {
    await ensureJoinTable(db);
    ensured = true;
  }
  return submitApplication(input, who, hashAddress(ip, process.env.AUTH_SECRET ?? ''), {
    store: sqlJoinStore(db),
    send: sendEmail,
    ownerEmail: OWNER_EMAIL,
  });
}
