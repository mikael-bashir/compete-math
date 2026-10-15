import 'server-only';

import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import { after } from 'next/server';
import type { SqlTag } from '../db/sql-tag';
import { sendEmail } from '../email/send';
import { ensureResetTable, requestPasswordReset, resetPassword, sqlResetStore, type ResetDeps, type ResetResult } from './password-reset-core';

const db = sql as unknown as SqlTag;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'https://competemath.com').replace(/\/$/, '');
}

let ensured = false;
async function deps(): Promise<ResetDeps> {
  if (!ensured) {
    await ensureResetTable(db);
    ensured = true;
  }
  return {
    store: sqlResetStore(db),
    send: sendEmail,
    hash: (password) => bcrypt.hash(password, 10),
    siteUrl: siteUrl(),
    // the mail goes out after the answer, so how long the answer takes does not tell whether the address has an account
    defer: (job) => after(job),
  };
}

/** Never throws and never says whether the address has an account. */
export async function startPasswordReset(email: string): Promise<void> {
  try {
    await requestPasswordReset(email, await deps());
  } catch (e) {
    console.error('startPasswordReset failed:', e);
  }
}

export async function finishPasswordReset(token: string, password: string): Promise<ResetResult> {
  try {
    return await resetPassword(token, password, await deps());
  } catch (e) {
    console.error('finishPasswordReset failed:', e);
    return { status: 'invalid' };
  }
}
