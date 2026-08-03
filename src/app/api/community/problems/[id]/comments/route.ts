import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";
import { isAdminEmail, COMMUNITY_MAX_ATTEMPTS } from "@/app/lib/constants/site";

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
      SELECT id, author_username FROM community_problems WHERE id = ${problemId} AND status = 'approved';
    `;
    if (exists.rowCount === 0) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    // You can only post to a discussion you're allowed to read: the viewer must
    // have finished the problem (solved, or all attempts used) — or be the
    // author/admin. Mirrors the read gate in the GET route so nobody can seed
    // spoilers into a discussion that's still locked for them.
    const admin = isAdminEmail(session.user.email);
    if (!admin && exists.rows[0].author_username !== session.user.username) {
      const subRes = await sql`
        SELECT attempt_count, is_correct FROM community_submissions
        WHERE problem_id = ${problemId} AND username = ${session.user.username};
      `;
      const used = (subRes.rows[0]?.attempt_count as number) ?? 0;
      const solved = (subRes.rows[0]?.is_correct as boolean) ?? false;
      if (!solved && used < COMMUNITY_MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: "Solve the problem (or use all your attempts) to join the discussion." },
          { status: 403 },
        );
      }
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
