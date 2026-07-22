import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { sql } from "@vercel/postgres";
import { isAdminEmail } from "@/app/lib/constants/site";

export async function POST(req: Request) {
  const session = await auth();

  // 1. Auth Check
  // We check for name (username) because your DB shows email can be NULL
  if (!session?.user?.username) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { badge } = await req.json(); // This is the badgeName

  // 2. Validation
  if (!badge || typeof badge !== "string") {
    return new NextResponse("Badge Name required", { status: 400 });
  }

  try {
    const username = session.user.username;
    const isAdmin = isAdminEmail(session.user.email);

    // 3. SECURE UPDATE
    // Non-admins may only equip a badge they own (it must be in their 'badges'
    // text[] array). Admins may equip ANY badge that exists in the catalogue -
    // the EXISTS guard still prevents setting badgeSelected to a garbage name
    // (which would break the badgeUrl join and fall back to newbie.png).
    const result = isAdmin
      ? await sql`
          UPDATE users
          SET "badgeSelected" = ${badge}
          WHERE username = ${username}
          AND EXISTS (SELECT 1 FROM badges WHERE "badgeName" = ${badge})
        `
      : await sql`
          UPDATE users
          SET "badgeSelected" = ${badge}
          WHERE username = ${username}
          AND ${badge} = ANY(badges)
        `;

    if (result.rowCount === 0) {
      return new NextResponse(
        isAdmin
          ? "Failed to equip: no such badge."
          : "Failed to equip: You do not own this badge.",
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, badge });

  } catch (error) {
    console.error("Database Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}