// GET /api/tengoku/libraries: for each of the last 90 days, how many trusted and tentative theorems each source library holds in
// the tree. The chart on /tengoku loads it the first time someone points at the graph. Days before logging began were rebuilt from the
// tree's git history; today's figures are counted live. Cached for ten minutes.
import { NextResponse } from "next/server";
import { getTreeStatsFull } from "@/app/lib/data/tengoku-stats";
import { getLibraryBreakdown } from "@/app/lib/data/tengoku-history";
import { utcDay } from "@/app/lib/data/tengoku-history-core";

export const revalidate = 600; // a literal on purpose
export const maxDuration = 60;

export async function GET() {
  try {
    const stats = await getTreeStatsFull().catch(() => null);
    const today = stats?.byLibrary ? { day: utcDay(new Date()), libraries: stats.byLibrary } : undefined;
    const breakdown = await getLibraryBreakdown(90, today);
    return NextResponse.json(breakdown, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" } });
  } catch (e) {
    console.error("[tengoku] /api/tengoku/libraries:", (e as Error).message);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
