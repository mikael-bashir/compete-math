import { sql } from "@vercel/postgres";
import seed from "./tengoku-history-seed.json";
import sourceCounts from "./tengoku-source-counts.json";
import { addDays, utcDay, type DayPoint } from "./tengoku-history-core";
import { getTreeStatsFull } from "./tengoku-stats";

// One row per UTC day: the counts shown on /tengoku that day. Created on first use, like the app's other small tables.
// The days before the first logged one come from the seed, which was rebuilt from the tree's git history (see tengoku-history-seed.json:
// the same definition as scripts/stats.py applied to each day's last commit). A logged day replaces a seeded one.
/**
 * Which counting rule a row was logged under. 3: each trusted theorem accounts for at most one tentative record, and a record is a
 * newline-terminated line; 2: a tentative record of a theorem the tree already trusts is counted once, by any match; 1: every record
 * line counted. A row logged under an older rule is replaced by the catch-up.
 */
export const COUNTING_RULE = 3;

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
  await sql`ALTER TABLE tengoku_daily_counts ADD COLUMN IF NOT EXISTS counting_rule integer NOT NULL DEFAULT 1`;
  ensured = true;
}

/** Per library [trusted, tentative]. */
export type LibraryCounts = Record<string, [number, number]>;

/**
 * Writes today's row. By default a second call the same day replaces it, so the last count of the day wins (the cron);
 * `ifMissing` leaves an existing row alone unless it was logged under an older counting rule (the page's own catch-up, see logTodayIfMissing).
 */
export async function recordDailyCount(
  c: { total: number; trusted: number; tentative: number; live: boolean; libraries: LibraryCounts },
  now = new Date(),
  mode: "replace" | "ifMissing" = "replace",
): Promise<string> {
  await ensure();
  const day = utcDay(now);
  const libs = JSON.stringify(c.libraries);
  if (mode === "ifMissing") {
    await sql`
      INSERT INTO tengoku_daily_counts (day, total, trusted, tentative, live, libraries, counting_rule)
      VALUES (${day}, ${c.total}, ${c.trusted}, ${c.tentative}, ${c.live}, ${libs}::jsonb, ${COUNTING_RULE})
      ON CONFLICT (day) DO UPDATE SET
        total = EXCLUDED.total, trusted = EXCLUDED.trusted, tentative = EXCLUDED.tentative,
        live = EXCLUDED.live, libraries = EXCLUDED.libraries, counting_rule = EXCLUDED.counting_rule, logged_at = now()
      WHERE tengoku_daily_counts.counting_rule < EXCLUDED.counting_rule
    `;
  } else {
    await sql`
      INSERT INTO tengoku_daily_counts (day, total, trusted, tentative, live, libraries, counting_rule)
      VALUES (${day}, ${c.total}, ${c.trusted}, ${c.tentative}, ${c.live}, ${libs}::jsonb, ${COUNTING_RULE})
      ON CONFLICT (day) DO UPDATE SET
        total = EXCLUDED.total, trusted = EXCLUDED.trusted, tentative = EXCLUDED.tentative,
        live = EXCLUDED.live, libraries = EXCLUDED.libraries, counting_rule = EXCLUDED.counting_rule, logged_at = now()
    `;
  }
  return day;
}

let caughtUpFor = ""; // the UTC day this server instance has already made sure is logged

/**
 * The graph keeps itself current without anyone running anything: the daily cron logs the day's count, and if the cron ever misses
 * (a failed run, a day with no deploy), the first visit of the new UTC day logs it instead. It never overwrites a row that exists and
 * never logs a count that fell back to stats.json, so a bad moment cannot put a false point on the graph.
 */
export async function logTodayIfMissing(now = new Date()): Promise<void> {
  const day = utcDay(now);
  if (caughtUpFor === day) return;
  try {
    await ensure();
    const { rows } = await sql`SELECT 1 FROM tengoku_daily_counts WHERE day = ${day} AND counting_rule >= ${COUNTING_RULE}`;
    if (rows.length === 0) {
      const s = await getTreeStatsFull();
      if (!s.live || !s.byLibrary) return; // try again on a later visit
      await recordDailyCount({ total: s.total, trusted: s.trusted, tentative: s.tentative + s.staging, live: true, libraries: s.byLibrary }, now, "ifMissing");
    }
    caughtUpFor = day;
  } catch (e) {
    console.error("[tengoku] catching the daily count up failed:", (e as Error).message);
  }
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
  /** library -> theorem and lemma declarations in its pinned source (only libraries that have one) */
  sources: Record<string, number>;
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
  const sources: Record<string, number> = {};
  for (const n of names) if (n in sourceCounts) sources[n] = (sourceCounts as Record<string, number>)[n];
  return { libraries: names, byDay, sources };
}
