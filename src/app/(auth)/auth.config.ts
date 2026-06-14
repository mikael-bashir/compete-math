import type { NextAuthConfig } from 'next-auth';

import { User } from "@/app/lib/types/user";
import type { JWT } from "next-auth/jwt";
// import { JWTType } from "next-auth/jwt";
import type { Session } from "next-auth";

const useSecureCookies = process.env.NODE_ENV === 'production';
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

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
                // This tells the browser: "Let subdomains read this too"
                domain: useSecureCookies ? '.competemath.com' : 'localhost',
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
            }
            
            if (trigger === 'update' && session?.badgeUrl) {
                token.badgeUrl = session.badgeUrl
            }

            return token
        },

        async session({ session, token } : { session: Session, token: JWT }) {
            session.user = {
                id: token.id || "",
                username: token.username || "",
                email: token.email || "",
                iat: token.iat || Date.now(),
                badgeUrl: token?.badgeUrl ? token.badgeUrl : '/badges/newbie.png'
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
                    const allowedHosts = [
                        'competemath.com',
                        'leak.competemath.com',
                        'localhost' // Keep this for your local testing
                    ];

                    // 3. Check if the domain they want to go to is on the list
                    if (allowedHosts.includes(parsedCallback.hostname)) {
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
