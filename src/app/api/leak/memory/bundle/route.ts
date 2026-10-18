import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { findLeakTarget } from "@/data/leak-targets";
import { MAX_NOMINATED, MIN_NOMINATED_FOR_AUDIT, listMemory } from "@/app/lib/data/leak-memory";

// The signed-in account's nominated theorems for one target, as the bundle emissary-archangel's memory intake takes
// (memory-intake/bundle.schema.json there). Nothing is sent anywhere: the account downloads it and chooses what to do.
// The intake re-checks every field, so the bundle carries no signature.
export async function GET(request: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  const noStore = { "Cache-Control": "private, no-store" };
  if (!username) return NextResponse.json({ error: "Sign in to export" }, { status: 401, headers: noStore });
  const target = findLeakTarget(request.nextUrl.searchParams.get("target"));
  if (!target) return NextResponse.json({ error: "Unknown target" }, { status: 404, headers: noStore });
  try {
    const nominated = (await listMemory(username, target.id)).filter((e) => e.nominated && !e.subsumedBy);
    if (nominated.length < MIN_NOMINATED_FOR_AUDIT || nominated.length > MAX_NOMINATED) {
      return NextResponse.json(
        { error: `Nominate ${MIN_NOMINATED_FOR_AUDIT} to ${MAX_NOMINATED} theorems first (you have ${nominated.length}).` },
        { status: 409, headers: noStore },
      );
    }
    const bundle = {
      schema: "leak-memory-bundle/1",
      target: { id: target.id, title: target.title, statement: target.statement },
      author: username,
      exportedAt: new Date().toISOString(),
      entries: nominated.map(({ id, name, statement, closure, origin, savedAt, attempt, isTarget }) => ({ id, name, statement, closure, origin, savedAt, attempt, isTarget })),
    };
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: { ...noStore, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="leak-memory-${target.id}.json"` },
    });
  } catch (e) {
    console.error("[leak-memory] export failed:", e);
    return NextResponse.json({ error: "Could not export" }, { status: 500, headers: noStore });
  }
}
