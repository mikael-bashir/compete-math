import { sql } from "@vercel/postgres";

// Titles are a separate cosmetic entity from badges (own table, own
// "titles"/"titleSelected" columns on users) but for the current roster every
// title shares the exact criteria of the badge it's named after — see
// [[project-competemath-badge-titles-split]]. Add new title-only criteria
// here once titles are meant to diverge from their badge counterparts.
const TITLE_NAMES = {
  EARLY_ADOPTER: 'Where it all began',
  FIRST_SOLVER: 'The margin was too small',
  NEWBIE: 'newbie',
  IMPERVIOUS: 'Impervious',
  INDOMITABLE: 'The Indomitable'
};

type TitleReward = {
  titleName: string;
} | null;

async function grantTitle(username: string, titleName: string): Promise<TitleReward> {
  try {
    const userUpdate = await sql`
      UPDATE users
      SET titles = array_append(titles, ${titleName})
      WHERE username = ${username}
      AND NOT (${titleName} = ANY(titles))
      RETURNING username;
    `;

    if (userUpdate.rows.length > 0) {
      const titleUpdate = await sql`
        UPDATE titles
        SET
          "numberOwned" = "numberOwned" + 1,
          "numberAvailable" = CASE
            WHEN "numberAvailable" IS NOT NULL
            THEN "numberAvailable" - 1
            ELSE "numberAvailable"
          END
        WHERE "titleName" = ${titleName}
        RETURNING "titleName"
      `;

      if (titleUpdate.rows.length > 0) {
        return { titleName };
      }
    }

    return null; // User already has this title, or title doesn't exist
  } catch (error) {
    console.error(`Failed to grant title ${titleName}:`, error);
    return null;
  }
}

export async function Where_It_All_Started_Title(username: string) {
  try {
    const stats = await sql`
      SELECT "numberAvailable"
      FROM titles
      WHERE "titleName" = ${TITLE_NAMES.EARLY_ADOPTER}
    `;

    if (stats.rows.length > 0) {
      const { numberAvailable } = stats.rows[0];
      if (numberAvailable > 0) {
        const awarded = await grantTitle(username, TITLE_NAMES.EARLY_ADOPTER);
        return awarded ? awarded : null;
      }
    }
  } catch (error) {
    console.error("Error checking title 'Where It All Started':", error);
  }
}

export async function The_Margin_Was_Too_Small_Title(username: string, questionId: number) {
  try {
    const userSubmission = await sql`
      SELECT "solvedAt"
      FROM submissions
      WHERE username = ${username}
      AND "questionId" = ${questionId}
      AND "isCorrect" = TRUE
    `;

    if (userSubmission.rows.length === 0) return;

    const userSolvedAt = new Date(userSubmission.rows[0].solvedAt).getTime();

    const globalFirst = await sql`
      SELECT MIN("solvedAt") as "firstSolvedAt"
      FROM submissions
      WHERE "questionId" = ${questionId}
      AND "isCorrect" = TRUE
    `;

    if (globalFirst.rows.length === 0) return;

    const firstSolvedAt = new Date(globalFirst.rows[0].firstSolvedAt).getTime();

    if (userSolvedAt <= firstSolvedAt) {
      const awarded = await grantTitle(username, TITLE_NAMES.FIRST_SOLVER);
      return awarded ? awarded : null;
    }

  } catch (error) {
    console.error("Error checking title 'The Margin Was Too Small':", error);
  }
}

export async function Impervious_Title(username: string) {
  try {
    // Same date cutoff as the Impervious badge (see [[titles mirror badges]]).
    const avail = await sql`
      SELECT "availableUntil" FROM titles WHERE "titleName" = ${TITLE_NAMES.IMPERVIOUS}
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
      const awarded = await grantTitle(username, TITLE_NAMES.IMPERVIOUS);
      return awarded ? awarded : null;
    }
  } catch (error) {
    console.error("Error checking title 'Impervious':", error);
  }
}

/**
 * Criteria: solve EVERY problem currently tagged "Insane". Not limited.
 *
 * Deliberately compares the user's distinct correct Insane solves against the
 * live count of Insane problems, so it stays correct as the DB changes: an
 * Insane problem removed or relabelled away shrinks the target; a new/relabelled
 * Insane problem grows it (an already-granted user keeps the title, but a
 * not-yet-granted user must clear the newcomer too). Requires >= 1 Insane
 * problem to exist so "all of zero" can never grant it to everyone.
 */
export async function The_Indomitable_Title(username: string) {
  try {
    const res = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM questions WHERE difficulty = 'Insane') AS total,
        (SELECT COUNT(DISTINCT q."questionId")::int
           FROM questions q
           JOIN submissions s ON s."questionId" = q."questionId"
          WHERE q.difficulty = 'Insane'
            AND s.username = ${username}
            AND s."isCorrect" = TRUE) AS solved
    `;
    const total = res.rows[0]?.total ?? 0;
    const solved = res.rows[0]?.solved ?? 0;

    if (total >= 1 && solved >= total) {
      const awarded = await grantTitle(username, TITLE_NAMES.INDOMITABLE);
      return awarded ? awarded : null;
    }
  } catch (error) {
    console.error("Error checking title 'The Indomitable':", error);
  }
}