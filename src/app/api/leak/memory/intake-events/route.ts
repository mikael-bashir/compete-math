import { NextRequest, NextResponse } from "next/server";
import { authorizeIntake } from "@/app/lib/leak-memory/oidc";
import { applyReviews, ingestNotices } from "@/app/lib/data/leak-memory";
import { intakeAccounts } from "@/app/lib/leak-memory/kept-core";

// The intake job's reports of what became of the theorems (the workflow in competemath/emissary-archangel; docs/leak-notices.md). POST only, with a
// GitHub Actions OIDC token from that workflow (the same gate as the candidates), and off unless LEAK_INTAKE_ENABLED=1.
//   { events: [{ username, target, kind, code, detail?, ids?, names?, prNumber?, prUrl?, round? }],
//     prs:    [{ username, target, number, url, events: [{ kind, code, ... }] }],
//     reviews: [{ username, target, bundle, returned: [{ id, code }], rejected: [{ id, code }], accepted: [id] }] }
// `events` are outcomes that belong to no pull request (a theorem the bar returned before one was opened). Each of `prs` is the CURRENT state of a pull request:
// the notices it lists are written, and notices it had before and no longer lists are answered. Only accounts the owner lists (LEAK_INTAKE_ACCOUNTS) can be written about.
// `reviews` are a code owner's decisions on single theorems of a bundle's pull request (kept-core.ts `review`): the decided ones are held (a rejected theorem is never offered again, a
// returned one only when its text changed) and, once the pull request is closed, `accepted` (the theorems nobody decided on) are freed for the next bundle. The notices of the decisions
// travel in `prs`, the effect on the kept theorems here; a report about a bundle a theorem is no longer in changes nothing, so it can be sent again.

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const a = await authorizeIntake(request.headers.get("authorization"));
  if (!a.ok) return NextResponse.json({ error: a.status === 404 ? "Not found" : "Unauthorized" }, { status: a.status, headers: noStore });
  let body: { events?: unknown; prs?: unknown; reviews?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  const prs = Array.isArray(body.prs) ? body.prs : [];
  const reviews = Array.isArray(body.reviews) ? body.reviews : [];
  if (events.length + prs.length + reviews.length === 0 || events.length > 300 || prs.length > 100 || reviews.length > 100) {
    return NextResponse.json({ error: "Send 1 to 300 events, up to 100 pull requests and up to 100 reviews" }, { status: 400, headers: noStore });
  }
  try {
    const accounts = intakeAccounts();
    const r = await ingestNotices({ events, prs: prs as never }, accounts);
    const held = await applyReviews(reviews, accounts);
    return NextResponse.json({ ...r, reviews: held }, { headers: noStore });
  } catch (e) {
    console.error("[leak-notices] ingest failed:", e);
    return NextResponse.json({ error: "Could not write" }, { status: 500, headers: noStore });
  }
}
