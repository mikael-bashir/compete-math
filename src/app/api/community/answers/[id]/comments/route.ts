import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";

// POST /api/community/answers/:id/comments  { body }
// Comments are flat: they attach to an answer, never to another comment.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "Sign in to comment" }, { status: 401 });
  }

  try {
    const { body } = await request.json();
    if (!body?.trim()) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }
    if (body.length > 5000) {
      return NextResponse.json({ error: "Comment too long" }, { status: 400 });
    }

    const answer = await sql`SELECT id FROM community_answers WHERE id = ${id};`;
    if (answer.rowCount === 0) {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }

    const result = await sql`
      INSERT INTO community_answer_comments (answer_id, author_username, body)
      VALUES (${id}, ${session.user.username}, ${body.trim()})
      RETURNING id, created_at;
    `;
    return NextResponse.json({ success: true, id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Comment error:", error);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}
