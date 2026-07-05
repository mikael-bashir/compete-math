import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";
import { isAdminEmail } from "@/app/lib/constants/site";

// GET /api/community/problems?status=approved&topic=Algebra&mine=1
// Public sees approved problems; authors see their own; admin sees any status.
export async function GET(request: NextRequest) {
  const session = await auth();
  const params = request.nextUrl.searchParams;
  const topic = params.get("topic");
  const mine = params.get("mine") === "1";
  const requestedStatus = params.get("status") || "approved";

  const username = session?.user?.username ?? null;
  const admin = isAdminEmail(session?.user?.email);

  // Only admins may list other people's non-approved problems.
  const status = admin || mine ? requestedStatus : "approved";

  try {
    const result = await sql`
      SELECT
        p.id, p.title, p.statement, p.topic, p.difficulty, p.knowledge,
        p.status, p.author_username, p.created_at, p.review_note,
        b."badgeUrl" AS author_badge,
        (SELECT COUNT(*)::int FROM community_submissions s WHERE s.problem_id = p.id AND s.is_correct) AS solve_count
      FROM community_problems p
      LEFT JOIN users u ON u.username = p.author_username
      LEFT JOIN badges b ON b."badgeName" = u."badgeSelected"
      WHERE p.status = ${status}
        AND (${mine ? username : null}::text IS NULL OR p.author_username = ${username})
        AND (${topic}::text IS NULL OR p.topic = ${topic})
      ORDER BY p.created_at DESC
      LIMIT 100;
    `;
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Community list error:", error);
    return NextResponse.json({ error: "Failed to fetch problems" }, { status: 500 });
  }
}

// POST /api/community/problems  { title, statement, proposedAnswer, topic, difficulty, knowledge }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "Sign in to draft a problem" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, statement, proposedAnswer, topic, difficulty, knowledge } = body;

    if (!title?.trim() || !statement?.trim()) {
      return NextResponse.json({ error: "Title and statement are required" }, { status: 400 });
    }
    if (title.length > 200 || statement.length > 20000) {
      return NextResponse.json({ error: "Title or statement too long" }, { status: 400 });
    }
    // Community problems are checked by a single numeric answer.
    const answer = proposedAnswer != null ? String(proposedAnswer).trim() : "";
    if (!answer) {
      return NextResponse.json({ error: "A numeric answer is required" }, { status: 400 });
    }
    if (!Number.isFinite(Number(answer))) {
      return NextResponse.json({ error: "The answer must be a number" }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO community_problems
        (title, statement, proposed_answer, topic, difficulty, knowledge, status, author_username)
      VALUES
        (${title.trim()}, ${statement.trim()}, ${answer},
         ${topic || "Algebra"}, ${difficulty || "Medium"}, ${knowledge || null},
         'pending', ${session.user.username})
      RETURNING id;
    `;
    return NextResponse.json({ success: true, id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Community create error:", error);
    return NextResponse.json({ error: "Failed to create problem" }, { status: 500 });
  }
}
