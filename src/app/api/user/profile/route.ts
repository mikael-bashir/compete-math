import { NextResponse } from 'next/server';
import { sql } from "@vercel/postgres";
import { auth } from '@/app/(auth)/auth'; // Ensure path is correct
import { fillCountryFromRequest } from '@/app/lib/data/geo';

export async function GET(request: Request) {
  const session = await auth();

  // 1. Auth Check
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Backfill path for pre-existing users: default their country from the geo
  // header on any account visit, so they don't need to submit again to get a
  // flag (leaderboards JOIN users, so this retroactively flags old entries).
  await fillCountryFromRequest(session.user.username, request);

  try {
    // We can rely on email or try to find by ID if provided, 
    // but we need the 'username' for the submissions table.
    const userIdentifier = session.user.username; 
    
    // 2. Fetch User Data
    // We fetch by email (or modify to id if preferred) to get the specific 'username'
    const userRes = await sql`
      SELECT 
        username,
        email,
        created_at,
        badges,
        titles,
        country,
        "badgeSelected", -- Keep original column name
        "titleSelected"
      FROM users
      WHERE username = ${userIdentifier} -- or id = session.user.id
    `;

    if (userRes.rowCount === 0) throw new Error("User not found");

    const user = userRes.rows[0];
    const userBadges = user.badges || [];
    const userTitles = user.titles || [];
    const dbUsername = user.username; // <--- Critical for submissions query

    // 3. Fetch ALL Badges
    // We fetch everything so the UI can render "Locked" states for badges user doesn't own.
    const badgesRes = await sql`
      SELECT
        "badgeName",
        "badgeUrl",
        description,
        "numberAvailable",
        "numberOwned",
        "noBorder"
      FROM badges
      ORDER BY "numberAvailable" ASC NULLS LAST, "badgeName" ASC;
    `;

    // 4. Transform to match Frontend Interface EXACTLY
    const mergedBadges = badgesRes.rows.map(b => ({
      badgeName: b.badgeName, // <--- FIXED: Frontend expects 'badgeName'
      badgeUrl: b.badgeUrl,   // <--- FIXED: Frontend expects 'badgeUrl'
      description: b.description || "No description available.",

      // Logic: It is unlocked if the user's text[] array includes this badge name
      isUnlocked: userBadges.includes(b.badgeName),

      // Logic: It is selected if it matches the user's selection column
      isSelected: user.badgeSelected === b.badgeName,

      isLimited: b.numberAvailable !== null,
      numberAvailable: b.numberAvailable, // Passed for "Limited" UI tag
      numberOwned: b.numberOwned,
      // Prestige badges (animated, transparent art) skip the bordered tile frame
      noBorder: !!b.noBorder
    }));

    // 4b. Fetch ALL Titles (same "show locked ones too" shape as badges)
    const titlesRes = await sql`
      SELECT
        "titleName",
        description,
        "numberAvailable",
        "numberOwned",
        "colorFrom",
        "colorTo"
      FROM titles
      ORDER BY "numberAvailable" ASC NULLS LAST, "titleName" ASC;
    `;

    const mergedTitles = titlesRes.rows.map(t => ({
      titleName: t.titleName,
      description: t.description || "No description available.",
      isUnlocked: userTitles.includes(t.titleName),
      isSelected: user.titleSelected === t.titleName,
      isLimited: t.numberAvailable !== null,
      numberAvailable: t.numberAvailable,
      numberOwned: t.numberOwned,
      // Prestige titles get a custom gradient + glow instead of the default look
      colorFrom: t.colorFrom || null,
      colorTo: t.colorTo || null
    }));

    // 5. Fetch Stats (Using USERNAME, not UUID)
    const statsRes = await sql`
      SELECT COUNT(*) as solved_count 
      FROM submissions 
      WHERE username = ${dbUsername} AND "isCorrect" = TRUE
    `;
    const solvedCount = statsRes.rows[0].solved_count;

    return NextResponse.json({
      username: user.username,
      email: user.email,
      created_at: user.created_at, // Frontend expects this or joinedAt
      country: user.country || null,
      badgeSelected: user.badgeSelected, // <--- FIXED: Frontend expects 'badgeSelected'
      titleSelected: user.titleSelected,
      solvedCount: parseInt(solvedCount),
      badges: mergedBadges,
      titles: mergedTitles
    });

  } catch (error) {
    console.error("Profile API Error:", error);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}