import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { formatProblem } from '@/app/lib/utils';
import { getUserProblemStatus } from '@/app/lib/data/problems';
import { auth } from '@/app/(auth)/auth';

// Define the shape expected by formatProblem
interface RawProblem {
  questionId: string;
  subtitle: string;
  questionTitle: string;
  difficulty: string;
  points: string;
  questionProblem: string;
}

export async function GET() {
  const session = await auth();

  try {
    // 1. Fetch the single most recent problem using Vercel SQL.
    // We use aliases (e.g., question_id as "questionId") to ensure the 
    // returned object keys match what formatProblem expects (camelCase).
    const result = await sql`
      SELECT 
        "questionId",
        subtitle,
        "questionTitle",
        difficulty,
        points,
        "questionProblem"
      FROM questions 
      ORDER BY created_at DESC 
      LIMIT 1;
    `;

    // Cast the row to our interface so TypeScript is happy
    const latestProblem = result.rows[0] as RawProblem;

    if (!latestProblem) {
      return NextResponse.json({ error: "No problems found" }, { status: 404 });
    }

    // 2. Format the problem
    const formattedProblem = formatProblem(latestProblem);

    // 3. Check if user solved it
    let isSolved = false;
    if (session?.user?.username) {
      // Convert string ID to number for the check
      const problemIdAsNumber = Number(formattedProblem.id);
      
      if (!isNaN(problemIdAsNumber)) {
        isSolved = await getUserProblemStatus(session.user.username, problemIdAsNumber);
      }
    }

    return NextResponse.json({ ...formattedProblem, isSolved });

  } catch (error) {
    console.error("Failed to fetch latest problem:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}