import 'server-only';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Provider-agnostic email sender, configured entirely by env — so "our own VPS
// SMTP" today can become a relay (Resend/SES/Postmark SMTP) tomorrow with ZERO
// code change, just different env values:
//   SMTP_HOST         your VPS mail host (unset ⇒ dev console mode, below)
//   SMTP_PORT         default 587 (submission w/ STARTTLS); 465 for implicit TLS
//   SMTP_SECURE       "true" for port 465, otherwise STARTTLS on 587
//   SMTP_USER / SMTP_PASS   SMTP AUTH credentials
//   EMAIL_FROM        "CompeteMath <no-reply@competemath.com>"
//
// Deliverability note: for a self-hosted VPS sender to reach inboxes (not spam),
// the VPS IP needs PTR/reverse-DNS and competemath.com needs SPF + DKIM + DMARC.
// If deliverability is poor, point SMTP_HOST at a relay — no code change here.
//
// When SMTP_HOST is unset (local dev / not yet configured), emails are LOGGED to
// the console instead of sent, so verification links still work end-to-end.

let transporterPromise: Promise<import('nodemailer').Transporter | null> | null =
  null;

async function getTransporter(): Promise<import('nodemailer').Transporter | null> {
  if (!process.env.SMTP_HOST) return null; // console mode
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const nodemailer = (await import('nodemailer')).default;
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    })().catch((e) => {
      console.error('SMTP transporter init failed:', e);
      return null;
    });
  }
  return transporterPromise;
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean }> {
  const from =
    process.env.EMAIL_FROM || 'CompeteMath <no-reply@competemath.com>';
  const transporter = await getTransporter();

  // Not configured (dev): log the message so links remain usable without a
  // mail server, and so nothing silently blocks registration.
  if (!transporter) {
    const preview =
      msg.text ||
      msg.html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600);
    console.log(
      `\n📧 [email:console] SMTP not configured — would send:\n  to: ${msg.to}\n  subject: ${msg.subject}\n  ${preview}\n`,
    );
    return { ok: true };
  }

  try {
    await transporter.sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    return { ok: true };
  } catch (e) {
    console.error('sendEmail failed:', e);
    return { ok: false };
  }
}
