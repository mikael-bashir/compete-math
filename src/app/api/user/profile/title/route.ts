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

  const { title } = await req.json(); // This is the titleName

  // 2. Validation
  if (!title || typeof title !== "string") {
    return new NextResponse("Title Name required", { status: 400 });
  }

  try {
    const username = session.user.username;

    // 3. SECURE UPDATE
    // Update 'titleSelected' ONLY IF the titleName exists in the 'titles' text[] array
    // We use the Postgres ANY() operator for the array check.
    const result = await sql`
      UPDATE users
      SET "titleSelected" = ${title}
      WHERE username = ${username}
      AND ${title} = ANY(titles)
    `;

    if (result.rowCount === 0) {
      // No rows updated implies the user doesn't own the title (or user not found)
      return new NextResponse("Failed to equip: You do not own this title.", { status: 403 });
    }

    return NextResponse.json({ success: true, title });

  } catch (error) {
    console.error("Database Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
