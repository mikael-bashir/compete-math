// The pure part of the theorem-count history chart: UTC days, the window a range covers, and how values become pixels.

export interface DayPoint {
  day: string; // YYYY-MM-DD, UTC
  total: number;
  trusted: number;
  tentative: number;
}

export const RANGES = [
  { key: "7d", days: 7, label: "Last week" },
  { key: "30d", days: 30, label: "30 days" },
  { key: "90d", days: 90, label: "90 days" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

const DAY_MS = 86_400_000;

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  return utcDay(new Date(toMs(day) + n * DAY_MS));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/**
 * The window that ends today and spans `days` days, with the points that fall inside it, oldest first. When the history is
 * shorter than the window (the project is younger than 90 days) the window starts at the first logged day, so the line is not
 * squeezed into the right edge. With a single point the full window is kept and that point sits at the right edge.
 */
export function windowPoints(points: DayPoint[], days: number, today: string): { start: string; days: number; points: DayPoint[] } {
  const fullStart = addDays(today, -(days - 1));
  const inside = points.filter((p) => p.day >= fullStart && p.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1));
  const start = inside.length >= 2 && inside[0].day > fullStart ? inside[0].day : fullStart;
  return { start, days: daysBetween(start, today) + 1, points: inside };
}

/**
 * The vertical range to draw. It hugs the data so a few hundred new theorems are visible against hundreds of thousands, with a
 * margin so the line never touches the edge, and a floor so a flat series or a single point sits in the middle and not on a rail.
 */
export function yDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.2, 1);
  return [lo - pad, hi + pad];
}

export interface Placed {
  day: string;
  value: number;
  x: number;
  y: number;
}

/** Pixel positions inside a w-by-h box: the window's first day is the left edge, today the right edge. */
export function place(points: DayPoint[], start: string, days: number, w: number, h: number, pick: (p: DayPoint) => number): Placed[] {
  const [lo, hi] = yDomain(points.map(pick));
  const span = Math.max(days - 1, 1);
  return points.map((p) => {
    const value = pick(p);
    return {
      day: p.day,
      value,
      x: (daysBetween(start, p.day) / span) * w,
      y: h - ((value - lo) / (hi - lo)) * h,
    };
  });
}
