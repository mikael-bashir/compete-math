import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { findLeakTarget } from "@/data/leak-targets";
import {
  MAX_NOMINATED,
  MIN_NOMINATED_FOR_AUDIT,
  deleteMemory,
  listMemory,
  saveMemory,
  setNominated,
} from "@/app/lib/data/leak-memory";

// The signed-in account's saved theorems for one Leak target. Every handler takes the username from the session and
// nothing from the request, so one account can never read or write another's memory.

async function who(): Promise<string | null> {
  const session = await auth();
  return session?.user?.username ?? null;
}

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const username = await who();
  if (!username) return NextResponse.json({ error: "Sign in to use memory" }, { status: 401, headers: noStore });
  const target = request.nextUrl.searchParams.get("target") ?? "";
  if (!findLeakTarget(target)) return NextResponse.json({ error: "Unknown target" }, { status: 404, headers: noStore });
  try {
    const entries = await listMemory(username, target);
    return NextResponse.json({ target, entries, limits: { maxNominated: MAX_NOMINATED, minNominatedForAudit: MIN_NOMINATED_FOR_AUDIT } }, { headers: noStore });
  } catch (e) {
    console.error("[leak-memory] list failed:", e);
    return NextResponse.json({ error: "Could not load memory" }, { status: 500, headers: noStore });
  }
}

// Body: { target, entries: [...] } from the `memory` frames of a run (save / update).
export async function POST(request: NextRequest) {
  const username = await who();
  if (!username) return NextResponse.json({ error: "Sign in to use memory" }, { status: 401, headers: noStore });
  let body: { target?: unknown; entries?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  const target = typeof body.target === "string" ? body.target : "";
  if (!findLeakTarget(target)) return NextResponse.json({ error: "Unknown target" }, { status: 404, headers: noStore });
  if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > 100) {
    return NextResponse.json({ error: "Send 1 to 100 entries" }, { status: 400, headers: noStore });
  }
  try {
    return NextResponse.json(await saveMemory(username, target, body.entries), { headers: noStore });
  } catch (e) {
    console.error("[leak-memory] save failed:", e);
    return NextResponse.json({ error: "Could not save" }, { status: 500, headers: noStore });
  }
}

// Body: { target, id, nominated }
export async function PATCH(request: NextRequest) {
  const username = await who();
  if (!username) return NextResponse.json({ error: "Sign in to use memory" }, { status: 401, headers: noStore });
  let body: { target?: unknown; id?: unknown; nominated?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  const target = typeof body.target === "string" ? body.target : "";
  const id = typeof body.id === "string" ? body.id : "";
  if (!findLeakTarget(target) || !/^[0-9a-f]{8,64}$/.test(id) || typeof body.nominated !== "boolean") {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  }
  try {
    const r = await setNominated(username, target, id, body.nominated);
    return NextResponse.json(r, { status: r.ok ? 200 : 409, headers: noStore });
  } catch (e) {
    console.error("[leak-memory] nominate failed:", e);
    return NextResponse.json({ error: "Could not update" }, { status: 500, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  const username = await who();
  if (!username) return NextResponse.json({ error: "Sign in to use memory" }, { status: 401, headers: noStore });
  const target = request.nextUrl.searchParams.get("target") ?? "";
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!findLeakTarget(target) || !/^[0-9a-f]{8,64}$/.test(id)) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  try {
    return NextResponse.json({ deleted: await deleteMemory(username, target, id) }, { headers: noStore });
  } catch (e) {
    console.error("[leak-memory] delete failed:", e);
    return NextResponse.json({ error: "Could not delete" }, { status: 500, headers: noStore });
  }
}
