// lib/data.ts

import { sql } from "@vercel/postgres";
import { SubmissionResult } from "../types/problems";
import * as badgeRewarders from "./badges";

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
export async function getProblemById(id: number): Promise<{ questionId: string, subtitle: string, questionTitle: string, difficulty: string, points: string, questionProblem: string, topic: string | null, knowledge: string | null }> {
  try {
    // Vercel SQL returns a result object where .rows is the array of data
    const result = await sql`
      SELECT
        "questionId",
        subtitle,
        "questionTitle",
        difficulty,
        points,
        "questionProblem",
        topic,
        knowledge
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
      knowledge: result.rows[0].knowledge ?? null
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

export async function recordSubmission(userId: string, questionId: number, userAttempt: string): Promise<SubmissionResult> {
  try {
    // 1. CHECK IF ALREADY SOLVED
    // We check this first to prevent unnecessary processing
    const existing = await sql`
      SELECT "isCorrect" 
      FROM submissions 
      WHERE username = ${userId} AND "questionId" = ${questionId}
    `;

    if (existing.rows.length > 0 && existing.rows[0].isCorrect) {
      return { success: false, message: 'Problem already solved' };
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

    // 3. UPSERT: Record the attempt securely
    await sql`
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
                        END;
    `;

    return { success: true, isCorrect };

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

  return newBadges;
}
