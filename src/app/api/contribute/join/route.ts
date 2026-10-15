import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { applyToJoin } from '@/app/lib/join/join';

export const dynamic = 'force-dynamic';

const MAX_BODY = 20_000;

// POST /api/contribute/join: the form on /contribute/join. The owner gets the application by email; a signed-in applicant with an
// email on file also gets a copy.
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'That is too long.' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'That did not look like a form.' }, { status: 400 });
  }

  const session = await auth().catch(() => null);
  const user = session?.user;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';

  try {
    const result = await applyToJoin(
      { github: String(body.github ?? ''), sixMonths: String(body.sixMonths ?? ''), fiveYears: String(body.fiveYears ?? ''), company: String(body.company ?? '') },
      { userId: user?.id || undefined, username: user?.username || undefined, email: user?.email || undefined },
      ip,
    );
    switch (result.status) {
      case 'ok':
        return NextResponse.json({ ok: true, copySent: Boolean(user?.email) });
      case 'invalid':
        return NextResponse.json({ error: 'Please check the form.', errors: result.errors }, { status: 400 });
      case 'rate_limited':
        return NextResponse.json({ error: result.message }, { status: 429 });
      case 'send_failed':
        return NextResponse.json({ error: 'We could not send your application just now. Please try again in a minute.' }, { status: 502 });
    }
  } catch (e) {
    console.error('join application failed:', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
