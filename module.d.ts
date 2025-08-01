// module.d.ts

import NextAuth from "next-auth";
import type { JWT as JWTType } from "next-auth/jwt";

declare module "next-auth" {
  /**
   * Override NextAuth’s default User signature
   * so TypeScript knows that `user` in callbacks is your own User,
   * not an AdapterUser.
   */
  interface User {
    id: string;
    username: string;
    iat?: number;
    email?: string;
    emailVerified?: Date | null;
    // add any other fields User type has
  }
  interface Session {
    user: User;
  }
}

declare module "next-auth/jwt" {
  /**
   * Override NextAuth’s default JWT payload
   * so TypeScript recognizes your custom properties.
   */
  interface JWTType {
    id: string;
    username: string;
    iat?: number;
    /** add any other properties you write into the token */
  }
}
