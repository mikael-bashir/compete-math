import 'server-only';

import { randomBytes } from 'node:crypto';
import { sql } from '@vercel/postgres';
import { sendEmail } from './send';

// Verification links live for 24 hours (the window the user asked for).
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    'https://competemath.com'
  ).replace(/\/$/, '');
}

// Idempotent: adds the `email_verified` marker to users and the token table.
// Called lazily so no migration step is required (mirrors the app's other
// ensure-on-first-use tables).
let ensured = false;
async function ensure(): Promise<void> {
  if (ensured) return;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified timestamptz`;
  await sql`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token      text PRIMARY KEY,
      user_id    text NOT NULL,
      email      text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  ensured = true;
}

// Mint a fresh 24h token for a user, replacing any prior unused token of theirs.
export async function createEmailVerification(
  userId: string,
  email: string,
): Promise<string> {
  await ensure();
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await sql`DELETE FROM email_verification_tokens WHERE user_id = ${userId}`;
  await sql`
    INSERT INTO email_verification_tokens (token, user_id, email, expires_at)
    VALUES (${token}, ${userId}, ${email}, ${expires})`;
  return token;
}

function verificationEmail(link: string): { html: string; text: string } {
  const text = `Welcome to CompeteMath!

Confirm your email address to finish setting up your account:
${link}

This link expires in 24 hours. If you didn't create a CompeteMath account, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee">
    <div style="background:#2a0a0e;padding:22px 28px;color:#f0d9a0;font-weight:600;font-size:15px;letter-spacing:.02em">CompeteMath</div>
    <div style="padding:28px">
      <h1 style="margin:0 0 10px;font-size:20px">Confirm your email</h1>
      <p style="margin:0 0 20px;line-height:1.6;color:#444">Welcome! Tap the button below to verify your email and unlock your account.</p>
      <a href="${link}" style="display:inline-block;background:#b8860b;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:600">Verify email</a>
      <p style="margin:22px 0 0;line-height:1.6;color:#888;font-size:13px">This link expires in 24 hours. If the button doesn't work, paste this into your browser:<br><a href="${link}" style="color:#b8860b;word-break:break-all">${link}</a></p>
      <p style="margin:18px 0 0;line-height:1.6;color:#aaa;font-size:12px">Didn't create an account? You can safely ignore this email.</p>
    </div>
  </div></body></html>`;
  return { html, text };
}

export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<{ ok: boolean }> {
  const link = `${siteUrl()}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const { html, text } = verificationEmail(link);
  return sendEmail({
    to: email,
    subject: 'Verify your CompeteMath email',
    html,
    text,
  });
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

export type VerifyResult = 'ok' | 'expired' | 'invalid';

// Consume a token: mark the user verified (by email — robust to the users.id
// type) and delete the token. Single-use.
export async function verifyEmailToken(token: string): Promise<VerifyResult> {
  await ensure();
  if (!token) return 'invalid';
  const rows = await sql`
    SELECT email, expires_at FROM email_verification_tokens WHERE token = ${token}`;
  const row = rows.rows[0];
  if (!row) return 'invalid';
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    await sql`DELETE FROM email_verification_tokens WHERE token = ${token}`;
    return 'expired';
  }
  await sql`UPDATE users SET email_verified = now() WHERE email = ${row.email as string}`;
  await sql`DELETE FROM email_verification_tokens WHERE token = ${token}`;
  return 'ok';
}
