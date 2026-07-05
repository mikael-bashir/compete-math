import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";
import { COMMUNITY_MAX_ATTEMPTS } from "@/app/lib/constants/site";

// Compare a submitted answer to the canonical one. Numbers compare numerically
// (so "42", "42.0", " 42 " all match); otherwise a trimmed case-insensitive
// string compare.
function answersMatch(userRaw: string, correctRaw: string | null): boolean {
  const a = (userRaw ?? "").trim();
  const b = (correctRaw ?? "").trim();
  if (!a || !b) return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return a.toLowerCase() === b.toLowerCase();
}

// POST /api/community/problems/:id/submit  { answer }
// Numeric-answer check with a hard cap of COMMUNITY_MAX_ATTEMPTS attempts.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const problemId = parseInt(id);
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "Sign in to submit an answer" }, { status: 401 });
  }
  const username = session.user.username;

  try {
    const { answer } = await request.json();
    if (answer === undefined || answer === null || String(answer).trim() === "") {
      return NextResponse.json({ error: "Enter an answer" }, { status: 400 });
    }

    const probRes = await sql`
      SELECT proposed_answer, status FROM community_problems WHERE id = ${problemId};
    `;
    if (probRes.rowCount === 0) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }
    if (probRes.rows[0].status !== "approved") {
      return NextResponse.json({ error: "Problem not open for answers" }, { status: 400 });
    }
    const correctAnswer: string | null = probRes.rows[0].proposed_answer;

    const subRes = await sql`
      SELECT attempt_count, is_correct FROM community_submissions
      WHERE problem_id = ${problemId} AND username = ${username};
    `;
    const current = subRes.rows[0];

    if (current?.is_correct) {
      return NextResponse.json({
        correct: true,
        solved: true,
        alreadySolved: true,
        attemptsUsed: current.attempt_count,
        attemptsLeft: Math.max(0, COMMUNITY_MAX_ATTEMPTS - current.attempt_count),
      });
    }

    const used: number = current?.attempt_count ?? 0;
    if (used >= COMMUNITY_MAX_ATTEMPTS) {
      return NextResponse.json({
        correct: false,
        solved: false,
        noAttemptsLeft: true,
        attemptsUsed: used,
        attemptsLeft: 0,
      });
    }

    const correct = answersMatch(String(answer), correctAnswer);
    const solvedAt = correct ? new Date().toISOString() : null;

    await sql`
      INSERT INTO community_submissions (problem_id, username, attempt_count, is_correct, solved_at)
      VALUES (${problemId}, ${username}, 1, ${correct}, ${solvedAt})
      ON CONFLICT (problem_id, username) DO UPDATE SET
        attempt_count = community_submissions.attempt_count + 1,
        is_correct = EXCLUDED.is_correct OR community_submissions.is_correct,
        solved_at = CASE
          WHEN EXCLUDED.is_correct AND community_submissions.solved_at IS NULL
          THEN EXCLUDED.solved_at ELSE community_submissions.solved_at END;
    `;

    const attemptsUsed = used + 1;
    return NextResponse.json({
      correct,
      solved: correct,
      attemptsUsed,
      attemptsLeft: Math.max(0, COMMUNITY_MAX_ATTEMPTS - attemptsUsed),
    });
  } catch (error) {
    console.error("Community submit error:", error);
    return NextResponse.json({ error: "Failed to submit answer" }, { status: 500 });
  }
}
