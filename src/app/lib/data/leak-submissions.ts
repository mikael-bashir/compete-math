import "server-only";

import { sql } from "@vercel/postgres";

export type LeakSubmissionSource = "browser" | "local-harness";

export interface LeakSubmissionInput {
  theoremStatement: string;
  proof: string;
  source: LeakSubmissionSource;
  metadata?: Record<string, unknown>;
}

export interface LeakSubmissionRow {
  id: number;
  theoremStatement: string;
  proof: string;
  source: string;
  metadata: Record<string, unknown> | null;
  submittedAt: string;
}

// Staging inbox only — see leak_submissions in the migrate route for why this
// deliberately does not touch questions/question_certificates.
export async function insertLeakSubmission(
  input: LeakSubmissionInput,
): Promise<{ id: number } | null> {
  try {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO leak_submissions (theorem_statement, proof, source, metadata)
      VALUES (
        ${input.theoremStatement},
        ${input.proof},
        ${input.source},
        ${input.metadata ? JSON.stringify(input.metadata) : null}
      )
      RETURNING id;
    `;
    return rows[0] ?? null;
  } catch (error) {
    console.error("[leak-submissions] insert failed:", error);
    return null;
  }
}

export async function listLeakSubmissions(
  limit = 100,
): Promise<LeakSubmissionRow[]> {
  try {
    const { rows } = await sql`
      SELECT id, theorem_statement, proof, source, metadata, submitted_at
      FROM leak_submissions
      ORDER BY submitted_at DESC
      LIMIT ${limit};
    `;
    return rows.map((r) => ({
      id: r.id,
      theoremStatement: r.theorem_statement,
      proof: r.proof,
      source: r.source,
      metadata: r.metadata,
      submittedAt: r.submitted_at,
    }));
  } catch (error) {
    console.error("[leak-submissions] list failed:", error);
    return [];
  }
}
