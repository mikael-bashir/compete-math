import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

// GET /api/users/:username — public profile: identity, badges, contributions.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;

  try {
    const userRes = await sql`
      SELECT u.username, u.email, u.created_at, u.badges, u."badgeSelected",
             b."badgeUrl" AS badge_url
      FROM users u
      LEFT JOIN badges b ON b."badgeName" = u."badgeSelected"
      WHERE u.username = ${username};
    `;
    if (userRes.rowCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const user = userRes.rows[0];

    const [solvedRes, problemsRes, answersRes, streakRes] = await Promise.all([
      sql`
        SELECT COUNT(*)::int AS solved
        FROM submissions
        WHERE username = ${username} AND "isCorrect" = TRUE;
      `,
      sql`
        SELECT id, title, topic, difficulty, status, created_at,
          (SELECT COUNT(*)::int FROM community_answers a WHERE a.problem_id = p.id) AS answer_count
        FROM community_problems p
        WHERE author_username = ${username} AND status = 'approved'
        ORDER BY created_at DESC
        LIMIT 50;
      `,
      sql`
        SELECT a.id, a.body, a.created_at, a.problem_id,
          p.title AS problem_title,
          (SELECT COUNT(*)::int FROM community_answer_votes v WHERE v.answer_id = a.id) AS votes
        FROM community_answers a
        JOIN community_problems p ON p.id = a.problem_id
        WHERE a.author_username = ${username} AND p.status = 'approved'
        ORDER BY a.created_at DESC
        LIMIT 50;
      `,
      sql`
        SELECT DISTINCT DATE("solvedAt") AS solved_date
        FROM submissions
        WHERE username = ${username} AND "isCorrect" = TRUE
        ORDER BY solved_date DESC;
      `,
    ]);

    // Same streak algorithm as /api/user/profile/streak, applied publicly.
    const dates = streakRes.rows.map((r) => new Date(r.solved_date));
    let streak = 0;
    if (dates.length > 0) {
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const toUTC = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

      if (toUTC(dates[0]) === today.getTime() || toUTC(dates[0]) === yesterday.getTime()) {
        streak = 1;
        for (let i = 1; i < dates.length; i++) {
          const expected = toUTC(dates[i - 1]) - 24 * 60 * 60 * 1000;
          if (toUTC(dates[i]) === expected) streak++;
          else break;
        }
      }
    }

    return NextResponse.json({
      username: user.username,
      // Email only ever shown as a display-name fallback, never as contact info.
      email: user.email,
      joinedAt: user.created_at,
      badgeSelected: user.badgeSelected,
      badgeUrl: user.badge_url,
      badges: user.badges || [],
      solvedCount: solvedRes.rows[0].solved,
      streak,
      problems: problemsRes.rows,
      answers: answersRes.rows,
    });
  } catch (error) {
    console.error("Public profile error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
