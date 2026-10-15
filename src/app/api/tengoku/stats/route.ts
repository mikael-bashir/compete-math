// GET /api/tengoku/stats: the tree's own counts, one canonical URL for every place that quotes them (the page's pills read the same
// function, so the two can never disagree; a README badge or a partner's page can read this URL).
//
// `trusted` and `staging` are COUNTED from the tree's own files (every line of data/trusted/*.jsonl and of each data/intake/*/manifest.jsonl;
// every line of data/staging/*.jsonl), cached and revalidated every ten minutes. `tentative` (2.9 GB of records) is kept exactly from a
// counted seed plus the commits since, less the records of theorems the tree already trusts (`tentativeAlreadyTrusted`; the same rule as
// scripts/stats.py). `live` says which: false means the count failed and everything is stats.json's.
// If even stats.json cannot be read it answers 503 and caches nothing, rather than serving a made-up number.
import { NextResponse } from "next/server";
import { getTreeStatsFull } from "@/app/lib/data/tengoku-stats";

// a literal on purpose: Next reads route segment config statically and rejects an imported constant here
export const revalidate = 600;
// a cold count streams about 280 MB once; every later revalidation re-reads only the files that changed
export const maxDuration = 60;

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET() {
  try {
    const stats = { ...(await getTreeStatsFull()), byLibrary: undefined }; // the per-library figures have their own endpoint
    const generated = Date.parse(stats.countedAt ?? stats.generatedAt ?? "");
    const ageSeconds = Number.isFinite(generated) ? Math.max(0, Math.round((Date.now() - generated) / 1000)) : null;
    return NextResponse.json(
      { ...stats, ageSeconds },
      { headers: { ...CORS, "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    console.error("[tengoku] /api/tengoku/stats:", (e as Error).message);
    return NextResponse.json({ error: "stats unavailable" }, { status: 503, headers: { ...CORS, "Cache-Control": "no-store" } });
  }
}
