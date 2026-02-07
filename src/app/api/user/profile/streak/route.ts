import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { auth } from '@/app/(auth)/auth'; // Adjust path to your auth helper

export async function GET() {
  const session = await auth();
  
  // If not logged in, return 0
  if (!session?.user?.username) {
    return NextResponse.json({ streak: 0 });
  }

  const username = session.user.username;

  try {
    // 1. Get all unique dates where the user submitted a correct answer
    // DATE() truncates the timestamp to YYYY-MM-DD
    const result = await sql`
      SELECT DISTINCT DATE("solvedAt") as solved_date
      FROM submissions
      WHERE username = ${username} 
        AND "isCorrect" = TRUE
      ORDER BY solved_date DESC;
    `;

    const dates = result.rows.map(r => new Date(r.solved_date));
    let streak = 0;

    // 2. Calculate Streak
    if (dates.length > 0) {
      const now = new Date();
      // Normalize to midnight for accurate date comparison
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Normalize the latest submission date from DB
      const lastSolveRaw = dates[0];
      const lastSolve = new Date(Date.UTC(lastSolveRaw.getUTCFullYear(), lastSolveRaw.getUTCMonth(), lastSolveRaw.getUTCDate()));

      // Streak is active if the last solve was Today OR Yesterday
      if (lastSolve.getTime() === today.getTime() || lastSolve.getTime() === yesterday.getTime()) {
        streak = 1;

        // Iterate backwards checking for 1-day gaps
        for (let i = 0; i < dates.length - 1; i++) {
          const current = dates[i];
          const next = dates[i + 1];
          
          // Calculate difference in days (ms -> days)
          const diffTime = Math.abs(current.getTime() - next.getTime());
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            streak++;
          } else {
            break; // Streak broken
          }
        }
      }
    }

    // 3. Return with Caching Headers
    const response = NextResponse.json({ streak });
    // Cache for 24 hours (86400s), allow stale data for 10 minutes while revalidating
    response.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=600');
    
    return response;

  } catch (error) {
    console.error("Streak calc error:", error);
    return NextResponse.json({ error: 'Failed to fetch streak' }, { status: 500 });
  }
}