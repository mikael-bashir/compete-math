import { NextResponse } from 'next/server';
import { verifyEmailToken } from '@/app/lib/email/verification';

// GET /api/auth/verify?token=… — the link in the verification email. Consumes
// the token, marks the account verified, and redirects to a friendly result
// page. Single-use; expired/invalid tokens just show the corresponding message.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  let status: string;
  try {
    status = await verifyEmailToken(token);
  } catch (error) {
    console.error('verify route error:', error);
    status = 'invalid';
  }
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/auth/verify?status=${status}`);
}
