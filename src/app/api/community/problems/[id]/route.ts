import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";
import { isAdminEmail, COMMUNITY_MAX_ATTEMPTS } from "@/app/lib/constants/site";

// GET /api/community/problems/:id — problem + the viewer's attempt state +
// problem-level discussion comments. The canonical answer (proposed_answer) is
// only ever returned to the admin, never leaked to solvers.
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
    const row = problemRes.rows[0];

    // Non-approved problems are visible only to their author and the admin.
    if (row.status !== "approved" && !admin && row.author_username !== username) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Strip the answer for everyone except the admin (who reviews it).
    const problem = { ...row };
    if (!admin) delete problem.proposed_answer;

    // The viewer's own attempt state (capped at COMMUNITY_MAX_ATTEMPTS).
    let submission = { attemptsUsed: 0, attemptsLeft: COMMUNITY_MAX_ATTEMPTS, solved: false };
    if (username) {
      const subRes = await sql`
        SELECT attempt_count, is_correct FROM community_submissions
        WHERE problem_id = ${id} AND username = ${username};
      `;
      if (subRes.rows[0]) {
        const used = subRes.rows[0].attempt_count as number;
        submission = {
          attemptsUsed: used,
          attemptsLeft: Math.max(0, COMMUNITY_MAX_ATTEMPTS - used),
          solved: subRes.rows[0].is_correct as boolean,
        };
      }
    }

    const solveCountRes = await sql`
      SELECT COUNT(*)::int AS n FROM community_submissions
      WHERE problem_id = ${id} AND is_correct = TRUE;
    `;

    const commentsRes = await sql`
      SELECT c.id, c.author_username, c.body, c.created_at,
             b."badgeUrl" AS author_badge
      FROM community_comments c
      LEFT JOIN users u ON u.username = c.author_username
      LEFT JOIN badges b ON b."badgeName" = u."badgeSelected"
      WHERE c.problem_id = ${id}
      ORDER BY c.created_at ASC;
    `;

    return NextResponse.json({
      problem,
      submission,
      solveCount: solveCountRes.rows[0].n,
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
