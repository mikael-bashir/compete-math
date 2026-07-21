import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/app/(auth)/auth";
import { isAdminEmail } from "@/app/lib/constants/site";

// One-shot, idempotent migration for the community + practice features.
// Admin-only; safe to call repeatedly (IF NOT EXISTS everywhere).
export async function POST() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS community_problems (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        statement TEXT NOT NULL,
        proposed_answer TEXT,
        topic TEXT NOT NULL DEFAULT 'Algebra',
        difficulty TEXT NOT NULL DEFAULT 'Medium',
        knowledge TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        author_username TEXT NOT NULL,
        review_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS community_answers (
        id SERIAL PRIMARY KEY,
        problem_id INTEGER NOT NULL REFERENCES community_problems(id) ON DELETE CASCADE,
        author_username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS community_answer_votes (
        answer_id INTEGER NOT NULL REFERENCES community_answers(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (answer_id, username)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS community_answer_comments (
        id SERIAL PRIMARY KEY,
        answer_id INTEGER NOT NULL REFERENCES community_answers(id) ON DELETE CASCADE,
        author_username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    // Numeric-answer submissions for community problems (max 3 attempts, enforced
    // in the submit route). The canonical answer is community_problems.proposed_answer.
    await sql`
      CREATE TABLE IF NOT EXISTS community_submissions (
        problem_id INTEGER NOT NULL REFERENCES community_problems(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        is_correct BOOLEAN NOT NULL DEFAULT FALSE,
        solved_at TIMESTAMPTZ,
        PRIMARY KEY (problem_id, username)
      );
    `;
    // Problem-level discussion comments (how to tackle the problem).
    await sql`
      CREATE TABLE IF NOT EXISTS community_comments (
        id SERIAL PRIMARY KEY,
        problem_id INTEGER NOT NULL REFERENCES community_problems(id) ON DELETE CASCADE,
        author_username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    // Practice filters live on the existing questions table.
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic TEXT;`;
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS knowledge TEXT;`;
    // Proof CERTIFICATE for a practice problem: the machine-checked Lean proof
    // (`proof`), when it was minted (generated) and enforced (verified). Nullable
    // — problems without a proof simply show no certificate.
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS proof TEXT;`;
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS "mintedAt" TIMESTAMPTZ;`;
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS "provedAt" TIMESTAMPTZ;`;
    // When the CERTIFICATE was minted (the moment its signature was generated).
    // Now stamped at INGESTION (see the weekly-problems cron) rather than lazily
    // on first view; older rows may still be stamped on first view.
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS "certMintedAt" TIMESTAMPTZ;`;
    // The Ed25519 certificate signature, computed once at ingestion over the
    // canonical bytes (header + proof) and stored so every view serves the SAME
    // signature instead of re-signing. `signatureKeyId` records which key signed.
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS signature TEXT;`;
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS "signatureKeyId" TEXT;`;
    // Solver-facing key idea (the "insight" from the generation pipeline). Shown
    // to the user only after they solve or give up — gated like the answer.
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS insight TEXT;`;
    // Email verification: a nullable timestamp on users (set when verified) and a
    // single-use 24h token store. Nothing is gated on this yet — we only record it.
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified TIMESTAMPTZ;`;
    // Leaderboard region: ISO 3166-1 alpha-2 country code. Auto-defaulted from
    // the Vercel geo header on answer submission (only while NULL), and freely
    // editable from the account page.
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;`;
    await sql`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        token      TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        email      TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    // "Gave up" is terminal, like solving: once a user reveals the answer, the
    // problem locks (no more attempts) and the revealed state persists forever.
    await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS "gaveUp" BOOLEAN NOT NULL DEFAULT FALSE;`;
    await sql`CREATE INDEX IF NOT EXISTS idx_community_problems_status ON community_problems(status);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_community_answers_problem ON community_answers(problem_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_community_comments_problem ON community_comments(problem_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_community_submissions_problem ON community_submissions(problem_id);`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Migration failed:", error);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
