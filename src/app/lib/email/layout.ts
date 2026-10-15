// The one look every CompeteMath email has, in HTML and in plain text. Everything a person typed is escaped before it goes into the
// HTML (tests/email/layout.test.ts), so an application's answers can never put markup into the owner's inbox.

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface EmailContent {
  heading: string;
  intro?: string;
  button?: { label: string; url: string };
  /** questions and the words someone wrote for each */
  qa?: { question: string; answer: string }[];
  note?: string;
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const text = [
    c.heading,
    c.intro,
    c.button ? `${c.button.label}: ${c.button.url}` : undefined,
    ...(c.qa ?? []).map((x) => `${x.question}\n${x.answer}`),
    c.note,
  ]
    .filter((p): p is string => Boolean(p))
    .join('\n\n');

  const qa = (c.qa ?? [])
    .map(
      (x) => `<p style="margin:18px 0 4px;color:#888;font-size:12px;letter-spacing:.03em;text-transform:uppercase">${escapeHtml(x.question)}</p>
      <p style="margin:0;line-height:1.6;white-space:pre-wrap;word-break:break-word">${escapeHtml(x.answer)}</p>`,
    )
    .join('\n');
  const button = c.button
    ? `<a href="${escapeHtml(c.button.url)}" style="display:inline-block;background:#b8860b;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:600">${escapeHtml(c.button.label)}</a>
      <p style="margin:22px 0 0;line-height:1.6;color:#888;font-size:13px">If the button doesn't work, paste this into your browser:<br><a href="${escapeHtml(c.button.url)}" style="color:#b8860b;word-break:break-all">${escapeHtml(c.button.url)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee">
    <div style="background:#2a0a0e;padding:22px 28px;color:#f0d9a0;font-weight:600;font-size:15px;letter-spacing:.02em">CompeteMath</div>
    <div style="padding:28px">
      <h1 style="margin:0 0 10px;font-size:20px">${escapeHtml(c.heading)}</h1>
      ${c.intro ? `<p style="margin:0 0 20px;line-height:1.6;color:#444">${escapeHtml(c.intro)}</p>` : ''}
      ${button}
      ${qa}
      ${c.note ? `<p style="margin:18px 0 0;line-height:1.6;color:#aaa;font-size:12px">${escapeHtml(c.note)}</p>` : ''}
    </div>
  </div></body></html>`;
  return { html, text };
}
