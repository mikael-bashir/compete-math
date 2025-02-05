import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { signInSchema } from "@/app/lib/zod";
import { getUser } from "@/app/lib/data/users";
import { User } from "@/app/lib/types/user";
import { DefaultSession } from "next-auth";


// Extend NextAuth types to include your custom properties.
declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            username: string;
            iat: number;
        } & DefaultSession["user"];
    }
    interface JWT {
        id: string;
        username?: string;
        iat: number;
    }
}

export const { auth, handlers, signIn, signOut } = NextAuth({
    pages: {
        signIn: '/auth/login',
        signOut: '/auth/logout',
    },
    providers: [
        CredentialsProvider({
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                const response = await signInSchema.parseAsync(credentials);

                try{
                    const user = await getUser(response.username, response.password);
                    if (!user) {
                        console.error("Invalid credentials: username or password is wrong");
                        return null;
                    }
                    return user;
                } catch(error) {
                    console.error("Invalid credentials: username or password is wrong");
                    return null;
                }
            },
        }),
    ],
    callbacks: {
        jwt({ token, user }) {
            if (user) {
                token.id = (user as User).id;
                token.username = (user as User).username;
                token.iat = (user as User).iat || Date.now();
                token.email = ""; // Default to empty string
                token.emailVerified = false; // Default to false
            }
            return token;
        },
        session({ session, token }) {
            session.user = {
                id: (token.id as string) || "",
                username: (token.username as string) || "",
                iat: (token.iat as number),
                email: '',
                emailVerified: null,
            };
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
});
