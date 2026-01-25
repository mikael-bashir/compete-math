import { NextResponse, NextRequest } from 'next/server';
import { sql } from "@vercel/postgres";

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + 
         ' at ' + 
         date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const getGlobalCutoff = () => {
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  return cutoff.toISOString();
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const problemId = parseInt(id);
  const cutoffTimestamp = getGlobalCutoff(); 

  try {
    const recentProblemsResult = await sql`
      SELECT "questionId" as id, "questionTitle" as title
      FROM questions
      ORDER BY "questionId" DESC
      LIMIT 7;
    `;
    const recentProblems = recentProblemsResult.rows;
    const activeProblemId = problemId ? problemId : (recentProblems[0]?.id || 0);

    if (activeProblemId === 0) return NextResponse.json({ recentProblems: [], leaderboard: [] });

    // UPDATED QUERY: Fetch badgeName (Title) AND badgeUrl (Icon)
    const leaderboardResult = await sql`
      SELECT 
        u.username,
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
      // Icon ID (e.g. 'crown', 'zap')
      badgeId: row.badgeUrl,
      // Display Title (e.g. 'The Monarch', 'Participant') - DIRECT FROM DB
      badgeTitle: row.badgeName || 'Participant', 
      solvedAt: formatDate(row.solvedAt),
      attempts: row.attemptCount,
      timeTaken: new Date(row.solvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    }));

    const response = NextResponse.json({ 
      recentProblems, 
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