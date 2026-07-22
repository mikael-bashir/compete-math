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
    badgeUrl?: string;
    badgeNoBorder?: boolean;
    titleColorFrom?: string | null;
    titleColorTo?: string | null;
    titleTextColor?: string | null;
    // add any other fields User type has
  }
  interface Session {
    user: User;
    badgeUrl?: string;
    badgeNoBorder?: boolean;
    titleColorFrom?: string | null;
    titleColorTo?: string | null;
    titleTextColor?: string | null;
  }
}

declare module "next-auth/jwt" {
  /**
   * Override NextAuth’s default JWT payload
   * so TypeScript recognizes your custom properties.
   */
  interface JWT {
    id: string;
    username: string;
    iat?: number;
    badgeUrl?: string;
    badgeNoBorder?: boolean;
    titleColorFrom?: string | null;
    titleColorTo?: string | null;
    titleTextColor?: string | null;
    /** add any other properties you write into the token */
  }
}
