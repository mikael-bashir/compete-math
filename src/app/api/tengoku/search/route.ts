import { NextRequest, NextResponse } from "next/server";
import { smartSearchTengokuEntries } from "@/app/lib/data/tengoku-semantic-search";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }
  const results = await smartSearchTengokuEntries(query);
  console.log(`[tengoku-search] query="${query}" results=${results.length}`);
  return NextResponse.json({ results });
}
