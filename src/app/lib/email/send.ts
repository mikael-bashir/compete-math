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

// Self-hosted VPS relay defaults (postfix submission on the leak box). Everything
// here is NON-secret and baked in, so the ONLY thing that has to be configured to
// go live is SMTP_PASS. Override any of these with env if the relay ever moves.
const SMTP_HOST = process.env.SMTP_HOST || 'leak.competemath.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || 'noreply@leak.competemath.com';

async function getTransporter(): Promise<import('nodemailer').Transporter | null> {
  // SMTP_PASS is the single secret that activates real sending. Unset ⇒ console
  // mode (dev / not yet configured) — links still print, nothing blocks signup.
  const pass = process.env.SMTP_PASS;
  if (!pass) return null;
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const nodemailer = (await import('nodemailer')).default;
      return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: process.env.SMTP_SECURE === 'true', // false ⇒ STARTTLS on 587
        requireTLS: true,
        auth: { user: SMTP_USER, pass },
        // The VPS submission port presents a self-signed cert (Vercel → our own
        // box); don't fail the internal hop on host/CA verification.
        tls: { rejectUnauthorized: false },
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
