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
    // Which Lean/Mathlib ACTUALLY certified this proof. The prover now runs two
    // verifier groups on DIFFERENT Lean versions (Leak XI/XII/XIV = 4.32.0, Leak
    // I/II/IV = 4.29.1), and the certificate header — which the signature covers
    // — prints these. NULL means "certified before this was recorded", and the
    // certificate falls back to the CERTIFICATE constant so those older rows keep
    // hashing to exactly the bytes they were signed over.
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS toolchain TEXT;`;
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS mathlib TEXT;`;
    // Multiple independent certificates per problem, one per Lean toolchain: a
    // problem can be certified by more than one verifier group over time (e.g.
    // Leak I/II/IV on 4.29.1 AND separately Leak XI/XII/XIV on 4.32.0), and each
    // is a fully independent, separately-signed artifact — see lib/certificate.ts
    // CERT_KEYS. `questions` keeps its own single proof/toolchain/signature
    // columns as the fallback for rows that predate this table (never migrated)
    // and as a quick "does this problem have a proof at all" check; the reveal
    // UI reads from here for the full list.
    await sql`
      CREATE TABLE IF NOT EXISTS question_certificates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "questionId" INTEGER NOT NULL REFERENCES questions("questionId") ON DELETE CASCADE,
        toolchain TEXT NOT NULL,
        mathlib TEXT,
        -- Specific strategy that enforced this proof (e.g. "Leak Ultra
        -- Fleeting"), for the certificate's Enforcer line. NULL falls back to
        -- the bland "Leak" constant.
        enforcer TEXT,
        proof TEXT NOT NULL,
        "provedAt" TIMESTAMPTZ,
        "certMintedAt" TIMESTAMPTZ,
        signature TEXT,
        "signatureKeyId" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("questionId", toolchain)
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_question_certificates_question ON question_certificates("questionId");`;
    // Backfill: every existing single-proof row becomes its first certificate.
    // COALESCE to the legacy toolchain/mathlib strings (not NULL) so every
    // certificate row has an explicit, selectable toolchain — matching the
    // fallback the header rendering already assumes for a NULL toolchain.
    // Idempotent via the (questionId, toolchain) unique constraint.
    await sql`
      INSERT INTO question_certificates
        ("questionId", toolchain, mathlib, proof, "provedAt", "certMintedAt", signature, "signatureKeyId")
      SELECT "questionId",
             COALESCE(toolchain, 'leanprover/lean4:v4.29.1'),
             COALESCE(mathlib, 'v4.29.1'),
             proof, "provedAt", "certMintedAt", signature, "signatureKeyId"
      FROM questions
      WHERE proof IS NOT NULL AND proof <> ''
      ON CONFLICT ("questionId", toolchain) DO NOTHING;
    `;
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
    // Crowd-sourced theorem+proof submissions from the Leak playground (browser
    // flow) and the fully-local harness. Deliberately a staging inbox, not wired
    // into question_certificates/questions — "how to process these" is future
    // work; for now every submission just needs to land somewhere durable.
    await sql`
      CREATE TABLE IF NOT EXISTS leak_submissions (
        id SERIAL PRIMARY KEY,
        theorem_statement TEXT NOT NULL,
        proof TEXT NOT NULL,
        source TEXT NOT NULL,
        metadata JSONB,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_leak_submissions_submitted_at ON leak_submissions(submitted_at DESC);`;
    // Tengoku: harvested Lean theorem STATEMENTS (never proofs) from open
    // libraries + CompeteMath's own certified problems, searchable here and
    // staged for Leak to attempt later. See github.com/competemath/tengoku.
    await sql`
      CREATE TABLE IF NOT EXISTS tengoku_entries (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        statement TEXT NOT NULL,
        library TEXT NOT NULL,
        source_url TEXT NOT NULL,
        toolchain TEXT NOT NULL,
        search_vector TSVECTOR GENERATED ALWAYS AS (
          to_tsvector('english', name || ' ' || statement)
        ) STORED,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_tengoku_entries_search ON tengoku_entries USING GIN (search_vector);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tengoku_entries_library ON tengoku_entries(library);`;
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
