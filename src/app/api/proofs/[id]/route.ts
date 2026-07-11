import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { auth } from '@/app/(auth)/auth';
import { PRACTICE_REVEAL_ATTEMPTS } from '@/app/lib/constants/site';
import { fullCertificate } from '@/app/lib/certificate';
import { signCertificate, buildSignedText } from '@/app/lib/certificate-sign';
import { markGaveUp } from '@/app/lib/data/problems';

// Build the unlocked payload: answer + signed certificate for a question.
async function buildUnlockedResponse(questionId: number, solved: boolean, gaveUp: boolean) {
  const q = await sql`
    SELECT "questionTitle", answer, proof, "mintedAt", "provedAt"
    FROM questions WHERE "questionId" = ${questionId}
  `;
  if (q.rows.length === 0) return null;
  const row = q.rows[0];
  const meta = {
    title: row.questionTitle as string | null,
    mintedAt: row.mintedAt ? new Date(row.mintedAt).toISOString() : null,
    provedAt: row.provedAt ? new Date(row.provedAt).toISOString() : null,
  };
  const hasProof = typeof row.proof === 'string' && row.proof.trim().length > 0;

  // Build + SIGN the certificate. `canonical` is the exact byte sequence the
  // Ed25519 signature covers (header + full proof); `full` is the copyable,
  // self-verifiable artifact. The signature makes tampering detectable — a
  // forger can't re-sign altered content without the private key.
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

  return { unlocked: true, solved, gaveUp, answer: row.answer, hasProof, certificate };
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
