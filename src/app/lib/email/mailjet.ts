// Sending through Mailjet's Send API v3.1 (https://dev.mailjet.com/email/guides/send-api-v31/). No server-only import and the fetch is
// injectable, so the payload and the way a failure is read are tested on their own (tests/email/mailjet.test.ts).

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** where a reply goes, when it should not go to the sender (an application's own email, for the owner) */
  replyTo?: string;
}

/** The sender every message goes out as: a Mailjet sender address that is validated for competemath.com. */
export const DEFAULT_FROM = 'CompeteMath <info@competemath.com>';

export interface Address {
  Email: string;
  Name?: string;
}

/** "Name <a@b.c>" or "a@b.c" as Mailjet's {Email, Name}. */
export function parseAddress(value: string): Address {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^<>\s]+)>\s*$/.exec(value);
  if (m) return m[1] ? { Email: m[2], Name: m[1].trim() } : { Email: m[2] };
  return { Email: value.trim() };
}

export function buildMailjetPayload(msg: EmailMessage, from: string = DEFAULT_FROM) {
  const message: Record<string, unknown> = {
    From: parseAddress(from),
    To: [parseAddress(msg.to)],
    Subject: msg.subject,
    HTMLPart: msg.html,
  };
  if (msg.text) message.TextPart = msg.text;
  if (msg.replyTo) message.ReplyTo = parseAddress(msg.replyTo);
  return { Messages: [message] };
}

export interface MailjetOptions {
  apiKey: string;
  secretKey: string;
  from?: string;
  fetch?: typeof fetch;
}

interface MailjetResponse {
  ErrorMessage?: string;
  Messages?: { Status?: string; Errors?: { ErrorMessage?: string }[] }[];
}

/** Never throws: a transport problem is `{ ok: false, error }`, so an email can never break the request that asked for it. */
export async function sendViaMailjet(msg: EmailMessage, opts: MailjetOptions): Promise<{ ok: boolean; error?: string }> {
  const doFetch = opts.fetch ?? fetch;
  try {
    const res = await doFetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${opts.apiKey}:${opts.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify(buildMailjetPayload(msg, opts.from)),
    });
    const body = (await res.json().catch(() => null)) as MailjetResponse | null;
    const messages = body?.Messages ?? [];
    if (res.ok && messages.length > 0 && messages.every((m) => m.Status === 'success')) return { ok: true };
    const why = body?.ErrorMessage ?? messages.flatMap((m) => m.Errors ?? []).map((e) => e.ErrorMessage).find(Boolean) ?? `HTTP ${res.status}`;
    return { ok: false, error: why };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
