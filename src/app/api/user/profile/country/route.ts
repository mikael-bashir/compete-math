import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { sql } from "@vercel/postgres";
import { isValidCountryCode } from "@/app/lib/data/countries";

// Set (or clear) the user's leaderboard country. Mirrors the badge route:
// authenticated, validated against the known ISO code list.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.username) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { country } = await req.json();

  if (country !== null && !isValidCountryCode(country)) {
    return new NextResponse("Unknown country code", { status: 400 });
  }
  const normalized = country === null ? null : country.toUpperCase();

  try {
    await sql`
      UPDATE users SET country = ${normalized}
      WHERE username = ${session.user.username};
    `;
    return NextResponse.json({ success: true, country: normalized });
  } catch (error) {
    console.error("Country update error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
