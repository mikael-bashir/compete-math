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
        knowledge TEXT NOT NULL DEFAULT 'None',
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
    // Practice filters live on the existing questions table.
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic TEXT;`;
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS knowledge TEXT;`;
    await sql`CREATE INDEX IF NOT EXISTS idx_community_problems_status ON community_problems(status);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_community_answers_problem ON community_answers(problem_id);`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Migration failed:", error);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
