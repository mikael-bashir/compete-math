import { createHash, randomBytes } from 'node:crypto';
import type { SqlTag } from '../db/sql-tag';
import { renderEmail } from '../email/email-layout';
import type { EmailMessage } from '../email/mailjet';
import { resetPasswordSchema } from '../zod';

// Forgot-password without Next, a database of its own or a mail provider of its own: the store, the hasher and the sender are
// passed in, so tests/auth/password-reset.test.ts runs the whole flow, SQL included (tests/helpers/pglite.ts).
//
// What it promises:
//  - asking never says whether the address has an account (same answer, and the mail is sent after the answer);
//  - the link carries a random token; only its SHA-256 is stored, so a copy of the table cannot reset anyone's password;
//  - a token works once, for an hour, and a newer request replaces an older token;
//  - a weak new password does not use up the token;
//  - setting a password through the link also confirms the email, since the link proved the person reads it.

export const RESET_TTL_MS = 60 * 60 * 1000;
export const RESET_COOLDOWN_SECONDS = 60;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export async function ensureResetTable(db: SqlTag): Promise<void> {
  await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified timestamptz`;
  await db`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash text PRIMARY KEY,
      user_id    text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await db`CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id)`;
}

export interface ResetStore {
  findUserByEmail(email: string): Promise<{ id: string; email: string } | null>;
  hasRecentToken(userId: string, withinSeconds: number): Promise<boolean>;
  /** the user's one live token: any earlier one is gone */
  replaceToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  /** takes the token out in one step (so two uses cannot both succeed) and says whose it was and whether it had run out */
  consumeToken(tokenHash: string, now: Date): Promise<{ userId: string; expired: boolean } | null>;
  /** sets the password, confirms the email if it was not yet, and removes every token of the user */
  setPassword(userId: string, passwordHash: string): Promise<void>;
}

export function sqlResetStore(db: SqlTag): ResetStore {
  return {
    async findUserByEmail(email) {
      const r = await db`SELECT id, email FROM users WHERE lower(email) = lower(${email}) LIMIT 1`;
      const row = r.rows[0];
      return row ? { id: String(row.id), email: String(row.email) } : null;
    },
    async hasRecentToken(userId, withinSeconds) {
      const r = await db`
        SELECT 1 FROM password_reset_tokens
        WHERE user_id = ${userId} AND created_at > now() - make_interval(secs => ${withinSeconds}) LIMIT 1`;
      return r.rows.length > 0;
    },
    async replaceToken(userId, tokenHash, expiresAt) {
      await db`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`;
      await db`INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (${tokenHash}, ${userId}, ${expiresAt.toISOString()})`;
    },
    async consumeToken(tokenHash, now) {
      const r = await db`DELETE FROM password_reset_tokens WHERE token_hash = ${tokenHash} RETURNING user_id, expires_at`;
      const row = r.rows[0];
      if (!row) return null;
      return { userId: String(row.user_id), expired: new Date(row.expires_at as string).getTime() < now.getTime() };
    },
    async setPassword(userId, passwordHash) {
      await db`UPDATE users SET password_hash = ${passwordHash}, email_verified = COALESCE(email_verified, now()) WHERE id::text = ${userId}`;
      await db`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`;
    },
  };
}

export function resetMessage(email: string, link: string): EmailMessage {
  const { html, text } = renderEmail({
    heading: 'Reset your password',
    intro: 'Someone asked to reset the password of the CompeteMath account with this email address. Tap the button to choose a new one.',
    button: { label: 'Choose a new password', url: link },
    note: "This link works once and expires in 1 hour. If you didn't ask for it, ignore this email: your password has not changed.",
  });
  return { to: email, subject: 'Reset your CompeteMath password', html, text };
}

export interface ResetDeps {
  store: ResetStore;
  send: (message: EmailMessage) => Promise<{ ok: boolean }>;
  hash: (password: string) => Promise<string>;
  siteUrl: string;
  now?: () => Date;
  token?: () => string;
  /** runs the mail after the answer is given; default: awaits it */
  defer?: (job: () => Promise<unknown>) => void | Promise<void>;
}

/** Always resolves the same: the caller says "if there is an account, we sent a link", whatever happened. */
export async function requestPasswordReset(rawEmail: string, deps: ResetDeps): Promise<void> {
  const email = rawEmail.trim();
  if (!email || email.length > 254) return;
  const user = await deps.store.findUserByEmail(email);
  if (!user) return;
  if (await deps.store.hasRecentToken(user.id, RESET_COOLDOWN_SECONDS)) return;
  const now = (deps.now ?? (() => new Date()))();
  const token = (deps.token ?? (() => randomBytes(32).toString('hex')))();
  await deps.store.replaceToken(user.id, hashToken(token), new Date(now.getTime() + RESET_TTL_MS));
  const link = `${deps.siteUrl.replace(/\/$/, '')}/auth/reset?token=${encodeURIComponent(token)}`;
  const job = async () => {
    const result = await deps.send(resetMessage(user.email, link));
    if (!result.ok) console.error('password reset email failed to send');
  };
  if (deps.defer) await deps.defer(job);
  else await job();
}

export type ResetResult = { status: 'ok' } | { status: 'invalid' } | { status: 'expired' } | { status: 'weak'; message: string };

export async function resetPassword(token: string, password: string, deps: ResetDeps): Promise<ResetResult> {
  const checked = resetPasswordSchema.safeParse({ password });
  if (!checked.success) return { status: 'weak', message: checked.error.issues[0]?.message ?? 'Choose a stronger password' };
  if (!token) return { status: 'invalid' };
  const used = await deps.store.consumeToken(hashToken(token), (deps.now ?? (() => new Date()))());
  if (!used) return { status: 'invalid' };
  if (used.expired) return { status: 'expired' };
  await deps.store.setPassword(used.userId, await deps.hash(password));
  return { status: 'ok' };
}
