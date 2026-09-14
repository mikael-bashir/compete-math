import { NextRequest, NextResponse } from "next/server";
import { smartSearchTengokuEntries } from "@/app/lib/data/tengoku-semantic-search";
import { indexConfigured } from "@/app/lib/tengoku-search/db";
import { searchIndex } from "@/app/lib/tengoku-search/search";
import { createHash } from "node:crypto";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }
  // The new index (docs/tengoku-search-plan.md) serves as soon as it is
  // configured; the sharded copy remains the fallback until it is retired.
  const results = indexConfigured()
    ? (await searchIndex(query)).results.map((r) => ({
        id: parseInt(createHash("sha1").update(r.id).digest("hex").slice(0, 8), 16),
        name: r.name, statement: r.statement, proof: "", status: r.tier === "trusted" ? ("trusted" as const) : ("tentative" as const),
        library: r.id.split("/")[0], sourceUrl: r.permalink || "", toolchain: "", compatibleToolchains: [] as string[],
      }))
    : await smartSearchTengokuEntries(query);
  console.log(`[tengoku-search] query="${query}" results=${results.length}`);
  return NextResponse.json({ results });
}
