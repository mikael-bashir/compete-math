import Link from 'next/link';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

// Result page the verification link redirects to after the token is consumed.
// Server component — the actual verification happens in /api/auth/verify.
export default async function VerifyResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const view =
    status === 'ok'
      ? {
          icon: <CheckCircle2 className="h-10 w-10 text-emerald-400" />,
          title: 'Email verified',
          body: 'Your account is confirmed. You’re all set.',
        }
      : status === 'expired'
        ? {
            icon: <Clock className="h-10 w-10 text-amber-400" />,
            title: 'Link expired',
            body: 'That verification link is more than 24 hours old. Sign in and request a fresh one.',
          }
        : {
            icon: <XCircle className="h-10 w-10 text-rose-400" />,
            title: 'Invalid link',
            body: 'This verification link is invalid or has already been used.',
          };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#180f0e] px-4 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="mb-4 flex justify-center">{view.icon}</div>
        <h1 className="text-xl font-semibold">{view.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{view.body}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/home"
            className="rounded-lg bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-500/25"
          >
            Go to CompeteMath
          </Link>
          <Link
            href="/auth/login"
            className="text-sm text-white/50 transition-colors hover:text-white"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
