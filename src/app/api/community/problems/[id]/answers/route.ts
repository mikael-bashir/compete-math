import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";

// POST /api/community/problems/:id/answers  { body }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "Sign in to post an answer" }, { status: 401 });
  }

  try {
    const { body } = await request.json();
    if (!body?.trim()) {
      return NextResponse.json({ error: "Answer cannot be empty" }, { status: 400 });
    }
    if (body.length > 20000) {
      return NextResponse.json({ error: "Answer too long" }, { status: 400 });
    }

    // Only approved problems accept answers.
    const problem = await sql`
      SELECT id FROM community_problems WHERE id = ${id} AND status = 'approved';
    `;
    if (problem.rowCount === 0) {
      return NextResponse.json({ error: "Problem not open for answers" }, { status: 404 });
    }

    const result = await sql`
      INSERT INTO community_answers (problem_id, author_username, body)
      VALUES (${id}, ${session.user.username}, ${body.trim()})
      RETURNING id;
    `;
    return NextResponse.json({ success: true, id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Answer create error:", error);
    return NextResponse.json({ error: "Failed to post answer" }, { status: 500 });
  }
}
