import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { findLeakTarget } from "@/data/leak-targets";
import { ticketSecret } from "@/app/lib/data/leak-memory";
import { issueTicket } from "@/app/lib/leak-memory/harness";

// A ticket for a run that is about to start (the page asks for one with every memory run, and the bridge carries it): it names the signed-in
// account and the target and is signed with a key only this server has. Theorems from the run count towards the kept tier's intake only when
// the ticket is old enough, so "a long-running effort" is something this server observed (app/lib/leak-memory/harness.ts). The account comes from the
// session, never from the request.

const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) return NextResponse.json({ error: "Sign in to use memory" }, { status: 401, headers: noStore });
  let body: { target?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  const target = typeof body.target === "string" ? findLeakTarget(body.target) : null;
  if (!target) return NextResponse.json({ error: "Unknown target" }, { status: 404, headers: noStore });
  const secret = ticketSecret();
  if (!secret) return NextResponse.json({ error: "Tickets are not configured" }, { status: 503, headers: noStore });
  return NextResponse.json({ ticket: issueTicket(username, target.id, secret) }, { headers: noStore });
}
