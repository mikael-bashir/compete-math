'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

// Seeding SessionProvider with the session resolved on the server means
// useSession() returns the correct auth state on the very first paint — no
// loading→authenticated flip (which was flickering the home greeting/nav).
export default function SessionProviderWrapper({
	children,
	session,
}: {
	children: React.ReactNode;
	session?: Session | null;
}) {
	return <SessionProvider session={session}>{children}</SessionProvider>;
}
