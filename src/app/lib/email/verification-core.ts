import { randomBytes } from 'node:crypto';
import type { SqlTag } from '../db/sql-tag';
import { renderEmail } from './layout';
import type { EmailMessage } from './mailjet';

// The confirm-your-email flow without Next or a database of its own: the tag and the sender are passed in, so
// tests/email/verification.test.ts runs it against a real Postgres. verification.ts wires the real ones.

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEND_COOLDOWN_SECONDS = 60;

/** Idempotent: adds the `email_verified` marker to users and the token table. */
export async function ensureVerificationTables(db: SqlTag): Promise<void> {
  await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified timestamptz`;
  await db`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token      text PRIMARY KEY,
      user_id    text NOT NULL,
      email      text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
}

/** Mints a fresh 24h token for a user, replacing any earlier unused token of theirs. */
export async function createVerificationToken(db: SqlTag, userId: string, email: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();
  await db`DELETE FROM email_verification_tokens WHERE user_id = ${userId}`;
  await db`INSERT INTO email_verification_tokens (token, user_id, email, expires_at) VALUES (${token}, ${userId}, ${email}, ${expires})`;
  return token;
}

export function verificationMessage(email: string, link: string): EmailMessage {
  const { html, text } = renderEmail({
    heading: 'Confirm your email',
    intro: 'Welcome to CompeteMath! Tap the button below to confirm your email address and finish setting up your account.',
    button: { label: 'Verify email', url: link },
    note: "This link expires in 24 hours. If you didn't create a CompeteMath account, you can ignore this email.",
  });
  return { to: email, subject: 'Verify your CompeteMath email', html, text };
}

export type VerifyResult = 'ok' | 'expired' | 'invalid';

/** Consumes a token: marks the user verified (by email) and deletes the token. Single use. */
export async function consumeVerificationToken(db: SqlTag, token: string, now = new Date()): Promise<VerifyResult> {
  if (!token) return 'invalid';
  // one statement takes the token, so two clicks at once cannot both use it
  const rows = await db`DELETE FROM email_verification_tokens WHERE token = ${token} RETURNING email, expires_at`;
  const row = rows.rows[0];
  if (!row) return 'invalid';
  if (new Date(row.expires_at as string).getTime() < now.getTime()) return 'expired';
  await db`UPDATE users SET email_verified = now() WHERE email = ${row.email as string}`;
  return 'ok';
}

export interface ResendDeps {
  db: SqlTag;
  /** mints and sends a verification email for a user; resolves whether it went out */
  issue: (userId: string, email: string) => Promise<boolean>;
}

/**
 * "Send me a new link". The answer never says whether the address has an account, is already verified or was asked about a moment
 * ago, so the form cannot be used to find out who is registered. Only an unverified account that has not been sent a link in the
 * last minute gets one.
 */
export async function resendVerification(rawEmail: string, deps: ResendDeps): Promise<void> {
  const email = rawEmail.trim();
  if (!email || email.length > 254) return;
  const found = await deps.db`SELECT id, email FROM users WHERE lower(email) = lower(${email}) AND email_verified IS NULL LIMIT 1`;
  const user = found.rows[0];
  if (!user) return;
  const recent = await deps.db`
    SELECT 1 FROM email_verification_tokens
    WHERE user_id = ${String(user.id)} AND created_at > now() - make_interval(secs => ${RESEND_COOLDOWN_SECONDS}) LIMIT 1`;
  if (recent.rows.length > 0) return;
  await deps.issue(String(user.id), String(user.email));
}
