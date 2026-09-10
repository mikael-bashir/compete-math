import { NextRequest, NextResponse } from "next/server";
import { searchTengokuEntries } from "@/app/lib/data/tengoku";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }
  const results = await searchTengokuEntries(query);
  console.log(`[tengoku-search] query="${query}" results=${results.length}`);
  return NextResponse.json({ results });
}
