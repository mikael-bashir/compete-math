import 'server-only';

import { sql } from '@vercel/postgres';
import type { SqlTag } from '../db/sql-tag';
import { sendEmail } from './send';
import {
  consumeVerificationToken,
  createVerificationToken,
  ensureVerificationTables,
  resendVerification,
  verificationMessage,
  type VerifyResult,
} from './verification-core';

export type { VerifyResult };

const db = sql as unknown as SqlTag;

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    'https://competemath.com'
  ).replace(/\/$/, '');
}

// Called lazily so no migration step is required (mirrors the app's other
// ensure-on-first-use tables).
let ensured = false;
async function ensure(): Promise<void> {
  if (ensured) return;
  await ensureVerificationTables(db);
  ensured = true;
}

// Mint a fresh 24h token for a user, replacing any prior unused token of theirs.
export async function createEmailVerification(
  userId: string,
  email: string,
): Promise<string> {
  await ensure();
  return createVerificationToken(db, userId, email);
}

export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<{ ok: boolean }> {
  const link = `${siteUrl()}/api/auth/verify?token=${encodeURIComponent(token)}`;
  return sendEmail(verificationMessage(email, link));
}

// Create + send in one call, used at registration. NEVER throws — email must
// never block account creation (the user asked that accounts still be created).
export async function issueVerification(
  userId: string,
  email: string,
): Promise<boolean> {
  try {
    if (!email) return false;
    const token = await createEmailVerification(userId, email);
    const { ok } = await sendVerificationEmail(email, token);
    return ok;
  } catch (e) {
    console.error('issueVerification failed:', e);
    return false;
  }
}

// Consume a token: mark the user verified (by email — robust to the users.id
// type) and delete the token. Single-use.
export async function verifyEmailToken(token: string): Promise<VerifyResult> {
  await ensure();
  return consumeVerificationToken(db, token);
}

// The "send me a new link" form. Resolves the same whatever the address is (see resendVerification).
export async function requestNewVerification(email: string): Promise<void> {
  try {
    await ensure();
    await resendVerification(email, { db, issue: issueVerification });
  } catch (e) {
    console.error('requestNewVerification failed:', e);
  }
}
