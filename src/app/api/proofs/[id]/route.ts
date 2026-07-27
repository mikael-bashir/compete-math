import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { auth } from '@/app/(auth)/auth';
import { PRACTICE_REVEAL_ATTEMPTS } from '@/app/lib/constants/site';
import { fullCertificate, certKeyGroup, CERT_KEYS } from '@/app/lib/certificate';
import { signCertificate, buildSignedText } from '@/app/lib/certificate-sign';
import { markGaveUp } from '@/app/lib/data/problems';

interface CertRow {
  id: string;
  toolchain: string;
  mathlib: string | null;
  enforcer: string | null;
  proof: string;
  provedAt: string | Date | null;
  certMintedAt: string | Date | null;
  signature: string | null;
  signatureKeyId: string | null;
}

// Build the unlocked payload: answer + EVERY independent certificate this
// problem has (one per toolchain — see question_certificates). A problem can
// be certified by more than one verifier group over time; each is a fully
// separate, separately-signed artifact.
async function buildUnlockedResponse(questionId: number, solved: boolean, gaveUp: boolean) {
  const q = await sql`
    SELECT "questionTitle", answer, insight FROM questions WHERE "questionId" = ${questionId}
  `;
  if (q.rows.length === 0) return null;
  const row = q.rows[0];

  // Oldest-proved first, so a problem's ORIGINAL certificate stays the default
  // selection — new toolchains just get appended, not reordered underneath it.
  const certsRes = await sql`
    SELECT id, toolchain, mathlib, enforcer, proof, "provedAt", "certMintedAt", signature, "signatureKeyId"
    FROM question_certificates
    WHERE "questionId" = ${questionId}
    ORDER BY "provedAt" ASC NULLS LAST, "createdAt" ASC
  `;
  const certRows = certsRes.rows as unknown as CertRow[];

  const certificates = await Promise.all(
    certRows.map(async (r) => {
      // Certificates are signed once at INGESTION and the signature is stored,
      // so a view just serves the SAME signature over the SAME bytes. A row
      // with no stored signature (backfilled legacy data, or a group whose
      // signing key wasn't configured yet) is signed lazily on first view and
      // persisted — reused forever after. Signs with the key matching THIS
      // row's OWN toolchain, never the legacy default, so an architect-group
      // certificate is never mis-signed with the wrong key.
      let certMintedAt = r.certMintedAt;
      let signature = r.signature;
      let signatureKeyId = r.signatureKeyId;
      if (!signature) {
        const group = certKeyGroup(r.toolchain);
        certMintedAt = certMintedAt ? new Date(certMintedAt).toISOString() : new Date().toISOString();
        const canonical = fullCertificate(r.proof, {
          title: row.questionTitle as string | null,
          mintedAt: certMintedAt ? new Date(certMintedAt).toISOString() : null,
          provedAt: r.provedAt ? new Date(r.provedAt).toISOString() : null,
          toolchain: r.toolchain,
          mathlib: r.mathlib,
          enforcer: r.enforcer,
        }).trimEnd();
        const sig = signCertificate(canonical, group);
        if (sig) {
          signature = sig.signature;
          signatureKeyId = sig.keyId;
          await sql`
            UPDATE question_certificates
            SET signature = ${signature}, "signatureKeyId" = ${signatureKeyId}, "certMintedAt" = ${certMintedAt}
            WHERE id = ${r.id} AND signature IS NULL
          `;
        }
      }

      const meta = {
        title: row.questionTitle as string | null,
        mintedAt: certMintedAt ? new Date(certMintedAt).toISOString() : null,
        provedAt: r.provedAt ? new Date(r.provedAt).toISOString() : null,
        toolchain: r.toolchain,
        mathlib: r.mathlib,
        enforcer: r.enforcer,
      };
      const canonical = fullCertificate(r.proof, meta).trimEnd();
      const keyInfo = signature && signatureKeyId
        ? (Object.values(CERT_KEYS).find((k) => k.keyId === signatureKeyId) ?? CERT_KEYS.legacy)
        : null;
      const full = signature && keyInfo
        ? buildSignedText(canonical, { signature, keyId: signatureKeyId!, publicKey: keyInfo.publicKey })
        : canonical + '\n';

      return {
        ...meta,
        proof: r.proof,
        full,
        signature: signature ?? null,
        keyId: signature ? signatureKeyId : null,
      };
    }),
  );

  // `insight` (the key idea) is gated exactly like the answer — only present in
  // this unlocked payload, never in the public problem view. Null when absent.
  const insight =
    typeof row.insight === 'string' && row.insight.trim().length > 0
      ? row.insight
      : null;

  return {
    unlocked: true,
    solved,
    gaveUp,
    answer: row.answer,
    hasProof: certificates.length > 0,
    insight,
    certificates,
  };
}

async function readSession(id: string) {
  const session = await auth();
  const username = session?.user?.username;
  const questionId = parseInt(id);
  return { username, questionId };
}

// GET /api/proofs/:id — read the certificate if the user has earned it (solved,
// or already gave up). Read-only; does NOT itself grant the reveal.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { username, questionId } = await readSession(id);
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (Number.isNaN(questionId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });

  try {
    const sub = await sql`
      SELECT "attemptCount", "isCorrect", "gaveUp"
      FROM submissions
      WHERE username = ${username} AND "questionId" = ${questionId}
    `;
    const attempts = Number(sub.rows[0]?.attemptCount) || 0;
    const solved = !!sub.rows[0]?.isCorrect;
    const gaveUp = !!sub.rows[0]?.gaveUp;
    // Already revealed (solved or gave up) ⇒ unlocked. Merely hitting the attempt
    // cap makes reveal *available* but is not itself a reveal (that's POST).
    const unlocked = solved || gaveUp;

    if (!unlocked) {
      return NextResponse.json({
        unlocked: false,
        gaveUp: false,
        attemptsUsed: attempts,
        attemptsLeft: Math.max(0, PRACTICE_REVEAL_ATTEMPTS - attempts),
        canGiveUp: attempts >= PRACTICE_REVEAL_ATTEMPTS,
        required: PRACTICE_REVEAL_ATTEMPTS,
      });
    }

    const payload = await buildUnlockedResponse(questionId, solved, gaveUp);
    if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Proof read error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/proofs/:id — the "give up" action. Permitted only after the user has
// used up PRACTICE_REVEAL_ATTEMPTS. Marks the problem as given-up (terminal, like
// solving: no more attempts, revealed forever) and returns the answer + cert.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { username, questionId } = await readSession(id);
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (Number.isNaN(questionId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });

  try {
    const sub = await sql`
      SELECT "attemptCount", "isCorrect", "gaveUp"
      FROM submissions
      WHERE username = ${username} AND "questionId" = ${questionId}
    `;
    const attempts = Number(sub.rows[0]?.attemptCount) || 0;
    const solved = !!sub.rows[0]?.isCorrect;
    let gaveUp = !!sub.rows[0]?.gaveUp;

    // Not yet allowed to give up: still under the attempt gate and not solved.
    if (!solved && !gaveUp && attempts < PRACTICE_REVEAL_ATTEMPTS) {
      return NextResponse.json({
        unlocked: false,
        gaveUp: false,
        attemptsUsed: attempts,
        attemptsLeft: Math.max(0, PRACTICE_REVEAL_ATTEMPTS - attempts),
        canGiveUp: false,
        required: PRACTICE_REVEAL_ATTEMPTS,
      });
    }

    // Record the give-up (terminal) unless they'd already solved it.
    if (!solved && !gaveUp) {
      await markGaveUp(username, questionId);
      gaveUp = true;
    }

    const payload = await buildUnlockedResponse(questionId, solved, gaveUp);
    if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Give-up error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
