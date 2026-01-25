import type { NextAuthConfig } from 'next-auth';

import { User } from "@/app/lib/types/user";
import type { JWT } from "next-auth/jwt";
// import { JWTType } from "next-auth/jwt";
import type { Session } from "next-auth";



export const authConfig = {
    pages: {
        signIn: '/auth/login',
        signOut: '/auth/logout',
        newUser: '/',
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
                iat: token.iat || Date.now(),
                badgeUrl: token?.badgeUrl ? token.badgeUrl : '/badges/newbie.png'
            };
            return session;
        },
    // 3. Authorized: The Guard Logic (Proxy only)
    authorized({ auth, request: { nextUrl } }) {
        // NOW 'auth.user' will actually have data because the session callback above ran!
        // @ts-ignore
        const isLoggedIn = !!auth?.user?.username;

        console.log("🔥 PROXY CHECK:", nextUrl.pathname);
        console.log("👤 User:", auth?.user); 

        const isOnDashboard = nextUrl.pathname === '/account';
        const isOnArchives = nextUrl.pathname.startsWith('/archives');
        const isOnAuth = nextUrl.pathname.startsWith('/auth');

        if (isLoggedIn && isOnAuth) {
            return Response.redirect(new URL('/', nextUrl));
        }

        if (isOnDashboard || isOnArchives) {
            if (isLoggedIn) return true;
            return false; 
        }

        return true;
    },
  },
} satisfies NextAuthConfig;
