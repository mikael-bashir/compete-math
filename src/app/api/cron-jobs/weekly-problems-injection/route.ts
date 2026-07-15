export const dynamic = 'force-dynamic';
export const maxDuration = 60; // give the drain loop room for a full day's batch

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Redis } from '@upstash/redis';
import { fullCertificate } from '@/app/lib/certificate';
import { signCertificate } from '@/app/lib/certificate-sign';

// Upstash REST client — reads the SAME queue the nextjs-ai-chatbot pushes to.
// The chatbot LPUSHes JSON onto `weekly-problems`; we RPOP (FIFO: oldest first).
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const QUEUE_KEY = 'weekly-problems';
const MAX_DRAIN = 1000; // safety cap so a runaway queue can't loop forever

// Every problem the chatbot promotes ships exactly these fields; topic/knowledge
// are optional (older payloads omit them → they land under "General" in Practice).
interface ProblemPayload {
  questionTitle?: string;
  questionProblem?: string;
  subtitle?: string | null;
  difficulty?: string | null;
  points?: number | null;
  answer?: string | null;
  topic?: string | null;
  knowledge?: string | null;
  // Proof certificate. `proof` is the machine-checked Lean script. `verifiedAt`
  // is the REAL moment the Lean kernel confirmed it (from the leak verifier) —
  // used as the certificate's "Enforced/verified" time. `mintedAt` here is the
  // problem's generation time (legacy field).
  proof?: string | null;
  mintedAt?: string | null;
  verifiedAt?: string | null;
  // Certificate signed in the leak admin right after verification. When present
  // we store it verbatim (no re-signing) so the published signature is the one
  // minted seconds after the kernel checked the proof. `certMintedAt` = sign time.
  signature?: string | null;
  signatureKeyId?: string | null;
  certMintedAt?: string | null;
  // Solver-facing key idea (1-3 sentences); revealed only after solve/give-up.
  insight?: string | null;
}

// Cron auth: Vercel Cron auto-sends `Authorization: Bearer <CRON_SECRET>` when
// CRON_SECRET is set. We also accept `?key=<CRON_SECRET>` for manual triggering.
// Fails closed if CRON_SECRET is not configured.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('Authorization');
  if (header === `Bearer ${secret}`) return true;
  const key = new URL(request.url).searchParams.get('key');
  return key === secret;
}

async function ingestOne(raw: unknown): Promise<string> {
  // Upstash usually returns parsed JSON; be defensive for string payloads too.
  const p: ProblemPayload = typeof raw === 'string' ? JSON.parse(raw) : (raw as ProblemPayload);
  if (!p?.questionTitle || !p?.questionProblem) {
    throw new Error('payload missing questionTitle/questionProblem');
  }

  // Certificate provenance. The proof is signed in the leak admin the instant the
  // kernel verifies it, and rides through the payload — so here we just STORE the
  // pre-signed signature verbatim (no re-signing), giving the semantic assurance
  // that the signature was minted seconds after verification. Two times:
  //   provedAt     = when the Lean kernel verified it, and
  //   certMintedAt = when the certificate was signed (in the leak admin).
  // Fallback: if a payload has no pre-signed cert (older/non-leak paths), sign
  // here at ingestion so the certificate is never left unsigned.
  let provedAt: string | null = null;
  let certMintedAt: string | null = null;
  let signature: string | null = null;
  let signatureKeyId: string | null = null;
  if (p.proof) {
    provedAt = p.verifiedAt ?? new Date().toISOString();
    if (p.signature && p.certMintedAt) {
      signature = p.signature;
      signatureKeyId = p.signatureKeyId ?? null;
      certMintedAt = p.certMintedAt;
    } else {
      certMintedAt = new Date().toISOString();
      const canonical = fullCertificate(p.proof, {
        title: p.questionTitle,
        mintedAt: certMintedAt,
        provedAt,
      }).trimEnd();
      const sig = signCertificate(canonical);
      if (sig) {
        signature = sig.signature;
        signatureKeyId = sig.keyId;
      }
    }
  }

  await sql`
    INSERT INTO questions
      ("questionTitle", "questionProblem", subtitle, difficulty, points, answer, topic, knowledge,
       proof, "mintedAt", "provedAt", "certMintedAt", signature, "signatureKeyId", insight)
    VALUES (
      ${p.questionTitle}, ${p.questionProblem}, ${p.subtitle ?? null},
      ${p.difficulty ?? 'Medium'}, ${p.points ?? 100}, ${p.answer ?? null},
      ${p.topic ?? null}, ${p.knowledge ?? null},
      ${p.proof ?? null}, ${p.mintedAt ?? null}, ${provedAt}, ${certMintedAt},
      ${signature}, ${signatureKeyId}, ${p.insight ?? null}
    );
  `;
  return p.questionTitle;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const published: string[] = [];
  let failed = 0;

  try {
    for (let i = 0; i < MAX_DRAIN; i++) {
      const raw = await redis.rpop<unknown>(QUEUE_KEY);
      if (raw == null) break; // queue drained
      try {
        published.push(await ingestOne(raw));
      } catch (itemErr) {
        // Skip a malformed item rather than aborting the whole batch (it's
        // already popped, so it won't block subsequent items). Logged for triage.
        failed++;
        console.error('Skipped malformed queue item:', itemErr, raw);
      }
    }

    return NextResponse.json({
      success: true,
      published: published.length,
      failed,
      titles: published,
    });
  } catch (error) {
    // Redis/DB-level failure: report what we managed before the error.
    console.error('Ingestion failed:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', published: published.length, failed },
      { status: 500 },
    );
  }
}
