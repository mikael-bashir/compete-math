import { NextResponse } from 'next/server';
import { getProblemById, getUserProblemStatus, recordSubmission } from '@/app/lib/data/problems';
import { formatProblem } from '@/app/lib/utils';
import { auth } from '../../../(auth)/auth';
import { rewardBadges } from '@/app/lib/data/problems';

interface RawProblem {
  questionId: string;
  subtitle: string;
  questionTitle: string;
  difficulty: string;
  points: string;
  questionProblem: string;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const questionId = parseInt(id);

  // 1. Fetch the Problem Data
  const problem: RawProblem | null = await getProblemById(questionId);
  if (!problem) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const formattedProblem = formatProblem(problem);

  // 2. Fetch User Status (If logged in)
  let isSolved = false;
  if (session?.user?.username) {
    isSolved = await getUserProblemStatus(session.user.username, questionId);
  }

  // 3. Return Combined Data
  return NextResponse.json({ ...formattedProblem, isSolved });
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

    // CHECK: If the user already solved it, return your specific error message
    if (!result.success) {
      return NextResponse.json({ 
        success: false, 
        message: result.message 
      }); 
    }

    const newBadges = await rewardBadges(userId, questionId);
    // Standard response for a valid attempt
    return NextResponse.json({ success: true, correct: result.isCorrect, newBadges: newBadges });

  } catch (e) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
