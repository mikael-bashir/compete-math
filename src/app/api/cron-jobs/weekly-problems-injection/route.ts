export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Redis } from '@upstash/redis';

// Initialize Upstash
// It automatically looks for UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// const redis = Redis.fromEnv();
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export async function GET(request: Request) {
  // 1. Security Check
  console.log("route reached")
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Pop from Upstash (HTTP request, not TCP)
    // lpop returns the element or null, exactly what we need
    const problemData = await redis.lpop<object>('weekly-problems');

    if (!problemData) {
      return NextResponse.json({ message: 'Queue is empty!' }, { status: 200 });
    }

    // Upstash automatically parses JSON if it detects it, so we might not need JSON.parse
    // But let's be safe: usually, it returns the object directly if stored as JSON.
    const problem = typeof problemData === 'string' ? JSON.parse(problemData) : problemData;

    console.log("problem is:", problem);

    // 3. Publish to Postgres
    await sql`
      INSERT INTO questions ("questionTitle", "questionProblem", subtitle, difficulty, points, answer)
      VALUES (${problem.questionTitle}, ${problem.questionProblem}, ${problem.subtitle}, ${problem.difficulty}, ${problem.points}, ${problem.answer});
    `;

    return NextResponse.json({ success: true, published: problem.title });

  } catch (error) {
    console.error('Publication failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}