import { sql } from "@vercel/postgres";

// Titles are a separate cosmetic entity from badges (own table, own
// "titles"/"titleSelected" columns on users) but for the current roster every
// title shares the exact criteria of the badge it's named after — see
// [[project-competemath-badge-titles-split]]. Add new title-only criteria
// here once titles are meant to diverge from their badge counterparts.
const TITLE_NAMES = {
  EARLY_ADOPTER: 'Where it all began',
  FIRST_SOLVER: 'The margin was too small',
  NEWBIE: 'newbie'
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
