import { createHash } from 'node:crypto';
import type { SqlTag } from '../db/sql-tag';
import { renderEmail } from '../email/layout';
import type { EmailMessage } from '../email/mailjet';
import { MAX_ANSWER, MONEY_NOTE, QUESTIONS } from './questions';

// "Apply to join the GitHub organisation" without Next: validation, the two emails and the rules about who may submit, with the store
// and the sender passed in (tests/join/join.test.ts runs it against a real Postgres).
//
//  - the application is saved before anything is sent, so an email that fails never loses someone's answers;
//  - the owner always gets the full application; the applicant gets their copy only when they are signed in and have an email;
//  - everything typed is escaped in the HTML (layout.ts), and nothing typed ever becomes a header;
//  - a hidden field no person sees catches bots (answered as a success, nothing sent); a person may apply once every ten minutes
//    under one GitHub name and a few times an hour from one address.

export { MAX_ANSWER, MONEY_NOTE, QUESTIONS };

export const PER_GITHUB_WINDOW_SECONDS = 10 * 60;
export const PER_ADDRESS_WINDOW_SECONDS = 60 * 60;
export const PER_ADDRESS_LIMIT = 3;

// GitHub's rule: 1 to 39 letters, digits and single hyphens, not starting or ending with a hyphen.
const GITHUB = /^(?!.*--)[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export interface JoinInput {
  github: string;
  sixMonths: string;
  fiveYears: string;
  /** the honeypot: a real person never fills it */
  company?: string;
}

export interface Application {
  github: string;
  sixMonths: string;
  fiveYears: string;
}

export type Validated = { ok: true; value: Application } | { ok: false; errors: Partial<Record<keyof Application, string>> };

export function validateApplication(input: Partial<JoinInput>): Validated {
  const errors: Partial<Record<keyof Application, string>> = {};
  const github = String(input.github ?? '').trim().replace(/^@/, '');
  const sixMonths = String(input.sixMonths ?? '').trim();
  const fiveYears = String(input.fiveYears ?? '').trim();
  if (!github) errors.github = 'Your GitHub username is required';
  else if (!GITHUB.test(github)) errors.github = 'That is not a GitHub username: letters, digits and single hyphens, up to 39 characters';
  for (const [key, value] of [['sixMonths', sixMonths], ['fiveYears', fiveYears]] as const) {
    if (!value) errors[key] = 'Please answer this one';
    else if (value.length > MAX_ANSWER) errors[key] = `Please keep it under ${MAX_ANSWER} characters`;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { github, sixMonths, fiveYears } };
}

export interface Applicant {
  /** signed in: who */
  username?: string;
  email?: string;
}

const qa = (a: Application) => [
  { question: 'GitHub username', answer: `@${a.github}` },
  { question: QUESTIONS.sixMonths, answer: a.sixMonths },
  { question: QUESTIONS.fiveYears, answer: a.fiveYears },
];

export function ownerMessage(a: Application, who: Applicant, to: string): EmailMessage {
  const { html, text } = renderEmail({
    heading: `Application to join the organisation: @${a.github}`,
    intro: `https://github.com/${a.github}${who.username ? `. Signed in on CompeteMath as ${who.username}${who.email ? ` (${who.email})` : ''}.` : '. Not signed in.'}`,
    qa: qa(a),
  });
  return { to, subject: `Org application: @${a.github}`, html, text, replyTo: who.email };
}

export function applicantMessage(a: Application, email: string): EmailMessage {
  const { html, text } = renderEmail({
    heading: 'We received your application',
    intro: `Thank you. This is a copy of what you sent to join the CompeteMath GitHub organisation, for your own records. We read every one.`,
    qa: qa(a),
    note: "You are receiving this because you were signed in to CompeteMath with this email address when you applied. If that wasn't you, you can ignore it.",
  });
  return { to: email, subject: 'We received your application to the CompeteMath organisation', html, text };
}

export interface JoinStore {
  /** applications that were emailed under this GitHub name, or from this address, since `sinceSeconds` ago */
  countRecent(by: { github: string } | { ipHash: string }, sinceSeconds: number): Promise<number>;
  insert(a: Application, meta: { userId?: string; email?: string; ipHash: string }): Promise<string>;
  markEmailed(id: string, emailed: boolean): Promise<void>;
}

export async function ensureJoinTable(db: SqlTag): Promise<void> {
  await db`
    CREATE TABLE IF NOT EXISTS join_applications (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      github      text NOT NULL,
      six_months  text NOT NULL,
      five_years  text NOT NULL,
      user_id     text,
      email       text,
      ip_hash     text NOT NULL,
      emailed     boolean NOT NULL DEFAULT false,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`;
}

export function sqlJoinStore(db: SqlTag): JoinStore {
  return {
    async countRecent(by, sinceSeconds) {
      const r =
        'github' in by
          ? await db`SELECT count(*)::int AS n FROM join_applications WHERE lower(github) = lower(${by.github}) AND emailed AND created_at > now() - make_interval(secs => ${sinceSeconds})`
          : await db`SELECT count(*)::int AS n FROM join_applications WHERE ip_hash = ${by.ipHash} AND emailed AND created_at > now() - make_interval(secs => ${sinceSeconds})`;
      return Number(r.rows[0]?.n ?? 0);
    },
    async insert(a, meta) {
      const r = await db`
        INSERT INTO join_applications (github, six_months, five_years, user_id, email, ip_hash)
        VALUES (${a.github}, ${a.sixMonths}, ${a.fiveYears}, ${meta.userId ?? null}, ${meta.email ?? null}, ${meta.ipHash})
        RETURNING id`;
      return String(r.rows[0].id);
    },
    async markEmailed(id, emailed) {
      await db`UPDATE join_applications SET emailed = ${emailed} WHERE id = ${id}`;
    },
  };
}

/** A stable, anonymous stand-in for an address: enough to rate-limit, not enough to know who it was. */
export const hashAddress = (ip: string, salt: string): string => createHash('sha256').update(`${salt}:${ip}`).digest('hex');

export interface JoinDeps {
  store: JoinStore;
  send: (message: EmailMessage) => Promise<{ ok: boolean }>;
  /** where applications go */
  ownerEmail: string;
}

export type JoinResult =
  | { status: 'ok' }
  | { status: 'invalid'; errors: Partial<Record<keyof Application, string>> }
  | { status: 'rate_limited'; message: string }
  | { status: 'send_failed' };

export async function submitApplication(input: Partial<JoinInput>, who: Applicant & { userId?: string }, ipHash: string, deps: JoinDeps): Promise<JoinResult> {
  if (input.company) return { status: 'ok' }; // a bot filled the hidden field: look pleased, send nothing
  const checked = validateApplication(input);
  if (!checked.ok) return { status: 'invalid', errors: checked.errors };
  const a = checked.value;

  if ((await deps.store.countRecent({ github: a.github }, PER_GITHUB_WINDOW_SECONDS)) > 0) {
    return { status: 'rate_limited', message: 'An application for that GitHub username was sent a few minutes ago. Give it a little while before sending another.' };
  }
  if ((await deps.store.countRecent({ ipHash }, PER_ADDRESS_WINDOW_SECONDS)) >= PER_ADDRESS_LIMIT) {
    return { status: 'rate_limited', message: 'That is a lot of applications from one place. Please try again later.' };
  }

  const id = await deps.store.insert(a, { userId: who.userId, email: who.email, ipHash });
  const sent = await deps.send(ownerMessage(a, who, deps.ownerEmail));
  await deps.store.markEmailed(id, sent.ok);
  if (!sent.ok) return { status: 'send_failed' };

  // their copy: a failure here never fails the application, which the owner already has
  if (who.email) await deps.send(applicantMessage(a, who.email)).catch(() => undefined);
  return { status: 'ok' };
}
