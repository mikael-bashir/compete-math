// export { auth as middleware } from "./auth";

import { auth } from "./auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { protectedRoutes } from "@/app/lib/constants/auth/protected-routes";

export default async function middleware(req: NextRequest) {
    const session = await auth();

    if (protectedRoutes.some(path => req.nextUrl.pathname.startsWith(path))) {
        if (!session) {
            return NextResponse.redirect(new URL("/login", req.url));
        }
    }

    return NextResponse.next();
}
