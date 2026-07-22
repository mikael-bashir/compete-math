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

  const { title } = await req.json(); // This is the titleName

  // 2. Validation
  if (!title || typeof title !== "string") {
    return new NextResponse("Title Name required", { status: 400 });
  }

  try {
    const username = session.user.username;
    const isAdmin = isAdminEmail(session.user.email);

    // 3. SECURE UPDATE
    // Non-admins may only equip a title they own; admins may equip ANY title
    // that exists (the EXISTS guard still blocks a non-existent titleName).
    const result = isAdmin
      ? await sql`
          UPDATE users
          SET "titleSelected" = ${title}
          WHERE username = ${username}
          AND EXISTS (SELECT 1 FROM titles WHERE "titleName" = ${title})
        `
      : await sql`
          UPDATE users
          SET "titleSelected" = ${title}
          WHERE username = ${username}
          AND ${title} = ANY(titles)
        `;

    if (result.rowCount === 0) {
      return new NextResponse(
        isAdmin
          ? "Failed to equip: no such title."
          : "Failed to equip: You do not own this title.",
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, title });

  } catch (error) {
    console.error("Database Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
