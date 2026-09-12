import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { auth } from "@/app/(auth)/auth";
import { isAdminEmail } from "@/app/lib/constants/site";
import {
  insertLeakSubmission,
  listLeakSubmissions,
  type LeakSubmissionSource,
} from "@/app/lib/data/leak-submissions";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Lightweight, non-blocking inbox for crowd-sourced theorem+proof submissions —
// no auth required by design (the local-harness flow has no CompeteMath
// account to authenticate with), so a per-IP fixed-window counter is the only
// abuse control. Deliberately generous: this is a staging inbox, not a
// user-facing feature with UX to protect.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_PER_WINDOW = 20;
const MAX_FIELD_LENGTH = 200_000; // a large Lean proof script is still well under this

const VALID_SOURCES: LeakSubmissionSource[] = ["browser", "local-harness"];

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

async function isRateLimited(ip: string): Promise<boolean> {
  const key = `leak_submissions_rl:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  }
  return count > RATE_LIMIT_MAX_PER_WINDOW;
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  try {
    if (await isRateLimited(ip)) {
      console.warn(`[leak-submissions] rate limited: ${ip}`);
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  } catch (error) {
    // Redis being unreachable should never block a real submission — log and
    // fall through un-rate-limited rather than 500 the caller.
    console.error("[leak-submissions] rate limiter unavailable:", error);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { theorem, proof, source, metadata } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof theorem !== "string" || !theorem.trim()) {
    return NextResponse.json({ error: "Missing 'theorem'" }, { status: 400 });
  }
  if (typeof proof !== "string" || !proof.trim()) {
    return NextResponse.json({ error: "Missing 'proof'" }, { status: 400 });
  }
  if (typeof source !== "string" || !VALID_SOURCES.includes(source as LeakSubmissionSource)) {
    return NextResponse.json(
      { error: `'source' must be one of ${VALID_SOURCES.join(", ")}` },
      { status: 400 },
    );
  }
  if (theorem.length > MAX_FIELD_LENGTH || proof.length > MAX_FIELD_LENGTH) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const result = await insertLeakSubmission({
    theoremStatement: theorem,
    proof,
    source: source as LeakSubmissionSource,
    metadata:
      metadata && typeof metadata === "object"
        ? (metadata as Record<string, unknown>)
        : undefined,
  });

  if (!result) {
    console.error(`[leak-submissions] insert failed for source=${source} ip=${ip}`);
    return NextResponse.json({ error: "Could not record submission" }, { status: 500 });
  }

  console.log(`[leak-submissions] accepted id=${result.id} source=${source} ip=${ip}`);
  return NextResponse.json({ ok: true, id: result.id });
}

// Admin-only visibility into the staging inbox — no review/promote workflow
// yet, just a list.
export async function GET() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const submissions = await listLeakSubmissions();
  return NextResponse.json({ submissions });
}
