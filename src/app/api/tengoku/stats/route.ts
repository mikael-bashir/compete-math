// GET /api/tengoku/stats: the tree's own counts, one canonical URL for every place that quotes them (the page's pills read the same
// function, so the two can never disagree; a README badge or a partner's page can read this URL).
//
// The numbers are not computed here. The tree writes data/stats.json on every promotion (scripts/stats.py in competemath/tengoku);
// this route serves that file, validated, with the commit it describes and its age, cached at the edge for ten minutes and served
// stale for a day if GitHub is slow. If the file cannot be read or does not look like stats, it answers 503 and caches nothing,
// rather than serving a made-up number.
import { NextResponse } from "next/server";
import { getTreeStatsFull } from "@/app/lib/data/tengoku-stats";

// a literal on purpose: Next reads route segment config statically and rejects an imported constant here
export const revalidate = 600;

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET() {
  try {
    const stats = await getTreeStatsFull();
    const generated = stats.generatedAt ? Date.parse(stats.generatedAt) : NaN;
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
