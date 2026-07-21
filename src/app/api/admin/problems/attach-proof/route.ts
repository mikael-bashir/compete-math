import { NextResponse } from 'next/server';
import { attachProofToLiveProblem } from '@/app/lib/data/problems';
import { fullCertificate } from '@/app/lib/certificate';
import { signCertificate } from '@/app/lib/certificate-sign';

function authorized(request: Request): boolean {
  const secret = process.env.LEAK_SYNC_SECRET;
  if (!secret) return false;
  const header = request.headers.get('Authorization');
  if (header === `Bearer ${secret}`) return true;
  const key = new URL(request.url).searchParams.get('key');
  return key === secret;
}

interface AttachProofBody {
  title?: string;
  proof?: string;
  provedAt?: string | null; // ISO — when the kernel verified it. Defaults to now.
  // Pre-signed certificate (matches the ingestion cron's payload shape). When
  // omitted, sign fresh here — never leave a proof stored unsigned.
  signature?: string | null;
  signatureKeyId?: string | null;
  certMintedAt?: string | null;
}

// POST — attach a proof to an already-live problem (one that was promoted
// before it was proven). Idempotent: matches by exact title, only ever
// updates a row that still has proof IS NULL, never overwrites an existing
// proof. Returns 404 if no such unproven row exists (already attached, or
// the title doesn't match any live problem) — the caller should treat that
// as "nothing to do", not retry blindly.
export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as AttachProofBody | null;
  if (!body?.title || !body?.proof) {
    return NextResponse.json({ error: 'title and proof required' }, { status: 400 });
  }

  const provedAt = body.provedAt ?? new Date().toISOString();
  let certMintedAt = body.certMintedAt ?? null;
  let signature = body.signature ?? null;
  let signatureKeyId = body.signatureKeyId ?? null;

  // No pre-signed certificate supplied — sign one now, same construction the
  // ingestion cron uses, so a push-proved problem's certificate is bit-for-bit
  // the same kind of artifact as one that arrived via the normal queue.
  if (!signature || !certMintedAt) {
    certMintedAt = new Date().toISOString();
    const canonical = fullCertificate(body.proof, {
      title: body.title,
      mintedAt: certMintedAt,
      provedAt,
    }).trimEnd();
    const sig = signCertificate(canonical);
    if (sig) {
      signature = sig.signature;
      signatureKeyId = sig.keyId;
    }
  }

  try {
    const result = await attachProofToLiveProblem({
      title: body.title,
      proof: body.proof,
      provedAt,
      certMintedAt,
      signature,
      signatureKeyId,
    });
    if (!result) {
      return NextResponse.json(
        { error: 'No unproven live problem with that exact title' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, questionId: result.questionId });
  } catch (error) {
    console.error('Attach-proof error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
