import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { signInSchema } from "@/app/lib/zod";
import { getUser } from "@/app/lib/data/users";
import { User } from "@/app/lib/types/user";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";

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
                console.log('we got to the authorize step, with credentials:', credentials);
                let response;
                try {
                    response = await signInSchema.parseAsync(credentials);
                } catch(error) {
                    console.error("Illegal input type");
                    console.log(error);
                    return null;
                }


                try{
                    const user = await getUser(response.username, response.password);
                    if (!user) {
                        console.error("Invalid credentials: username or password is wrong");
                        return null;
                    }
                    console.log('we have obtained a user, at the authorize step:', user);
                    return user;
                    
                } catch(error) {
                    console.error("Invalid credentials: username or password is wrong");
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
                token.iat = user.iat || Date.now();
            }
            return token
        },
        async session({ session, token } : { session: Session, token: JWT }) {
            session.user = {
                id: token.id || "",
                username: token.username || "",
                iat: token.iat
            };
            return session;
        },
    },
});
