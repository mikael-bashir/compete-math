import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { findLeakTarget } from "@/data/leak-targets";
import { getShare, keptSummary, setShare } from "@/app/lib/data/leak-memory";
import { KEEP_AT, intakeAccounts } from "@/app/lib/leak-memory/kept-core";

// Whether the signed-in account shares its kept theorems (rated KEEP_AT stars or more) with Tengoku's memory intake, and how many it has kept for a
// target. Off until the account turns it on. Turning it on offers the theorems for review: they are re-checked on the real tree, staged as
// tentative and approved by a person before anything is published; turning it off takes the not-yet-submitted ones out of the queue.
// Every handler takes the username from the session and nothing from the request.

const noStore = { "Cache-Control": "private, no-store" };

async function who(): Promise<string | null> {
  const session = await auth();
  return session?.user?.username ?? null;
}

export async function GET(request: NextRequest) {
  const username = await who();
  if (!username) return NextResponse.json({ error: "Sign in to use memory" }, { status: 401, headers: noStore });
  const target = findLeakTarget(request.nextUrl.searchParams.get("target") ?? "");
  try {
    const share = await getShare(username);
    const kept = target ? await keptSummary(username, target.id) : { kept: 0, submitted: 0 };
    return NextResponse.json({ share, allowed: intakeAccounts().has(username), keepAt: KEEP_AT, ...kept }, { headers: noStore });
  } catch (e) {
    console.error("[leak-memory] share read failed:", e);
    return NextResponse.json({ error: "Could not read" }, { status: 500, headers: noStore });
  }
}

export async function PUT(request: NextRequest) {
  const username = await who();
  if (!username) return NextResponse.json({ error: "Sign in to use memory" }, { status: 401, headers: noStore });
  let body: { share?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  if (typeof body.share !== "boolean") return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  // the intake is open to the accounts the owner lists (LEAK_INTAKE_ACCOUNTS) and no others; turning sharing off is always allowed
  if (body.share && !intakeAccounts().has(username)) return NextResponse.json({ error: "Sharing with the intake is not open to this account yet" }, { status: 403, headers: noStore });
  try {
    await setShare(username, body.share);
    return NextResponse.json({ share: body.share }, { headers: noStore });
  } catch (e) {
    console.error("[leak-memory] share write failed:", e);
    return NextResponse.json({ error: "Could not update" }, { status: 500, headers: noStore });
  }
}
