import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { signInSchema } from "@/app/lib/zod";
import { getUser } from "@/app/lib/data/auth";
import { User } from "@/app/lib/types/user";
import type { JWT } from "next-auth/jwt";
// import { JWTType } from "next-auth/jwt";
import type { Session } from "next-auth";
// import { AdapterUser } from "next-auth/adapters";
import { authConfig } from "./auth.config";

// working timestamp 11/01/26 23:21:44

// for future maintenance refer to the below links
// https://next-auth.js.org/providers/credentials#options
// https://next-auth.js.org/configuration/callbacks

export const { auth, handlers, signIn, signOut } = NextAuth({
    // pages: {
    //     signIn: '/auth/login',
    //     signOut: '/auth/logout',
    // },
    ...authConfig,
    providers: [
        CredentialsProvider({
            credentials: {
                identifier: { label: "Username or Email", type: "string", placeholder: "jessica.jackson@gmail.com" },
                password: { label: "Password", type: "string", placeholder: '***' },
            },
            async authorize(credentials) {
                let response;
                try {
                    response = await signInSchema.parseAsync(credentials);
                } catch(error) {
                    return null;
                }

                try{
                    const user = await getUser(response.identifier, response.password);
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
    // callbacks: {
    //     async jwt({ token, user, trigger, session }: { 
    //         token: JWT, 
    //         user?: User, 
    //         trigger?: "signIn" | "signUp" | "update", 
    //         session?: Session
    //     }) {

    //         if (user) {
    //             token.id = user.id;
    //             token.username = user.username;
    //             token.iat = "iat" in user ? user.iat : Date.now();
    //         }
            
    //         if (trigger === 'update' && session?.badgeUrl) {
    //             token.badgeUrl = session.badgeUrl
    //         }

    //         return token
    //     },

    //     async session({ session, token } : { session: Session, token: JWT }) {
    //         session.user = {
    //             id: token.id || "",
    //             username: token.username || "",
    //             iat: token.iat || Date.now(),
    //             badgeUrl: token?.badgeUrl ? token.badgeUrl : 'hexagon'
    //         };
    //         return session;
    //     },
    // },
});
