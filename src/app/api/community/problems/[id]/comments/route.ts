import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";

// POST /api/community/problems/:id/comments  { body }
// A problem-level discussion comment (where solvers compare approaches).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const problemId = parseInt(id);
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "Sign in to comment" }, { status: 401 });
  }

  try {
    const { body } = await request.json();
    if (!body?.trim()) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }
    if (body.length > 4000) {
      return NextResponse.json({ error: "Comment too long" }, { status: 400 });
    }

    const exists = await sql`
      SELECT id FROM community_problems WHERE id = ${problemId} AND status = 'approved';
    `;
    if (exists.rowCount === 0) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const result = await sql`
      INSERT INTO community_comments (problem_id, author_username, body)
      VALUES (${problemId}, ${session.user.username}, ${body.trim()})
      RETURNING id;
    `;
    return NextResponse.json({ success: true, id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Community comment error:", error);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}
