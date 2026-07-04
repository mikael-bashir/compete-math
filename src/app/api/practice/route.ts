import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";

// GET /api/practice?topic=Algebra&difficulty=Medium&knowledge=High%20School
// The practice pool is the auto-generated questions table (weekly pipeline),
// grouped by topic with optional difficulty / knowledge filters.
export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.username ?? null;
  const params = request.nextUrl.searchParams;
  const topic = params.get("topic");
  const difficulty = params.get("difficulty");
  const knowledge = params.get("knowledge");

  try {
    const result = await sql`
      SELECT
        q."questionId" AS id,
        q."questionTitle" AS title,
        q.subtitle,
        q.difficulty,
        COALESCE(q.topic, 'General') AS topic,
        COALESCE(q.knowledge, 'None') AS knowledge,
        (${userId}::text IS NOT NULL AND EXISTS (
          SELECT 1 FROM submissions s
          WHERE s."questionId" = q."questionId"
            AND s.username = ${userId} AND s."isCorrect" = TRUE
        )) AS "isSolved"
      FROM questions q
      WHERE (${topic}::text IS NULL OR q.topic = ${topic})
        AND (${difficulty}::text IS NULL OR q.difficulty = ${difficulty})
        AND (${knowledge}::text IS NULL OR q.knowledge = ${knowledge})
      ORDER BY COALESCE(q.topic, 'General') ASC, q."questionId" DESC;
    `;
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Practice API error:", error);
    return NextResponse.json({ error: "Failed to fetch practice problems" }, { status: 500 });
  }
}
