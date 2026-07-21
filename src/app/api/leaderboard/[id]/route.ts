import { NextResponse, NextRequest } from 'next/server';
import { sql } from "@vercel/postgres";
import { getFeaturedProblem } from '@/app/lib/data/problems';

// DAILY REFRESH: these leaderboards only refresh once a day, at 00:00 UTC.
// Every board is cut off at the most recent UTC midnight, so solves made today
// appear tomorrow. The one exception is /api/leaderboard/featured (see below),
// which is live. The s-maxage=60 header below is just CDN caching on top.
const getGlobalCutoff = () => {
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  return cutoff.toISOString();
};

// GET /api/leaderboard/:id — leaderboard for one problem.
// GET /api/leaderboard/latest — leaderboard for the most recent problem that
// actually has entries, so the default view is never an empty hall.
// GET /api/leaderboard/featured — leaderboard for the current featured problem
// (same getFeaturedProblem() the home card uses, so they can never drift), and
// LIVE (no daily cutoff): someone racing the featured problem sees themselves
// on the board the moment they solve it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const problemId = parseInt(id);
  const cutoffTimestamp =
    id === 'featured' ? new Date().toISOString() : getGlobalCutoff();

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
      // "latest": newest problem with at least one visible (pre-cutoff) solve.
      const latestRes = await sql`
        SELECT q."questionId" AS id, q."questionTitle" AS title
        FROM questions q
        WHERE EXISTS (
          SELECT 1 FROM submissions s
          WHERE s."questionId" = q."questionId"
            AND s."isCorrect" = TRUE
            AND s."solvedAt" < ${cutoffTimestamp}
        )
        ORDER BY q."questionId" DESC
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
        b."badgeName",
        s."solvedAt",
        s."attemptCount"
      FROM submissions s
      JOIN users u ON s.username = u.username
      LEFT JOIN badges b ON u."badgeSelected" = b."badgeName"
      WHERE s."questionId" = ${activeProblemId}
        AND s."isCorrect" = TRUE
        AND s."solvedAt" < ${cutoffTimestamp}
      ORDER BY s."solvedAt" ASC
      LIMIT 100;
    `;

    const leaderboard = leaderboardResult.rows.map((row, index) => ({
      rank: index + 1,
      username: row.username,
      // Icon URL for the equipped badge
      badgeId: row.badgeUrl,
      // Display title (e.g. 'The Monarch', 'Participant')
      badgeTitle: row.badgeName || 'Participant',
      // Raw ISO timestamp — clients own the formatting
      solvedAt: row.solvedAt,
      attempts: Number(row.attemptCount) || 1,
      // ISO 3166-1 alpha-2, null until known
      country: row.country || null,
    }));

    const response = NextResponse.json({
      problem: { id: activeProblemId, title: problemTitle },
      leaderboard,
      nextUpdate: new Date(new Date(cutoffTimestamp).getTime() + 86400000).toISOString()
    });

    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');

    return response;

  } catch (e) {
    console.error("Leaderboard API Error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
