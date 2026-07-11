import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getProblemById, getUserSubmissionState, recordSubmission } from '@/app/lib/data/problems';
import { formatProblem } from '@/app/lib/utils';
import { auth } from '../../../(auth)/auth';
import { rewardBadges } from '@/app/lib/data/problems';
import {
  isAdminEmail,
  PROBLEM_TOPICS,
  DIFFICULTY_LEVELS,
  KNOWLEDGE_LEVELS,
  PRACTICE_REVEAL_ATTEMPTS,
} from '@/app/lib/constants/site';

interface RawProblem {
  questionId: string;
  subtitle: string;
  questionTitle: string;
  difficulty: string;
  points: string;
  questionProblem: string;
  hasProof?: boolean;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const questionId = parseInt(id);

  // 1. Fetch the Problem Data
  const problem: RawProblem | null = await getProblemById(questionId);
  if (!problem) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const formattedProblem = formatProblem(problem);

  // 2. Fetch the user's submission state (if logged in). We read attemptCount +
  // isCorrect straight from the DB so the attempt gate survives a refresh /
  // navigation instead of resetting to zero in React state.
  let isSolved = false;
  let attemptCount = 0;
  if (session?.user?.username) {
    const st = await getUserSubmissionState(session.user.username, questionId);
    isSolved = st.isCorrect;
    attemptCount = st.attemptCount;
  }
  const canReveal = isSolved || attemptCount >= PRACTICE_REVEAL_ATTEMPTS;

  // 3. Return Combined Data. `hasProof` is a boolean flag (folded into the single
  // getProblemById query); the proof itself is served by /api/proofs/:id only.
  return NextResponse.json({
    ...formattedProblem,
    isSolved,
    hasProof: !!problem.hasProof,
    attemptCount,
    canReveal,
  });
}

// Admin-only edit of a practice problem's taxonomy: theme (topic), difficulty
// and knowledge level. Everything else (statement, answer, points) is owned by
// the generation pipeline and left untouched here.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const questionId = parseInt(id);
  if (Number.isNaN(questionId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Normalize + validate each field. Topic/difficulty must be from the known
  // taxonomies; knowledge may additionally be cleared (null / "None").
  const topic: string | null = body.topic ?? null;
  const difficulty: string | null = body.difficulty ?? null;
  const rawKnowledge: string | null = body.knowledge ?? null;
  const knowledge =
    rawKnowledge && rawKnowledge !== 'None' ? rawKnowledge : null;

  if (topic !== null && !(PROBLEM_TOPICS as readonly string[]).includes(topic)) {
    return NextResponse.json({ error: 'Unknown theme' }, { status: 400 });
  }
  if (
    difficulty !== null &&
    !(DIFFICULTY_LEVELS as readonly string[]).includes(difficulty)
  ) {
    return NextResponse.json({ error: 'Unknown difficulty' }, { status: 400 });
  }
  if (
    knowledge !== null &&
    !(KNOWLEDGE_LEVELS as readonly string[]).includes(knowledge)
  ) {
    return NextResponse.json({ error: 'Unknown level' }, { status: 400 });
  }

  try {
    const result = await sql`
      UPDATE questions
      SET topic = ${topic},
          difficulty = ${difficulty},
          knowledge = ${knowledge}
      WHERE "questionId" = ${questionId}
      RETURNING "questionId";
    `;
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, topic, difficulty, knowledge });
  } catch (error) {
    console.error('Problem edit error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session || !session?.user?.username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.username; 
  const { id } = await params;
  const questionId = parseInt(id);
  const body = await request.json();
  const { attempt } = body;

  if (!attempt) {
    return NextResponse.json({ error: "Attempt required" }, { status: 400 });
  }

  try {
    const result = await recordSubmission(userId, questionId, attempt);

    // Already solved (or otherwise not counted): still surface the attempt total
    // so the client can keep the certificate/answer reveal unlocked.
    if (!result.success) {
      return NextResponse.json({
        success: false,
        message: result.message,
        attemptCount: result.attemptCount ?? 0,
        canReveal: true,
      });
    }

    const newBadges = await rewardBadges(userId, questionId);
    const attemptCount = result.attemptCount;
    // The reveal (answer + certificate) unlocks once solved, or after the user
    // has genuinely attempted PRACTICE_REVEAL_ATTEMPTS times.
    const canReveal =
      result.isCorrect || attemptCount >= PRACTICE_REVEAL_ATTEMPTS;
    return NextResponse.json({
      success: true,
      correct: result.isCorrect,
      newBadges,
      attemptCount,
      attemptsUntilReveal: Math.max(0, PRACTICE_REVEAL_ATTEMPTS - attemptCount),
      canReveal,
    });

  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
