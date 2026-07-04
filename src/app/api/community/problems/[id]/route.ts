import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";
import { isAdminEmail } from "@/app/lib/constants/site";

// GET /api/community/problems/:id — problem + answers + votes + comments.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const username = session?.user?.username ?? null;
  const admin = isAdminEmail(session?.user?.email);

  try {
    const problemRes = await sql`
      SELECT p.*, b."badgeUrl" AS author_badge
      FROM community_problems p
      LEFT JOIN users u ON u.username = p.author_username
      LEFT JOIN badges b ON b."badgeName" = u."badgeSelected"
      WHERE p.id = ${id};
    `;
    if (problemRes.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const problem = problemRes.rows[0];

    // Non-approved problems are visible only to their author and the admin.
    if (problem.status !== "approved" && !admin && problem.author_username !== username) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const answersRes = await sql`
      SELECT
        a.id, a.author_username, a.body, a.created_at,
        b."badgeUrl" AS author_badge,
        (SELECT COUNT(*)::int FROM community_answer_votes v WHERE v.answer_id = a.id) AS votes,
        (${username}::text IS NOT NULL AND EXISTS (
          SELECT 1 FROM community_answer_votes v
          WHERE v.answer_id = a.id AND v.username = ${username}
        )) AS voted_by_me
      FROM community_answers a
      LEFT JOIN users u ON u.username = a.author_username
      LEFT JOIN badges b ON b."badgeName" = u."badgeSelected"
      WHERE a.problem_id = ${id}
      ORDER BY votes DESC, a.created_at ASC;
    `;

    const commentsRes = await sql`
      SELECT c.id, c.answer_id, c.author_username, c.body, c.created_at,
             b."badgeUrl" AS author_badge
      FROM community_answer_comments c
      LEFT JOIN users u ON u.username = c.author_username
      LEFT JOIN badges b ON b."badgeName" = u."badgeSelected"
      WHERE c.answer_id IN (SELECT id FROM community_answers WHERE problem_id = ${id})
      ORDER BY c.created_at ASC;
    `;

    return NextResponse.json({
      problem,
      answers: answersRes.rows,
      comments: commentsRes.rows,
      viewer: { username, isAdmin: admin },
    });
  } catch (error) {
    console.error("Community detail error:", error);
    return NextResponse.json({ error: "Failed to fetch problem" }, { status: 500 });
  }
}

// PATCH /api/community/problems/:id
// Admin: { action: "approve" | "reject", reviewNote? }
// Author: { action: "delete" } while still pending.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = isAdminEmail(session.user.email);

  try {
    const { action, reviewNote } = await request.json();

    if (action === "approve" || action === "reject") {
      if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const status = action === "approve" ? "approved" : "rejected";
      await sql`
        UPDATE community_problems
        SET status = ${status}, review_note = ${reviewNote ?? null}
        WHERE id = ${id};
      `;
      return NextResponse.json({ success: true, status });
    }

    if (action === "delete") {
      const res = await sql`
        DELETE FROM community_problems
        WHERE id = ${id}
          AND (${admin} OR (author_username = ${session.user.username} AND status = 'pending'))
        RETURNING id;
      `;
      if (res.rowCount === 0) {
        return NextResponse.json({ error: "Cannot delete this problem" }, { status: 403 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Community patch error:", error);
    return NextResponse.json({ error: "Failed to update problem" }, { status: 500 });
  }
}
