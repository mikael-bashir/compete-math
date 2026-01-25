import NextAuth from 'next-auth';

import { authConfig } from '@/app/(auth)/auth.config';

const { auth } = NextAuth(authConfig);

export function proxy(req: any) {
  // 2. Add this log. If this doesn't print, Next.js is broken. 
  // If it prints but the callback doesn't, NextAuth is broken.
  console.log("🔥 PROXY.TS IS HIT: ", req.nextUrl.pathname);
  
  // 3. Execute Auth.js
  return auth(req);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|images).*)'],
};
