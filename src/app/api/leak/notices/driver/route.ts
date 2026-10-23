import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { driverNotices } from "@/app/lib/data/leak-memory";

// The block the driver is handed for one target: the account's open notices in the catalogue's words (never a reviewer's text), within the account's own
// limits, plus its pinned note. The playground fetches it when a run starts and again while the run lasts; the bridge hands the driver a new one only when
// its hash changes. Empty `text`: nothing to say.

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const TARGET = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function GET(request: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  const target = request.nextUrl.searchParams.get("target") ?? "";
  if (!TARGET.test(target)) return NextResponse.json({ error: "Bad target" }, { status: 400, headers: noStore });
  try {
    return NextResponse.json(await driverNotices(username, target), { headers: noStore });
  } catch (e) {
    console.error("[leak-notices] driver block failed:", e);
    return NextResponse.json({ error: "Could not read" }, { status: 500, headers: noStore });
  }
}
