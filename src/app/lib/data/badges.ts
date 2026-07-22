import { sql } from "@vercel/postgres";

const BADGE_NAMES = {
  EARLY_ADOPTER: 'Where it all began',
  FIRST_SOLVER: 'The margin was too small',
  NEWBIE: 'Newbie',
  IMPERVIOUS: 'Impervious'
};

/**
 * HELPER: Grant a badge safely.
 * 1. Checks if user already has it (via DB query logic).
 * 2. Adds to user's array.
 * 3. Updates badge stats (Decrement available, Increment owned).
 */

type BadgeReward = {
  badgeName: string;
  badgeUrl: string;
} | null;

async function grantBadge(username: string, badgeName: string): Promise<BadgeReward> {
  try {
    // 1. Try to append the badge to the user's list.
    // The "AND NOT" clause ensures we do NOT update if they already have it.
    const userUpdate = await sql`
      UPDATE users
      SET badges = array_append(badges, ${badgeName})
      WHERE username = ${username}
      AND NOT (${badgeName} = ANY(badges))
      RETURNING username;
    `;

    // 2. ONLY if the user was actually updated (meaning they didn't have the badge before)
    if (userUpdate.rows.length > 0) {
      
      // We update stats AND fetch the URL in one go using RETURNING
      const badgeUpdate = await sql`
        UPDATE badges 
        SET 
          "numberOwned" = "numberOwned" + 1,
          "numberAvailable" = CASE 
            WHEN "numberAvailable" IS NOT NULL 
            THEN "numberAvailable" - 1 
            ELSE "numberAvailable" 
          END
        WHERE "badgeName" = ${badgeName}
        RETURNING "badgeUrl"
      `;

      // Return the object needed for the UI Toaster
      if (badgeUpdate.rows.length > 0) {
        return { 
          badgeName: badgeName, 
          badgeUrl: badgeUpdate.rows[0].badgeUrl 
        };
      }
    } 
    
    return null; // User already has this badge, or badge doesn't exist
  } catch (error) {
    console.error(`Failed to grant badge ${badgeName}:`, error);
    return null;
  }
}

/**
 * Criteria: Awarded if there is still 'stock' available (numberAvailable > 0).
 * Logic: Checks specific badge stats, then grants if applicable.
 */
export async function Where_It_All_Started(username: string) {
  try {
    // Check current availability
    // We look at 'numberAvailable'
    const stats = await sql`
      SELECT "numberAvailable" 
      FROM badges 
      WHERE "badgeName" = ${BADGE_NAMES.EARLY_ADOPTER}
    `;

    if (stats.rows.length > 0) {
      const { numberAvailable } = stats.rows[0];
      
      // If numberAvailable is NULL, it's unlimited.
      // If it is a number, it must be > 0.
      if (numberAvailable > 0) {
        const awarded = await grantBadge(username, BADGE_NAMES.EARLY_ADOPTER);
        return awarded ? awarded : null;
      }
    }
  } catch (error) {
    console.error("Error checking 'Where It All Started':", error);
  }
}

/**
 * Criteria: Awarded for being the FIRST person to solve a problem based on Time.
 * Logic: Compares user's solvedAt vs the Global Minimum solvedAt for this problem.
 */
export async function The_Margin_Was_Too_Small(username: string, questionId: number) {
  try {
    // 1. Get the 'solvedAt' time for the CURRENT user's correct submission
    // We use the 'submissions' table fields
    const userSubmission = await sql`
      SELECT "solvedAt"
      FROM submissions 
      WHERE username = ${username} 
      AND "questionId" = ${questionId} 
      AND "isCorrect" = TRUE
    `;

    if (userSubmission.rows.length === 0) return; // User hasn't actually solved it correctly yet

    const userSolvedAt = new Date(userSubmission.rows[0].solvedAt).getTime();

    // 2. Get the GLOBAL EARLIEST 'solvedAt' for this problem
    const globalFirst = await sql`
      SELECT MIN("solvedAt") as "firstSolvedAt"
      FROM submissions 
      WHERE "questionId" = ${questionId} 
      AND "isCorrect" = TRUE
    `;

    if (globalFirst.rows.length === 0) return; // 

    const firstSolvedAt = new Date(globalFirst.rows[0].firstSolvedAt).getTime();

    // 3. Compare: If the user's time is the same as the first time, they are the first solver.
    // (Using <= in case of slight JS/DB parsing precision differences, though === is logically ideal)
    if (userSolvedAt <= firstSolvedAt) {
      const awarded = await grantBadge(username, BADGE_NAMES.FIRST_SOLVER);
      return awarded ? awarded : null;
    }

  } catch (error) {
    console.error("Error checking 'The Margin Was Too Small':", error);
  }
}

/**
 * Criteria: Awarded once a user has correctly solved 5 problems tagged
 * "Insane" difficulty. Date-limited: once badges."availableUntil" is in the
 * past (1 Nov 2026) it can no longer be earned by anyone.
 */
export async function Impervious(username: string) {
  try {
    // Availability gate: a non-null availableUntil in the past closes the badge.
    const avail = await sql`
      SELECT "availableUntil" FROM badges WHERE "badgeName" = ${BADGE_NAMES.IMPERVIOUS}
    `;
    const until = avail.rows[0]?.availableUntil;
    if (until && new Date(until).getTime() <= Date.now()) return;

    const count = await sql`
      SELECT COUNT(*)::int AS n
      FROM submissions s
      JOIN questions q ON q."questionId" = s."questionId"
      WHERE s.username = ${username}
      AND s."isCorrect" = TRUE
      AND q.difficulty = 'Insane'
    `;

    if ((count.rows[0]?.n ?? 0) >= 5) {
      const awarded = await grantBadge(username, BADGE_NAMES.IMPERVIOUS);
      return awarded ? awarded : null;
    }
  } catch (error) {
    console.error("Error checking 'Impervious':", error);
  }
}
