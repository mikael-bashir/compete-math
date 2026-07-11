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
