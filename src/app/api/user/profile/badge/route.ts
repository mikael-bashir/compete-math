import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth"; 
import { sql } from "@vercel/postgres";

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

    // 3. SECURE UPDATE
    // Update 'badgesSelected' ONLY IF the badgeName exists in the 'badges' text[] array
    // We use the Postgres ANY() operator for the array check.
    const result = await sql`
      UPDATE users 
      SET "badgeSelected" = ${badge}
      WHERE username = ${username}
      AND ${badge} = ANY(badges)
    `;

    if (result.rowCount === 0) {
      // No rows updated implies the user doesn't own the badge (or user not found)
      return new NextResponse("Failed to equip: You do not own this badge.", { status: 403 });
    }

    return NextResponse.json({ success: true, badge });

  } catch (error) {
    console.error("Database Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}