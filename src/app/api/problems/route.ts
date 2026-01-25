import { NextResponse } from 'next/server';
import { sql } from "@vercel/postgres";
import { auth } from '../../(auth)/auth';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  try {
    // Fetch all questions and check if THIS user has solved them
    // We use a LEFT JOIN on the submissions table filtered by the current user
    let query;

    if (userId) {
      query = await sql`
        SELECT 
          q."questionId" as id, 
          q."questionTitle" as title, 
          q.subtitle, 
          q.difficulty,
          (s."isCorrect" IS NOT NULL AND s."isCorrect" = TRUE) as "isSolved"
        FROM questions q
        LEFT JOIN submissions s 
          ON q."questionId" = s."questionId" 
          AND s.username = ${userId} -- Filter join by current user
        ORDER BY q."questionId" ASC;
      `;
    } else {
      // Guest view: Just fetch questions, nothing is solved
      query = await sql`
        SELECT 
          "questionId" as id, 
          "questionTitle" as title, 
          subtitle, 
          difficulty,
          FALSE as "isSolved"
        FROM questions
        ORDER BY "questionId" ASC;
      `;
    }

    return NextResponse.json(query.rows);
  } catch (error) {
    console.error("Archives API Error:", error);
    return NextResponse.json({ error: "Failed to fetch archives" }, { status: 500 });
  }
}