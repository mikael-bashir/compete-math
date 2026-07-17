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

// The home "Featured problem" is an APPROACHABLE brain-teaser from the practice
// pool — a quick win to hook a new visitor, not a scary olympiad wall. We order
// by difficulty (easiest first) and rotate weekly over the easiest tier so the
// pick stays fresh but always low-effort. Links through to /practice/problems/[id].
export async function GET() {
  await auth();

  try {
    const res = await sql`
      SELECT
        "questionId" AS id,
        "questionTitle" AS title,
        subtitle,
        "questionProblem" AS content,
        difficulty
      FROM questions
      ORDER BY CASE difficulty
          WHEN 'Easy' THEN 0
          WHEN 'Medium' THEN 1
          WHEN 'Hard' THEN 2
          WHEN 'Insane' THEN 3
          ELSE 4
        END ASC,
        "questionId" DESC
      LIMIT 20;
    `;
    const rows = res.rows;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No problems found' }, { status: 404 });
    }

    // Rotate weekly among the easiest problems: fresh each week, never scary.
    const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const p = rows[week % rows.length];

    return NextResponse.json({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
      content: p.content,
      difficulty: p.difficulty,
      points: POINTS[p.difficulty] ?? 100,
      community: false,
      isSolved: false,
    });
  } catch (error) {
    console.error('Failed to fetch featured problem:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
