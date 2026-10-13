import { sql } from "@vercel/postgres";
import { utcDay, addDays, type DayPoint } from "./tengoku-history-core";

// One row per UTC day: the counts shown on /tengoku that day. Created on first use, like the app's other small tables.
let ensured = false;
async function ensure(): Promise<void> {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS tengoku_daily_counts (
      day        date PRIMARY KEY,
      total      integer NOT NULL,
      trusted    integer NOT NULL,
      tentative  integer NOT NULL,
      live       boolean NOT NULL,
      logged_at  timestamptz NOT NULL DEFAULT now()
    )
  `;
  ensured = true;
}

/** Writes today's row; a second call the same day replaces it, so the last count of the day wins. */
export async function recordDailyCount(c: { total: number; trusted: number; tentative: number; live: boolean }, now = new Date()): Promise<string> {
  await ensure();
  const day = utcDay(now);
  await sql`
    INSERT INTO tengoku_daily_counts (day, total, trusted, tentative, live)
    VALUES (${day}, ${c.total}, ${c.trusted}, ${c.tentative}, ${c.live})
    ON CONFLICT (day) DO UPDATE SET
      total = EXCLUDED.total, trusted = EXCLUDED.trusted, tentative = EXCLUDED.tentative,
      live = EXCLUDED.live, logged_at = now()
  `;
  return day;
}

/** The last `days` days of logged counts, oldest first. A missing table or a database error is an empty history, not a broken page. */
export async function getDailyCounts(days: number, now = new Date()): Promise<DayPoint[]> {
  try {
    const since = addDays(utcDay(now), -(days - 1));
    const { rows } = await sql`
      SELECT to_char(day, 'YYYY-MM-DD') AS day, total, trusted, tentative
      FROM tengoku_daily_counts WHERE day >= ${since} ORDER BY day
    `;
    return rows.map((r) => ({ day: r.day, total: r.total, trusted: r.trusted, tentative: r.tentative }));
  } catch (e) {
    console.error("[tengoku] reading the daily counts failed:", (e as Error).message);
    return [];
  }
}
