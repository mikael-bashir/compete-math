import NextAuth, { DefaultSession } from "next-auth"
import { JWT as DefaultJWT } from "next-auth/jwt"

// 1a) Extend the JWT payload
declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string
    username?: string
    iat?: number
  }
}

// 1b) Extend the Session.user
declare module "next-auth" {
  interface Session {
    user: {
      id?: string
      username?: string
      iat?: number
    } & DefaultSession["user"]
  }
}
