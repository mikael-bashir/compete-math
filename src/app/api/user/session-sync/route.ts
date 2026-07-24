import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { auth } from '@/app/(auth)/auth';

// GET /api/user/session-sync — the CURRENT equipped cosmetics for the signed-in
// user, straight from the DB. The JWT session caches badgeUrl/title colours and
// only refreshes them at credential login or a same-session equip, so a change
// made anywhere else (another device/browser, an admin force-equip, a direct DB
// edit) leaves other sessions stale forever. The site chrome calls this once per
// page load and session.update()s the diff — see navstrip.tsx.
export async function GET() {
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await sql`
      SELECT b."badgeUrl" AS badge_url,
             b."noBorder" AS badge_no_border,
             t."colorFrom" AS title_color_from,
             t."colorTo" AS title_color_to,
             t."textColor" AS title_text_color
      FROM users u
      LEFT JOIN badges b ON b."badgeName" = u."badgeSelected"
      LEFT JOIN titles t ON t."titleName" = u."titleSelected"
      WHERE u.username = ${session.user.username};
    `;
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const row = res.rows[0];

    const response = NextResponse.json({
      // Same fallback the session() callback uses, so comparisons are stable.
      badgeUrl: row.badge_url ?? '/badges/newbie.png',
      badgeNoBorder: !!row.badge_no_border,
      titleColorFrom: row.title_color_from ?? null,
      titleColorTo: row.title_color_to ?? null,
      titleTextColor: row.title_text_color ?? null,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('session-sync error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
