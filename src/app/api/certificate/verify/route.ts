import { NextResponse } from 'next/server';
import { verifySignedText } from '@/app/lib/certificate-sign';

// POST /api/certificate/verify   { certificate: string }
// Public, unauthenticated. Given a pasted (possibly-tampered) signed certificate,
// verify its Ed25519 signature against CompeteMath's published public key. This
// is the tool that answers "how do I know this wasn't altered": change any byte
// of the signed content and `valid` comes back false.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const certificate = body?.certificate;
  if (typeof certificate !== 'string' || certificate.length === 0) {
    return NextResponse.json({ error: 'Provide a certificate string.' }, { status: 400 });
  }
  const { valid, keyId } = verifySignedText(certificate);
  return NextResponse.json({ valid, keyId });
}
