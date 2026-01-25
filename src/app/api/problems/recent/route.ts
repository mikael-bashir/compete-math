import { NextResponse } from 'next/server';
import { sql } from "@vercel/postgres";

export async function GET() {
  try {
    const result = await sql`
      SELECT "questionId" as id, "questionTitle" as title
      FROM questions
      ORDER BY created_at DESC -- Now sorting by actual time
      LIMIT 7;
    `;
    
    const response = NextResponse.json(result.rows);
    
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch problems' }, { status: 500 });
  }
}