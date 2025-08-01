import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { signInSchema } from "@/app/lib/zod";
import { getUser } from "@/app/lib/data/auth";
import { User } from "@/app/lib/types/user";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";
import { AdapterUser } from "next-auth/adapters";

// working timestamp 18/06/2025 09:42:21

// for future maintenance refer to the below links
// https://next-auth.js.org/providers/credentials#options
// https://next-auth.js.org/configuration/callbacks

export const { auth, handlers, signIn, signOut } = NextAuth({
    pages: {
        signIn: '/auth/login',
        signOut: '/auth/logout',
    },
    providers: [
        CredentialsProvider({
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password", placeholder: '***' },
            },
            async authorize(credentials) {
                let response;
                try {
                    response = await signInSchema.parseAsync(credentials);
                } catch(error) {
                    return null;
                }

                try{
                    const user = await getUser(response.username, response.password);
                    if (!user) {
                        return null;
                    }
                    return user;
                } catch(error) {
                    return null;
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user } : { token: JWT, user: User }) {

            if (user) {
                token.id = user.id;
                token.username = user.username;
                token.iat = "iat" in user ? user.iat : Date.now();
            }
            return token
        },
        async session({ session, token } : { session: Session, token: JWT }) {
            session.user = {
                id: token.id || "",
                username: token.username || "",
                iat: token.iat || Date.now()
            };
            return session;
        },
    },
});
