import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { getFeaturedProblem } from '@/app/lib/data/problems';

// Points shown for the featured problem, derived from its difficulty.
const POINTS: Record<string, number> = {
  Easy: 50,
  Medium: 100,
  Hard: 150,
  Insane: 200,
  Extreme: 200,
};

// The home "Featured problem" is an APPROACHABLE brain-teaser from the practice
// pool — a quick win to hook a new visitor. The selection (easiest tier, weekly
// rotation) lives in getFeaturedProblem() so it's the SAME problem the
// unauthenticated-attempt exception recognises. Links to /practice/problems/[id].
export async function GET() {
  await auth();

  try {
    const p = await getFeaturedProblem();
    if (!p) {
      return NextResponse.json({ error: 'No problems found' }, { status: 404 });
    }
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
