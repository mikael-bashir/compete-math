export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUnprovenLiveProblems } from '@/app/lib/data/problems';

// Server-to-server only (Leak's admin backend, not a browser session) — same
// shared-secret pattern as the cron endpoints, since there's no CompeteMath
// user session to check here.
function authorized(request: Request): boolean {
  const secret = process.env.LEAK_SYNC_SECRET;
  if (!secret) return false;
  const header = request.headers.get('Authorization');
  if (header === `Bearer ${secret}`) return true;
  const key = new URL(request.url).searchParams.get('key');
  return key === secret;
}

// GET → every live problem with no proof attached yet (promoted before it was
// proven). Leak's admin "push prove" tool lists these, proves one, and calls
// /api/admin/problems/attach-proof to close the loop.
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const problems = await getUnprovenLiveProblems();
    return NextResponse.json({ problems });
  } catch (error) {
    console.error('Unproven-list error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
