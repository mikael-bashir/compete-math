import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";

// GET /api/practice?topic=Algebra&difficulty=Medium&knowledge=High%20School&limit=48&offset=0
// The practice pool is the auto-generated questions table (weekly pipeline),
// grouped by topic with optional difficulty / knowledge filters. Paginated so the
// page renders a bounded number of cards at a time (limit/offset), with a total
// so the client can offer "Load more". Returns { items, total }.
const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.username ?? null;
  const params = request.nextUrl.searchParams;
  const topic = params.get("topic");
  const difficulty = params.get("difficulty");
  const knowledge = params.get("knowledge");

  const limitRaw = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offsetRaw = Number.parseInt(params.get("offset") ?? "", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  try {
    const result = await sql`
      SELECT
        q."questionId" AS id,
        q."questionTitle" AS title,
        q.subtitle,
        q.difficulty,
        COALESCE(q.topic, 'General') AS topic,
        q.knowledge AS knowledge,
        (q.proof IS NOT NULL AND length(trim(q.proof)) > 0) AS "hasProof",
        COUNT(*) OVER() AS total,
        (${userId}::text IS NOT NULL AND EXISTS (
          SELECT 1 FROM submissions s
          WHERE s."questionId" = q."questionId"
            AND s.username = ${userId} AND s."isCorrect" = TRUE
        )) AS "isSolved",
        -- Terminal "gave up" (answer revealed without solving): locks the card.
        (${userId}::text IS NOT NULL AND EXISTS (
          SELECT 1 FROM submissions s
          WHERE s."questionId" = q."questionId"
            AND s.username = ${userId} AND s."gaveUp" = TRUE AND s."isCorrect" = FALSE
        )) AS "gaveUp"
      FROM questions q
      WHERE (${topic}::text IS NULL OR q.topic = ${topic})
        AND (${difficulty}::text IS NULL OR q.difficulty = ${difficulty})
        AND (${knowledge}::text IS NULL OR q.knowledge = ${knowledge})
      ORDER BY COALESCE(q.topic, 'General') ASC, q."questionId" DESC
      LIMIT ${limit} OFFSET ${offset};
    `;
    // COUNT(*) OVER() gives the full matched size on every row (0 rows ⇒ empty).
    const total = result.rows.length > 0 ? Number(result.rows[0].total) : 0;
    const items = result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      difficulty: r.difficulty,
      topic: r.topic,
      knowledge: r.knowledge,
      hasProof: r.hasProof,
      isSolved: r.isSolved,
      gaveUp: r.gaveUp,
    }));
    return NextResponse.json({ items, total });
  } catch (error) {
    console.error("Practice API error:", error);
    return NextResponse.json({ error: "Failed to fetch practice problems" }, { status: 500 });
  }
}
