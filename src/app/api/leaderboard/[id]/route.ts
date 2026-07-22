import { NextResponse, NextRequest } from 'next/server';
import { sql } from "@vercel/postgres";
import { getFeaturedProblem } from '@/app/lib/data/problems';

// GET /api/leaderboard/:id — leaderboard for one problem.
// GET /api/leaderboard/latest — leaderboard for the most recent problem that
// actually has entries, so the default view is never an empty hall.
// GET /api/leaderboard/featured — leaderboard for the current featured problem
// (same getFeaturedProblem() the home card uses, so they can never drift).
// All boards are live: a solve appears on its leaderboard immediately, and
// the response is never cached (see `no-store` below).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const problemId = parseInt(id);

  try {
    let activeProblemId: number;
    let problemTitle: string | null = null;

    if (id === 'featured') {
      const featured = await getFeaturedProblem();
      if (!featured) {
        return NextResponse.json({ problem: null, leaderboard: [] });
      }
      activeProblemId = featured.id;
      problemTitle = featured.title;
    } else if (Number.isFinite(problemId)) {
      activeProblemId = problemId;
      const titleRes = await sql`
        SELECT "questionTitle" AS title FROM questions WHERE "questionId" = ${activeProblemId};
      `;
      problemTitle = titleRes.rows[0]?.title ?? null;
    } else {
      // "latest": newest problem with a LIVELY board — at least 3 solvers,
      // so the default view doesn't look dead. If no board has 3 yet, fall
      // back to the most-populated one (newest on ties) so the default is
      // still never empty.
      const latestRes = await sql`
        SELECT q."questionId" AS id, q."questionTitle" AS title
        FROM questions q
        JOIN submissions s ON s."questionId" = q."questionId"
          AND s."isCorrect" = TRUE
        GROUP BY q."questionId", q."questionTitle"
        ORDER BY (COUNT(*) >= 3) DESC,
                 CASE WHEN COUNT(*) >= 3 THEN q."questionId" ELSE 0 END DESC,
                 COUNT(*) DESC,
                 q."questionId" DESC
        LIMIT 1;
      `;
      if (latestRes.rowCount === 0) {
        return NextResponse.json({ problem: null, leaderboard: [] });
      }
      activeProblemId = latestRes.rows[0].id;
      problemTitle = latestRes.rows[0].title;
    }

    const leaderboardResult = await sql`
      SELECT
        u.username,
        u.country,
        b."badgeUrl",
        t."titleName",
        s."solvedAt",
        s."attemptCount"
      FROM submissions s
      JOIN users u ON s.username = u.username
      LEFT JOIN badges b ON u."badgeSelected" = b."badgeName"
      LEFT JOIN titles t ON u."titleSelected" = t."titleName"
      WHERE s."questionId" = ${activeProblemId}
        AND s."isCorrect" = TRUE
      ORDER BY s."solvedAt" ASC
      LIMIT 100;
    `;

    const leaderboard = leaderboardResult.rows.map((row, index) => ({
      rank: index + 1,
      username: row.username,
      // Icon URL for the equipped badge - badges and titles are independent
      // entities, the icon still comes from the badge, not the title.
      badgeId: row.badgeUrl,
      // Display title (e.g. 'The margin was too small', 'Participant')
      title: row.titleName || 'Participant',
      // Raw ISO timestamp — clients own the formatting
      solvedAt: row.solvedAt,
      attempts: Number(row.attemptCount) || 1,
      // ISO 3166-1 alpha-2, null until known
      country: row.country || null,
    }));

    const response = NextResponse.json({
      problem: { id: activeProblemId, title: problemTitle },
      leaderboard,
    });

    response.headers.set('Cache-Control', 'no-store');

    return response;

  } catch (e) {
    console.error("Leaderboard API Error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
