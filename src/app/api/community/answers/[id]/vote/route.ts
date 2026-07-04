import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";

// POST /api/community/answers/:id/vote — toggle the caller's upvote.
// Upvotes only, by design: no downvote path exists.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "Sign in to vote" }, { status: 401 });
  }
  const username = session.user.username;

  try {
    const existing = await sql`
      SELECT 1 FROM community_answer_votes WHERE answer_id = ${id} AND username = ${username};
    `;
    if (existing.rowCount && existing.rowCount > 0) {
      await sql`
        DELETE FROM community_answer_votes WHERE answer_id = ${id} AND username = ${username};
      `;
    } else {
      await sql`
        INSERT INTO community_answer_votes (answer_id, username)
        VALUES (${id}, ${username})
        ON CONFLICT DO NOTHING;
      `;
    }
    const count = await sql`
      SELECT COUNT(*)::int AS votes FROM community_answer_votes WHERE answer_id = ${id};
    `;
    return NextResponse.json({
      success: true,
      votes: count.rows[0].votes,
      voted: !(existing.rowCount && existing.rowCount > 0),
    });
  } catch (error) {
    console.error("Vote error:", error);
    return NextResponse.json({ error: "Failed to vote" }, { status: 500 });
  }
}
