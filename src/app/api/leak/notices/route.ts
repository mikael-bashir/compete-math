import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { actOnNotice, getNoticePrefs, listNotices, noticeCounts, seenAllNotices, setNoticePrefs } from "@/app/lib/data/leak-memory";
import { intakeAccounts } from "@/app/lib/leak-memory/kept-core";
import { CATALOGUE, KIND_LABEL, KNOWN_CODES } from "@/app/lib/leak-memory/notices-catalogue";

// The signed-in account's notices: what became of the theorems it put forward to Tengoku (a pull request opened, a check that failed, a change a
// reviewer asked for, a theorem the bar returned, a merge), per target, and the settings that decide what the driver is told about them.
//   GET   ?target=  the open notices (and the counts of every target), the settings, and the words of every code
//   PATCH { id, action: "ignore" | "unignore" | "seen" } or { action: "seen-all", target? }
//   PUT   { prefs }  the settings, field by field (notices-core.ts cleanPrefs)
// Every handler takes the username from the session and nothing from the request; an id that is not the account's changes nothing.

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const TARGET = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ID = /^[0-9a-f]{24}$/;

async function who(): Promise<string | null> {
  const session = await auth();
  return session?.user?.username ?? null;
}

export async function GET(request: NextRequest) {
  const username = await who();
  if (!username) return NextResponse.json({ error: "Sign in to see your notices" }, { status: 401, headers: noStore });
  const t = request.nextUrl.searchParams.get("target");
  const target = t && TARGET.test(t) ? t : undefined;
  try {
    const [notices, counts, prefs] = await Promise.all([
      listNotices(username, { target, includeResolved: request.nextUrl.searchParams.get("all") === "1" }),
      noticeCounts(username),
      getNoticePrefs(username),
    ]);
    const codes = KNOWN_CODES.map((c) => ({ code: c, title: CATALOGUE[c].title }));
    return NextResponse.json({ allowed: intakeAccounts().has(username), notices, counts, prefs, codes, kinds: KIND_LABEL }, { headers: noStore });
  } catch (e) {
    console.error("[leak-notices] read failed:", e);
    return NextResponse.json({ error: "Could not read" }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  const username = await who();
  if (!username) return NextResponse.json({ error: "Sign in to use notices" }, { status: 401, headers: noStore });
  let body: { id?: unknown; action?: unknown; target?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  try {
    if (body.action === "seen-all") {
      const target = typeof body.target === "string" && TARGET.test(body.target) ? body.target : undefined;
      return NextResponse.json({ changed: await seenAllNotices(username, target) }, { headers: noStore });
    }
    if ((body.action === "ignore" || body.action === "unignore" || body.action === "seen") && typeof body.id === "string" && ID.test(body.id)) {
      return NextResponse.json({ changed: (await actOnNotice(username, body.id, body.action)) ? 1 : 0 }, { headers: noStore });
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  } catch (e) {
    console.error("[leak-notices] update failed:", e);
    return NextResponse.json({ error: "Could not update" }, { status: 500, headers: noStore });
  }
}

export async function PUT(request: NextRequest) {
  const username = await who();
  if (!username) return NextResponse.json({ error: "Sign in to use notices" }, { status: 401, headers: noStore });
  let body: { prefs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  if (!body.prefs || typeof body.prefs !== "object") return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  try {
    return NextResponse.json({ prefs: await setNoticePrefs(username, body.prefs) }, { headers: noStore });
  } catch (e) {
    console.error("[leak-notices] settings failed:", e);
    return NextResponse.json({ error: "Could not update" }, { status: 500, headers: noStore });
  }
}
