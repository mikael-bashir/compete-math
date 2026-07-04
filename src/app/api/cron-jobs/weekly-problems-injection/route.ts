export const dynamic = 'force-dynamic';
export const maxDuration = 60; // give the drain loop room for a full day's batch

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Redis } from '@upstash/redis';

// Upstash REST client — reads the SAME queue the nextjs-ai-chatbot pushes to.
// The chatbot LPUSHes JSON onto `weekly-problems`; we RPOP (FIFO: oldest first).
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const QUEUE_KEY = 'weekly-problems';
const MAX_DRAIN = 1000; // safety cap so a runaway queue can't loop forever

// Every problem the chatbot promotes ships exactly these fields; topic/knowledge
// are optional (older payloads omit them → they land under "General" in Practice).
interface ProblemPayload {
  questionTitle?: string;
  questionProblem?: string;
  subtitle?: string | null;
  difficulty?: string | null;
  points?: number | null;
  answer?: string | null;
  topic?: string | null;
  knowledge?: string | null;
}

// Cron auth: Vercel Cron auto-sends `Authorization: Bearer <CRON_SECRET>` when
// CRON_SECRET is set. We also accept `?key=<CRON_SECRET>` for manual triggering.
// Fails closed if CRON_SECRET is not configured.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('Authorization');
  if (header === `Bearer ${secret}`) return true;
  const key = new URL(request.url).searchParams.get('key');
  return key === secret;
}

async function ingestOne(raw: unknown): Promise<string> {
  // Upstash usually returns parsed JSON; be defensive for string payloads too.
  const p: ProblemPayload = typeof raw === 'string' ? JSON.parse(raw) : (raw as ProblemPayload);
  if (!p?.questionTitle || !p?.questionProblem) {
    throw new Error('payload missing questionTitle/questionProblem');
  }
  await sql`
    INSERT INTO questions
      ("questionTitle", "questionProblem", subtitle, difficulty, points, answer, topic, knowledge)
    VALUES (
      ${p.questionTitle}, ${p.questionProblem}, ${p.subtitle ?? null},
      ${p.difficulty ?? 'Medium'}, ${p.points ?? 100}, ${p.answer ?? null},
      ${p.topic ?? null}, ${p.knowledge ?? null}
    );
  `;
  return p.questionTitle;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const published: string[] = [];
  let failed = 0;

  try {
    for (let i = 0; i < MAX_DRAIN; i++) {
      const raw = await redis.rpop<unknown>(QUEUE_KEY);
      if (raw == null) break; // queue drained
      try {
        published.push(await ingestOne(raw));
      } catch (itemErr) {
        // Skip a malformed item rather than aborting the whole batch (it's
        // already popped, so it won't block subsequent items). Logged for triage.
        failed++;
        console.error('Skipped malformed queue item:', itemErr, raw);
      }
    }

    return NextResponse.json({
      success: true,
      published: published.length,
      failed,
      titles: published,
    });
  } catch (error) {
    // Redis/DB-level failure: report what we managed before the error.
    console.error('Ingestion failed:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', published: published.length, failed },
      { status: 500 },
    );
  }
}
