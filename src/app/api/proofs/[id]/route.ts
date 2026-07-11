import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { auth } from '@/app/(auth)/auth';
import { PRACTICE_REVEAL_ATTEMPTS } from '@/app/lib/constants/site';
import { fullCertificate } from '@/app/lib/certificate';
import { signCertificate, buildSignedText } from '@/app/lib/certificate-sign';

// GET /api/proofs/:id   (id = questionId)
// The dedicated proofs API. Proofs live here, NOT in the problems payload — the
// problems endpoints only carry a `hasProof` boolean, so lists/detail stay light
// and reactive; the ~18 KB proof is fetched only when a user asks to see it.
//
// Gated: returns the answer + full certificate ONLY once the signed-in user has
// earned it — solved it, or genuinely attempted PRACTICE_REVEAL_ATTEMPTS times
// (the "give up" gate). Enforced server-side so it can't be scraped early.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const username = session.user.username;
  const { id } = await params;
  const questionId = parseInt(id);
  if (Number.isNaN(questionId)) {
    return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  }

  try {
    const sub = await sql`
      SELECT "attemptCount", "isCorrect"
      FROM submissions
      WHERE username = ${username} AND "questionId" = ${questionId}
    `;
    const attempts = Number(sub.rows[0]?.attemptCount) || 0;
    const solved = !!sub.rows[0]?.isCorrect;
    const unlocked = solved || attempts >= PRACTICE_REVEAL_ATTEMPTS;

    if (!unlocked) {
      return NextResponse.json({
        unlocked: false,
        attemptsUsed: attempts,
        attemptsLeft: Math.max(0, PRACTICE_REVEAL_ATTEMPTS - attempts),
        required: PRACTICE_REVEAL_ATTEMPTS,
      });
    }

    const q = await sql`
      SELECT "questionTitle", answer, proof, "mintedAt", "provedAt"
      FROM questions WHERE "questionId" = ${questionId}
    `;
    if (q.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const row = q.rows[0];
    const meta = {
      title: row.questionTitle as string | null,
      mintedAt: row.mintedAt ? new Date(row.mintedAt).toISOString() : null,
      provedAt: row.provedAt ? new Date(row.provedAt).toISOString() : null,
    };
    const hasProof = typeof row.proof === 'string' && row.proof.trim().length > 0;

    // Build + SIGN the certificate. `canonical` is the exact byte sequence the
    // Ed25519 signature covers (header + full proof); `full` is the copyable,
    // self-verifiable artifact (canonical + signature block). The signature is
    // what makes tampering detectable — a forger can't re-sign altered content
    // without the private key.
    let certificate = null;
    if (hasProof) {
      const canonical = fullCertificate(row.proof, meta).trimEnd();
      const sig = signCertificate(canonical);
      const full = sig ? buildSignedText(canonical, sig) : canonical + '\n';
      certificate = {
        ...meta,
        proof: row.proof,
        full,
        signature: sig?.signature ?? null,
        keyId: sig?.keyId ?? null,
      };
    }

    return NextResponse.json({
      unlocked: true,
      solved,
      answer: row.answer,
      hasProof,
      certificate,
    });
  } catch (error) {
    console.error('Proof reveal error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
