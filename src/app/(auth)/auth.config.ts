import type { NextAuthConfig } from 'next-auth';

import { User } from "@/app/lib/types/user";
import type { JWT } from "next-auth/jwt";
// import { JWTType } from "next-auth/jwt";
import type { Session } from "next-auth";

const useSecureCookies = process.env.NODE_ENV === 'production';
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

// Cookie domain resolution — this is what makes sign-in work on previews:
// - `.competemath.com` is shared across subdomains, but the browser REFUSES to
//   set that cookie on any host that isn't a competemath.com subdomain (e.g. a
//   *.vercel.app preview). Result: the sign-in succeeds server-side but no
//   session cookie is stored, so the UI never updates ("Sign In" persists).
// - So: share across .competemath.com ONLY on the Vercel *production* deploy;
//   every preview/dev deployment uses a host-only cookie (no domain) that works
//   on its own host. AUTH_COOKIE_DOMAIN still overrides everything if set
//   ('host-only' => undefined; any other value => that domain).
function resolveCookieDomain(): string | undefined {
  const override = process.env.AUTH_COOKIE_DOMAIN;
  if (override) return override === 'host-only' ? undefined : override;
  if (!useSecureCookies) return 'localhost';
  return process.env.VERCEL_ENV === 'production' ? '.competemath.com' : undefined;
}
const cookieDomain = resolveCookieDomain();

export const authConfig = {
    pages: {
        signIn: '/auth/login',
        signOut: '/auth/logout',
        newUser: '/',
    },
    cookies: {
        sessionToken: {
            name: `${cookiePrefix}authjs.session-token`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: useSecureCookies,
                // Shared across subdomains on prod; host-only on previews/dev.
                domain: cookieDomain,
            },
        },
    },      
    providers: [], // Keep this empty here! Providers live in auth.ts
    callbacks: {
        async jwt({ token, user, trigger, session }: { 
            token: JWT, 
            user?: User, 
            trigger?: "signIn" | "signUp" | "update", 
            session?: Session
        }) {

            if (user) {
                token.id = user.id;
                token.username = user.username;
                token.email = user.email;
                token.iat = "iat" in user ? user.iat : Date.now();
                // The badge equipped at sign-in time - without this, a fresh
                // login always falls back to session()'s hardcoded default
                // (newbie.png) regardless of what's actually equipped in the
                // DB, because token.badgeUrl otherwise only ever gets set by
                // the 'update' trigger below (i.e. only while the SAME
                // session is still alive - it's lost the moment the cookie
                // is reissued on next login).
                token.badgeUrl = user.badgeUrl;
                // Equipped title's prestige styling (null for plain titles) -
                // same fresh-login reasoning; drives the gradient on the name.
                token.titleColorFrom = user.titleColorFrom ?? null;
                token.titleColorTo = user.titleColorTo ?? null;
                token.titleTextColor = user.titleTextColor ?? null;
            }

            // Live updates from account/page.tsx's session.update(...). Presence
            // checks (not truthiness) so a title's colours can be cleared to null
            // when switching to a plain title. Fields are independent: equipping
            // a badge sends only badgeUrl, a title sends only the title colours.
            if (trigger === 'update' && session) {
                if ('badgeUrl' in session) token.badgeUrl = session.badgeUrl;
                if ('titleColorFrom' in session) token.titleColorFrom = session.titleColorFrom ?? null;
                if ('titleColorTo' in session) token.titleColorTo = session.titleColorTo ?? null;
                if ('titleTextColor' in session) token.titleTextColor = session.titleTextColor ?? null;
            }

            return token
        },

        async session({ session, token } : { session: Session, token: JWT }) {
            session.user = {
                id: token.id || "",
                username: token.username || "",
                email: token.email || "",
                iat: token.iat || Date.now(),
                badgeUrl: token?.badgeUrl ? token.badgeUrl : '/badges/newbie.png',
                titleColorFrom: token.titleColorFrom ?? null,
                titleColorTo: token.titleColorTo ?? null,
                titleTextColor: token.titleTextColor ?? null,
            };
            return session;
        },
    // 3. Authorized: The Guard Logic (Proxy only)
    authorized({ auth, request: { nextUrl } }) {
        // NOW 'auth.user' will actually have data because the session callback above ran!

        const isLoggedIn = !!auth?.user?.username;

        console.log("🔥 PROXY CHECK:", nextUrl.pathname);
        console.log("👤 User:", auth?.user); 

        // const isOnDashboard = nextUrl.pathname === '/account';
        // const isOnArchives = nextUrl.pathname.startsWith('/archives');
        const isOnAuth = nextUrl.pathname.startsWith('/auth');

        if (isLoggedIn && isOnAuth) {
            const callbackUrl = nextUrl.searchParams.get("callbackUrl");
            
            if (callbackUrl) {
                try {
                    // 1. Parse the URL (this also safely fails if the URL is total garbage)
                    const parsedCallback = new URL(callbackUrl);
                    
                    // 2. Define exactly who is allowed in the VIP room

                    const isAllowed = (h: string) =>
                        h === 'competemath.com' ||
                        h.endsWith('.competemath.com') ||  // covers leak. and all *.preview.leak.
                        h === 'localhost';

                    if (isAllowed(parsedCallback.hostname)) {

                    // const allowedHosts = [
                    //     'competemath.com',
                    //     'leak.competemath.com',
                    //     'localhost' // Keep this for your local testing
                    // ];

                    // // 3. Check if the domain they want to go to is on the list
                    // if (allowedHosts.includes(parsedCallback.hostname)) {
                        return Response.redirect(parsedCallback);
                    } else {
                        console.warn(`Blocked malicious redirect attempt to: ${parsedCallback.hostname}`);
                    }
                } catch (error) {
                    // If 'new URL()' fails, the callback string was invalid/malformed.
                    // Just ignore it and fall through to the default redirect.
                }
            }
            
            // 3. Default safe redirect
            return Response.redirect(new URL('/', nextUrl));
        }

        // if (isOnDashboard || isOnArchives) {
        //     if (isLoggedIn) return true;
        //     return false; 
        // }

        return true;
    },
  },
} satisfies NextAuthConfig;
