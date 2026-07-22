// lib/data.ts

import { sql } from "@vercel/postgres";
import { SubmissionResult } from "../types/problems";
import * as badgeRewarders from "./badges";
import * as titleRewarders from "./titles";

// --- THE DATA SEED ---
const COOL_NAMES = [
  "Violent Symmetry", "The Killing Vector", "The Hollow Set", "Recursive Silence", 
  "False Vacuum", "Infinite Descent", "Proof by Exhaustion", "The Third Body", 
  "Euclid’s Nightmare", "The Architect’s Flaw", "A Quiet Variable", "Terminal Value",
  "Strange Attractor", "The Halting", "Zero Kelvin", "The Heavy Tail",
  "Dark Forest", "Unstable Equilibrium", "The Omega Point", "Irrational Roots"
];

const SYMBOLS = ["φ", "Σ", "∫", "λ", "π", "∞", "∆", "Ω"];

// --- MOCK DATABASE ---
// We generate 50 static problems
const DB = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  title: i === 0 ? "The Riemann's Whisper" : `Problem ${i + 1}`,
  subtitle: COOL_NAMES[i % COOL_NAMES.length],
  status: i < 8 ? "solved" : i === 8 ? "current" : "locked",
  difficulty: ["Easy", "Medium", "Hard", "Extreme"][i % 4],
  points: (i % 4 + 1) * 50,
  symbol: SYMBOLS[i % SYMBOLS.length],
  // We'll just reuse this content for all of them for the demo, 
  // but you could switch this based on ID easily.
  content: `
The **Zeta function** $\\zeta(s)$ is defined for complex numbers $s$ with real part greater than 1 by the Dirichlet series:

$$
\\zeta(s) = \\sum_{n=1}^{\\infty} \\frac{1}{n^s}
$$

In the region $0 < \\Re(s) < 1$, the function satisfies the functional equation:

$$
\\zeta(s) = 2^s \\pi^{s-1} \\sin\\left(\\frac{\\pi s}{2}\\right) \\Gamma(1-s) \\zeta(1-s)
$$

This problem (ID: **${i + 1}**) requires you to find the limit $L$ where:
$$ L = \\lim_{s \\to 1} (s-1)\\zeta(s) $$
  `
}));

// --- SERVICE METHODS ---
export const getProblems = async () => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  // Return summary (exclude heavy content)
  return DB.map(({ content, ...rest }) => rest);
};

// export const getProblemById = async (id: number) => {
//   await new Promise(resolve => setTimeout(resolve, 300));
//   return DB.find(p => p.id === id) || null;
// };

// Fetch the problem content (excluding the answer)
export async function getProblemById(id: number): Promise<{ questionId: string, subtitle: string, questionTitle: string, difficulty: string, points: string, questionProblem: string, topic: string | null, knowledge: string | null, hasProof: boolean }> {
  try {
    // Vercel SQL returns a result object where .rows is the array of data.
    // NOTE: the proof itself is deliberately NOT selected here — only a boolean
    // `hasProof` flag. The proof (large) is served on demand by /api/proofs/:id.
    const result = await sql`
      SELECT
        "questionId",
        subtitle,
        "questionTitle",
        difficulty,
        points,
        "questionProblem",
        topic,
        knowledge,
        (proof IS NOT NULL AND length(trim(proof)) > 0) AS "hasProof"
      FROM questions
      WHERE "questionId" = ${id}
    `;

    return {
      questionId: result.rows[0].questionId,
      subtitle: result.rows[0].subtitle,
      questionTitle: result.rows[0].questionTitle,
      difficulty: result.rows[0].difficulty,
      questionProblem: result.rows[0].questionProblem,
      points: result.rows[0].points,
      topic: result.rows[0].topic ?? null,
      knowledge: result.rows[0].knowledge ?? null,
      hasProof: !!result.rows[0].hasProof
    };

  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch problem.");
  }
}

export async function verifyAnswer(id: string, userAnswer: string): Promise<Boolean> {
  try {
    const result = await sql`
      SELECT answer 
      FROM questions 
      WHERE "questionId" = ${id}
    `;
    
    if (result.rows.length === 0) {
      console.log(`An answer could not be found for problem with id ${id}`)
      return false;
    }
    const correctAnswer = result.rows[0].answer;
    
    // Normalize and compare
    return userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
  } catch (error) {
    console.error("Verification Error:", error);
    throw new Error("Failed to verify answer.");
  }
}

export interface FeaturedProblem {
  id: number;
  title: string;
  subtitle: string | null;
  content: string;
  difficulty: string;
}

// The one "featured problem" — an approachable brain-teaser from the practice
// pool, rotated weekly over the easiest tier. THIS is the single source of truth
// for which problem is featured: the home card, the GET `isFeatured` flag, and
// the unauthenticated-attempt exception all derive the id from here, so they can
// never drift apart. Recomputed each call (no stored flag to keep in sync).
export async function getFeaturedProblem(): Promise<FeaturedProblem | null> {
  try {
    const result = await sql`
      SELECT
        "questionId" AS id,
        "questionTitle" AS title,
        subtitle,
        "questionProblem" AS content,
        difficulty
      FROM questions
      ORDER BY CASE difficulty
          WHEN 'Easy' THEN 0
          WHEN 'Medium' THEN 1
          WHEN 'Hard' THEN 2
          WHEN 'Insane' THEN 3
          ELSE 4
        END ASC,
        "questionId" DESC
      LIMIT 20;
    `;
    const rows = result.rows;
    if (rows.length === 0) return null;
    // Weekly rotation over the easiest tier: fresh each week, always low-effort.
    const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const p = rows[week % rows.length];
    return {
      id: Number(p.id),
      title: p.title,
      subtitle: p.subtitle ?? null,
      content: p.content,
      difficulty: p.difficulty,
    };
  } catch (error) {
    console.error("Featured problem lookup failed:", error);
    return null;
  }
}

export async function getUserProblemStatus(userId: string, questionId: number): Promise<boolean> {
  try {
  const result = await sql`
    SELECT "isCorrect" 
    FROM submissions 
    WHERE username = ${userId} AND "questionId" = ${questionId}
  `;
  
  // If a row exists and isCorrect is true, return true. Otherwise false.
  return result.rows.length > 0 && result.rows[0].isCorrect;
  } catch (error) {
    console.error("Error retrieving status of problem:", error);
    throw new Error("Failed to get problem status.");
  }
}

// The user's running submission state for a problem: how many attempts they've
// made and whether they've solved it. Drives the attempt gate + reveal, and —
// critically — lets that state survive a refresh / navigation (it's read back
// from the DB on load rather than living only in React state).
export async function getUserSubmissionState(
  userId: string,
  questionId: number,
): Promise<{ attemptCount: number; isCorrect: boolean; gaveUp: boolean }> {
  try {
    const result = await sql`
      SELECT "attemptCount", "isCorrect", "gaveUp"
      FROM submissions
      WHERE username = ${userId} AND "questionId" = ${questionId}
    `;
    if (result.rows.length === 0) return { attemptCount: 0, isCorrect: false, gaveUp: false };
    return {
      attemptCount: Number(result.rows[0].attemptCount) || 0,
      isCorrect: !!result.rows[0].isCorrect,
      gaveUp: !!result.rows[0].gaveUp,
    };
  } catch (error) {
    console.error("Error retrieving submission state:", error);
    return { attemptCount: 0, isCorrect: false, gaveUp: false };
  }
}

// Mark a problem as "given up" — terminal, like solving. Only permitted once the
// user has genuinely used up their attempts (gate enforced by the caller). After
// this, the answer is revealed permanently and further attempts are refused.
export async function markGaveUp(userId: string, questionId: number): Promise<void> {
  try {
    await sql`
      UPDATE submissions SET "gaveUp" = TRUE
      WHERE username = ${userId} AND "questionId" = ${questionId}
    `;
  } catch (error) {
    console.error("Error marking gave-up:", error);
    throw new Error("Failed to record give-up.");
  }
}

export async function recordSubmission(userId: string, questionId: number, userAttempt: string): Promise<SubmissionResult> {
  try {
    // 1. CHECK IF ALREADY SOLVED
    // We check this first to prevent unnecessary processing
    const existing = await sql`
      SELECT "isCorrect", "attemptCount", "gaveUp"
      FROM submissions
      WHERE username = ${userId} AND "questionId" = ${questionId}
    `;

    if (existing.rows.length > 0 && existing.rows[0].isCorrect) {
      return {
        success: false,
        message: 'Problem already solved',
        attemptCount: Number(existing.rows[0].attemptCount) || 0,
      };
    }

    // Terminal once the user has given up: the answer is revealed, so no retries.
    if (existing.rows.length > 0 && existing.rows[0].gaveUp) {
      return {
        success: false,
        message: 'Answer already revealed',
        attemptCount: Number(existing.rows[0].attemptCount) || 0,
      };
    }

    // 2. FETCH CORRECT ANSWER (Internal verification)
    const answerResult = await sql`
      SELECT answer 
      FROM questions 
      WHERE "questionId" = ${questionId}
    `;

    if (answerResult.rows.length === 0) {
      throw new Error("Question not found");
    }

    const correctAnswer = answerResult.rows[0].answer;
    const isCorrect = userAttempt.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    const solvedAt = isCorrect ? new Date().toISOString() : null;

    // 3. UPSERT: Record the attempt securely, returning the running attempt total
    // (drives the "attempt 3 times before you can reveal" gate on the client).
    const upsert = await sql`
      INSERT INTO submissions (username, "questionId", "attemptCount", "isCorrect", "solvedAt")
      VALUES (${userId}, ${questionId}, 1, ${isCorrect}, ${solvedAt})
      ON CONFLICT (username, "questionId")
      DO UPDATE SET
        "attemptCount" = submissions."attemptCount" + 1,
        "isCorrect" = CASE
                          WHEN EXCLUDED."isCorrect" = TRUE THEN TRUE
                          ELSE submissions."isCorrect"
                        END,
        "solvedAt" = CASE
                          WHEN EXCLUDED."isCorrect" = TRUE AND submissions."solvedAt" IS NULL THEN EXCLUDED."solvedAt"
                          ELSE submissions."solvedAt"
                        END
      RETURNING "attemptCount";
    `;

    return { success: true, isCorrect, attemptCount: Number(upsert.rows[0]?.attemptCount) || 1 };

  } catch (error) {
    console.error("Submission Error:", error);
    throw new Error("Failed to process submission.");
  }
}

export async function rewardBadges(username: string, questionId: number) {
  const newBadges: { badgeName: string, badgeUrl: string }[] = [];

  const b1 = await badgeRewarders.The_Margin_Was_Too_Small(username, questionId);
  if (b1) newBadges.push(b1);

  const b2 = await badgeRewarders.Where_It_All_Started(username);
  if (b2) newBadges.push(b2);

  const b3 = await badgeRewarders.Impervious(username);
  if (b3) newBadges.push(b3);

  const b4 = await badgeRewarders.Stargazer(username);
  if (b4) newBadges.push(b4);

  return newBadges;
}

export async function rewardTitles(username: string, questionId: number) {
  const newTitles: { titleName: string }[] = [];

  const t1 = await titleRewarders.The_Margin_Was_Too_Small_Title(username, questionId);
  if (t1) newTitles.push(t1);

  const t2 = await titleRewarders.Where_It_All_Started_Title(username);
  if (t2) newTitles.push(t2);

  const t3 = await titleRewarders.Impervious_Title(username);
  if (t3) newTitles.push(t3);

  const t4 = await titleRewarders.The_Indomitable_Title(username);
  if (t4) newTitles.push(t4);

  const t5 = await titleRewarders.Stargazer_Title(username);
  if (t5) newTitles.push(t5);

  return newTitles;
}

// ── "Push prove" — problems that were promoted live without a proof, so a
// later Leak proof can be attached to the ALREADY-LIVE row. Without this,
// a promote-before-prove problem would sit unproven forever: the ingestion
// cron only INSERTs once, and nothing else ever writes `proof` back in.

export interface UnprovenLiveProblem {
  questionId: number;
  title: string;
  subtitle: string | null;
  content: string;
  difficulty: string;
  topic: string | null;
  knowledge: string | null;
}

export async function getUnprovenLiveProblems(): Promise<UnprovenLiveProblem[]> {
  const result = await sql`
    SELECT
      "questionId" AS id,
      "questionTitle" AS title,
      subtitle,
      "questionProblem" AS content,
      difficulty,
      topic,
      knowledge
    FROM questions
    WHERE proof IS NULL
    ORDER BY "mintedAt" DESC NULLS LAST, "questionId" DESC;
  `;
  return result.rows.map((p) => ({
    questionId: Number(p.id),
    title: p.title,
    subtitle: p.subtitle ?? null,
    content: p.content,
    difficulty: p.difficulty,
    topic: p.topic ?? null,
    knowledge: p.knowledge ?? null,
  }));
}

export interface AttachProofInput {
  title: string;
  proof: string;
  provedAt: string; // ISO — when the kernel actually verified it
  certMintedAt: string; // ISO — when the certificate was signed
  signature: string | null;
  signatureKeyId: string | null;
}

// Matches by EXACT title (Leak never learns the CompeteMath-assigned
// questionId at promote time — promotion is an async queue drain, not a
// direct call — so title is the only shared key both sides have). The
// `proof IS NULL` guard makes this idempotent and refuses to ever clobber an
// existing proof: a retry or a stale title match is a no-op, not a corruption.
export async function attachProofToLiveProblem(
  input: AttachProofInput,
): Promise<{ questionId: number } | null> {
  const result = await sql`
    UPDATE questions
    SET
      proof = ${input.proof},
      "provedAt" = ${input.provedAt},
      "certMintedAt" = ${input.certMintedAt},
      signature = ${input.signature},
      "signatureKeyId" = ${input.signatureKeyId}
    WHERE "questionTitle" = ${input.title} AND proof IS NULL
    RETURNING "questionId";
  `;
  if (result.rows.length === 0) return null;
  return { questionId: Number(result.rows[0].questionId) };
}
