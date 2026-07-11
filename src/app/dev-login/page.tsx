import { redirect } from 'next/navigation';
import { signIn } from '@/app/(auth)/auth';

// DEV-ONLY. Renders only under `next dev`; 404-equivalent (redirects home) in any
// production/preview build. Signs in as the mock user so local verification can
// reach authenticated pages. Not linked from anywhere in the UI.
export default function DevLoginPage() {
  if (process.env.NODE_ENV !== 'development') redirect('/');
  return (
    <div className="min-h-screen bg-[#180f0e] flex items-center justify-center">
      <form
        action={async () => {
          'use server';
          await signIn('dev-mock', { redirectTo: '/practice' });
        }}
      >
        <button
          type="submit"
          className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-5 py-2.5 font-mono text-sm text-amber-200 hover:bg-amber-500/15"
        >
          Dev login as devtester
        </button>
      </form>
    </div>
  );
}
