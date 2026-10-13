export const dynamic = "force-dynamic";
export const maxDuration = 60; // the live count may have to read the tree on a cold cache

import { NextResponse } from "next/server";
import { getTreeStatsFull } from "@/app/lib/data/tengoku-stats";
import { recordDailyCount } from "@/app/lib/data/tengoku-history";

// Same auth as the other cron: Vercel sends `Authorization: Bearer <CRON_SECRET>`; `?key=` allows a manual run. Fails closed.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("Authorization") === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("key") === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const s = await getTreeStatsFull();
    // a day's number is only worth keeping if it was counted live; a stats.json fallback would draw a false flat line
    if (!s.live) return NextResponse.json({ logged: false, reason: s.liveError ?? "live count unavailable" }, { status: 503 });
    const day = await recordDailyCount({ total: s.total, trusted: s.trusted, tentative: s.tentative + s.staging, live: s.live });
    return NextResponse.json({ logged: true, day, total: s.total, trusted: s.trusted, tentative: s.tentative + s.staging });
  } catch (e) {
    return NextResponse.json({ logged: false, reason: (e as Error).message }, { status: 500 });
  }
}
