export const dynamic = 'force-dynamic';
export const maxDuration = 60; // give the drain loop room for a full day's batch

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Redis } from '@upstash/redis';
import { fullCertificate, certKeyGroup } from '@/app/lib/certificate';
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
  // Lean toolchain + Mathlib version that actually certified this proof. The
  // architect verifier group (Leak XI/XII/XIV) runs 4.32.0 and the original group
  // (Leak I/II/IV) 4.29.1, so this cannot be assumed — it is signed into the
  // certificate bytes upstream and must round-trip verbatim.
  toolchain?: string | null;
  mathlib?: string | null;
  // Which specific strategy enforced this proof (e.g. "Leak Ultra Fleeting"),
  // for the certificate's Enforcer line. Null falls back to bland "Leak".
  enforcer?: string | null;
  // Every independent certificate this problem has — a problem can be proved
  // on more than one toolchain (either before it was ever promoted, or later
  // via the leak-side auto-attach route), and each is a fully independent,
  // separately-signed artifact. When present this is authoritative and the
  // flat proof/toolchain/... fields above are just its first entry, kept for
  // any caller that only reads a single certificate. Absent ⇒ synthesize a
  // single-entry list from the flat fields (older/non-leak payloads).
  certificates?: Array<{
    toolchain: string;
    mathlib?: string | null;
    enforcer?: string | null;
    proof: string;
    verifiedAt?: string | null;
    signature?: string | null;
    signatureKeyId?: string | null;
    certMintedAt?: string | null;
  }>;
  // Solver-facing key idea (1-3 sentences); revealed only after solve/give-up.
  insight?: string | null;
}

interface ResolvedCert {
  toolchain: string;
  mathlib: string | null;
  enforcer: string | null;
  proof: string;
  provedAt: string | null;
  certMintedAt: string | null;
  signature: string | null;
  signatureKeyId: string | null;
}

// Fill in provedAt/certMintedAt/signature for ONE certificate entry: use the
// pre-signed values verbatim if present (the normal case — the leak side
// always signs before pushing), otherwise sign here with the key for
// whichever toolchain group THIS entry claims (never assume legacy — a
// certificates[] array can span both groups in one payload).
function resolveCert(title: string, entry: {
  toolchain?: string | null; mathlib?: string | null; enforcer?: string | null;
  proof: string; verifiedAt?: string | null; signature?: string | null;
  signatureKeyId?: string | null; certMintedAt?: string | null;
}): ResolvedCert {
  const toolchain = entry.toolchain ?? 'leanprover/lean4:v4.29.1';
  const provedAt = entry.verifiedAt ?? new Date().toISOString();
  if (entry.signature && entry.certMintedAt) {
    return {
      toolchain,
      mathlib: entry.mathlib ?? null,
      enforcer: entry.enforcer ?? null,
      proof: entry.proof,
      provedAt,
      certMintedAt: entry.certMintedAt,
      signature: entry.signature,
      signatureKeyId: entry.signatureKeyId ?? null,
    };
  }
  const certMintedAt = new Date().toISOString();
  const canonical = fullCertificate(entry.proof, {
    title,
    mintedAt: certMintedAt,
    provedAt,
    toolchain,
    mathlib: entry.mathlib ?? null,
    enforcer: entry.enforcer ?? null,
  }).trimEnd();
  const sig = signCertificate(canonical, certKeyGroup(toolchain));
  return {
    toolchain,
    mathlib: entry.mathlib ?? null,
    enforcer: entry.enforcer ?? null,
    proof: entry.proof,
    provedAt,
    certMintedAt,
    signature: sig?.signature ?? null,
    signatureKeyId: sig?.keyId ?? null,
  };
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

  // One unified list regardless of which shape the payload arrived in: the
  // full certificates[] array if present (could be one entry or several —
  // several when the admin verified this problem on multiple toolchains
  // BEFORE it was ever promoted), else a single-entry list synthesized from
  // the flat fields (older/non-leak payloads). Every entry is signed here if
  // it doesn't already carry a pre-made signature — see resolveCert.
  const rawCerts = p.certificates?.length
    ? p.certificates
    : p.proof
      ? [{
          toolchain: p.toolchain, mathlib: p.mathlib, enforcer: p.enforcer,
          proof: p.proof, verifiedAt: p.verifiedAt, signature: p.signature,
          signatureKeyId: p.signatureKeyId, certMintedAt: p.certMintedAt,
        }]
      : [];
  const certs = rawCerts.map((c) => resolveCert(p.questionTitle!, c));
  const primary = certs[0];

  // Robustness feature: a problem can be independently certified by more than
  // one toolchain group over time (see question_certificates). Match by exact
  // title — if this problem is ALREADY live, this payload's certificates are
  // ADDITIONAL certificates for it, not a new problem, so they're attached
  // rather than creating a duplicate `questions` row. ON CONFLICT is a
  // defense-in-depth no-op for a toolchain that's somehow already covered.
  const existing = await sql`
    SELECT "questionId" FROM questions WHERE "questionTitle" = ${p.questionTitle}
  `;
  if (existing.rows.length > 0) {
    const questionId = existing.rows[0].questionId as number;
    for (const c of certs) {
      await sql`
        INSERT INTO question_certificates
          ("questionId", toolchain, mathlib, enforcer, proof, "provedAt", "certMintedAt", signature, "signatureKeyId")
        VALUES (
          ${questionId}, ${c.toolchain}, ${c.mathlib}, ${c.enforcer}, ${c.proof},
          ${c.provedAt}, ${c.certMintedAt}, ${c.signature}, ${c.signatureKeyId}
        )
        ON CONFLICT ("questionId", toolchain) DO NOTHING;
      `;
    }
    return p.questionTitle;
  }

  // toolchain/mathlib are STORED per row: the two verifier groups run different
  // Lean versions, and the certificate header (and its signature) is built from
  // these values — dropping them here would make every rebuilt certificate claim
  // the default toolchain and break signature verification for the other group.
  // The flat questions columns are the PRIMARY (first) certificate — kept for
  // any consumer that only reads a single proof/toolchain.
  const inserted = await sql`
    INSERT INTO questions
      ("questionTitle", "questionProblem", subtitle, difficulty, points, answer, topic, knowledge,
       proof, "mintedAt", "provedAt", "certMintedAt", signature, "signatureKeyId", insight,
       toolchain, mathlib)
    VALUES (
      ${p.questionTitle}, ${p.questionProblem}, ${p.subtitle ?? null},
      ${p.difficulty ?? 'Medium'}, ${p.points ?? 100}, ${p.answer ?? null},
      ${p.topic ?? null}, ${p.knowledge ?? null},
      ${primary?.proof ?? null}, ${p.mintedAt ?? null}, ${primary?.provedAt ?? null}, ${primary?.certMintedAt ?? null},
      ${primary?.signature ?? null}, ${primary?.signatureKeyId ?? null}, ${p.insight ?? null},
      ${primary?.toolchain ?? null}, ${primary?.mathlib ?? null}
    )
    RETURNING "questionId";
  `;
  // Seed this new question with EVERY certificate the payload carried — same
  // row shape as the attach path above, so a later additional toolchain is a
  // symmetrical addition to what happened here on first publish.
  const questionId = inserted.rows[0].questionId as number;
  for (const c of certs) {
    await sql`
      INSERT INTO question_certificates
        ("questionId", toolchain, mathlib, enforcer, proof, "provedAt", "certMintedAt", signature, "signatureKeyId")
      VALUES (
        ${questionId}, ${c.toolchain}, ${c.mathlib}, ${c.enforcer}, ${c.proof},
        ${c.provedAt}, ${c.certMintedAt}, ${c.signature}, ${c.signatureKeyId}
      )
      ON CONFLICT ("questionId", toolchain) DO NOTHING;
    `;
  }
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
