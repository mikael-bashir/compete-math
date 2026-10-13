import { sql } from "@vercel/postgres";
import seed from "./tengoku-history-seed.json";
import { addDays, utcDay, type DayPoint } from "./tengoku-history-core";

// One row per UTC day: the counts shown on /tengoku that day. Created on first use, like the app's other small tables.
// The days before the first logged one come from the seed, which was rebuilt from the tree's git history (see tengoku-history-seed.json:
// the same definition as scripts/stats.py applied to each day's last commit). A logged day replaces a seeded one.
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
  await sql`ALTER TABLE tengoku_daily_counts ADD COLUMN IF NOT EXISTS libraries jsonb`;
  ensured = true;
}

/** Per library [trusted, tentative]. */
export type LibraryCounts = Record<string, [number, number]>;

/** Writes today's row; a second call the same day replaces it, so the last count of the day wins. */
export async function recordDailyCount(
  c: { total: number; trusted: number; tentative: number; live: boolean; libraries: LibraryCounts },
  now = new Date(),
): Promise<string> {
  await ensure();
  const day = utcDay(now);
  await sql`
    INSERT INTO tengoku_daily_counts (day, total, trusted, tentative, live, libraries)
    VALUES (${day}, ${c.total}, ${c.trusted}, ${c.tentative}, ${c.live}, ${JSON.stringify(c.libraries)}::jsonb)
    ON CONFLICT (day) DO UPDATE SET
      total = EXCLUDED.total, trusted = EXCLUDED.trusted, tentative = EXCLUDED.tentative,
      live = EXCLUDED.live, libraries = EXCLUDED.libraries, logged_at = now()
  `;
  return day;
}

const seeded: DayPoint[] = seed.days.map((d) => ({ day: d.day, total: d.total, trusted: d.trusted, tentative: d.tentative }));

/** The last `days` days, oldest first: seeded days, then logged ones. A missing table or database error leaves the seed, not a broken page. */
export async function getDailyCounts(days: number, now = new Date()): Promise<DayPoint[]> {
  const since = addDays(utcDay(now), -(days - 1));
  const byDay = new Map(seeded.filter((p) => p.day >= since).map((p) => [p.day, p]));
  try {
    const { rows } = await sql`
      SELECT to_char(day, 'YYYY-MM-DD') AS day, total, trusted, tentative
      FROM tengoku_daily_counts WHERE day >= ${since} ORDER BY day
    `;
    for (const r of rows) byDay.set(r.day, { day: r.day, total: r.total, trusted: r.trusted, tentative: r.tentative });
  } catch (e) {
    console.error("[tengoku] reading the daily counts failed:", (e as Error).message);
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

export interface LibraryBreakdown {
  /** library names; a row is [index into this list, trusted, tentative] */
  libraries: string[];
  byDay: Record<string, [number, number, number][]>;
}

/** Every day's per-library counts for the last `days` days: the seed, then logged days, then today's live figures if given. */
export async function getLibraryBreakdown(days: number, today?: { day: string; libraries: LibraryCounts }, now = new Date()): Promise<LibraryBreakdown> {
  const since = addDays(utcDay(now), -(days - 1));
  const perDay = new Map<string, LibraryCounts>();
  for (const [day, rows] of Object.entries(seed.byDay)) {
    if (day < since) continue;
    const m: LibraryCounts = {};
    for (const [i, t, e] of rows as [number, number, number][]) m[seed.libraries[i]] = [t, e];
    perDay.set(day, m);
  }
  try {
    const { rows } = await sql`
      SELECT to_char(day, 'YYYY-MM-DD') AS day, libraries FROM tengoku_daily_counts
      WHERE day >= ${since} AND libraries IS NOT NULL ORDER BY day
    `;
    for (const r of rows) perDay.set(r.day, r.libraries as LibraryCounts);
  } catch (e) {
    console.error("[tengoku] reading the daily library counts failed:", (e as Error).message);
  }
  if (today) perDay.set(today.day, today.libraries);
  const names = [...new Set([...perDay.values()].flatMap((m) => Object.keys(m)))].sort();
  const index = new Map(names.map((n, i) => [n, i]));
  const byDay: LibraryBreakdown["byDay"] = {};
  for (const [day, m] of [...perDay].sort(([a], [b]) => (a < b ? -1 : 1))) {
    byDay[day] = Object.entries(m).map(([n, v]) => [index.get(n)!, v[0], v[1]]);
  }
  return { libraries: names, byDay };
}
