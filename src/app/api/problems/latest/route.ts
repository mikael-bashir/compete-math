import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { auth } from '@/app/(auth)/auth';

// Points shown for the featured problem, derived from its difficulty.
const POINTS: Record<string, number> = {
  Easy: 50,
  Medium: 100,
  Hard: 150,
  Insane: 200,
  Extreme: 200,
};

// The "Problem of the Week" is now a featured COMMUNITY problem. We pick a
// stable weekly rotation over the approved pool so it doesn't change mid-week,
// and the home card links through to /community/[id] to attempt/discuss it.
export async function GET() {
  await auth();

  try {
    const res = await sql`
      SELECT id, title, statement, topic, difficulty
      FROM community_problems
      WHERE status = 'approved'
      ORDER BY id ASC;
    `;
    const rows = res.rows;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No problems found' }, { status: 404 });
    }

    const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const p = rows[week % rows.length];

    return NextResponse.json({
      id: p.id,
      title: p.title,
      subtitle: p.topic,
      content: p.statement,
      difficulty: p.difficulty,
      points: POINTS[p.difficulty] ?? 100,
      community: true,
      isSolved: false,
    });
  } catch (error) {
    console.error('Failed to fetch weekly problem:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
