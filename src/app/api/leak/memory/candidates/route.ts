import { NextRequest, NextResponse } from "next/server";
import { authorizeIntake } from "@/app/lib/leak-memory/oidc";
import { intakeCandidates, markSubmitted } from "@/app/lib/data/leak-memory";
import { intakeAccounts } from "@/app/lib/leak-memory/kept-core";
import { deployBuildVerifier } from "@/app/lib/leak-memory/harness";

// The memory intake job's two calls (the workflow in competemath/emissary-archangel; see docs/leak-memory.md). Both need a GitHub Actions OIDC
// token from that workflow (app/lib/leak-memory/oidc.ts) and both are off unless LEAK_INTAKE_ENABLED=1 on the host.
//   GET   the candidates: for every account that shares AND is listed in LEAK_INTAKE_ACCOUNTS (the owner's own, for now), the kept theorems of one target that no bundle holds yet, at most ten per bundle.
//   POST  { marks: [{ username, target, ids, bundle }] }: the job says which theorems went into which bundle (its sha-256), so they are not offered again.
// Nothing here publishes anything: a candidate is a claim by a client, and the job re-derives every field before it opens a pull request.

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const HEX = /^[0-9a-f]{8,64}$/;
const checkBuild = deployBuildVerifier();
const TARGET = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function GET(request: NextRequest) {
  const a = await authorizeIntake(request.headers.get("authorization"));
  if (!a.ok) return NextResponse.json({ error: a.status === 404 ? "Not found" : "Unauthorized" }, { status: a.status, headers: noStore });
  try {
    // a theorem is offered only when its ticket and receipt passed when it was kept (the store) and the build it names is one the project published
    const bundles = await intakeCandidates(
      Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 20)),
      intakeAccounts(),
      async (ev) => !!ev.build && (await checkBuild(ev.build)).ok,
    );
    return NextResponse.json(
      {
        schema: "leak-memory-candidates/1",
        bundles: bundles.map((b) => ({
          author: b.username,
          target: b.target,
          entries: b.entries.map(({ id, name, kind, statement, closure, origin, savedAt, attempt, isTarget, quality, evidence }) => ({
            id, name, kind, statement, closure, origin, savedAt, attempt, isTarget, quality: quality ?? null,
            // what the server saw of the harness when the theorem was kept: the intake job records it in the bundle's report (the producer's claims, not facts)
            harness: { keptAt: evidence.at, ticketAgeMs: evidence.ticket.ageMs ?? null, receipt: evidence.receipt, buildId: evidence.build?.id ?? null },
          })),
        })),
      },
      { headers: noStore },
    );
  } catch (e) {
    console.error("[leak-memory] candidates failed:", e);
    return NextResponse.json({ error: "Could not read" }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const a = await authorizeIntake(request.headers.get("authorization"));
  if (!a.ok) return NextResponse.json({ error: a.status === 404 ? "Not found" : "Unauthorized" }, { status: a.status, headers: noStore });
  let body: { marks?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  const marks = Array.isArray(body.marks) ? body.marks : null;
  if (!marks || marks.length === 0 || marks.length > 50) return NextResponse.json({ error: "Send 1 to 50 marks" }, { status: 400, headers: noStore });
  const clean: { username: string; target: string; ids: string[]; bundle: string }[] = [];
  for (const m of marks as Record<string, unknown>[]) {
    const ids = Array.isArray(m?.ids) ? (m.ids as unknown[]) : [];
    if (
      typeof m?.username !== "string" || !m.username || m.username.length > 100 ||
      typeof m?.target !== "string" || !TARGET.test(m.target) ||
      typeof m?.bundle !== "string" || !/^[0-9a-f]{64}$/.test(m.bundle) ||
      ids.length === 0 || ids.length > 10 || !ids.every((x) => typeof x === "string" && HEX.test(x))
    ) {
      return NextResponse.json({ error: "Bad mark" }, { status: 400, headers: noStore });
    }
    clean.push({ username: m.username, target: m.target, ids: ids as string[], bundle: m.bundle });
  }
  try {
    let marked = 0;
    for (const m of clean) marked += await markSubmitted(m.username, m.target, m.ids, m.bundle);
    return NextResponse.json({ marked }, { headers: noStore });
  } catch (e) {
    console.error("[leak-memory] mark failed:", e);
    return NextResponse.json({ error: "Could not mark" }, { status: 500, headers: noStore });
  }
}
