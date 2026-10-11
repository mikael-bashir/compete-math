// GET /api/tengoku/stats: the tree's own counts, one canonical URL for every place that quotes them (the pills, the docs, a README badge,
// a partner's page), so no number has to be typed into a page.
//
// The numbers are not computed here. The tree writes data/stats.json on every promotion (scripts/stats.py in competemath/tengoku);
// this route serves that file, validated, with the commit it describes and its age, cached at the edge for ten minutes and served
// stale for a day if GitHub is slow. If the file cannot be read or does not look like stats, it answers 503 and caches nothing,
// rather than serving a made-up number.
import { NextResponse } from "next/server";
import { STATS_URL, STATS_REVALIDATE_SECONDS } from "@/app/lib/data/tengoku-stats";

export const revalidate = STATS_REVALIDATE_SECONDS;

const HEADERS = {
  "Cache-Control": `public, s-maxage=${STATS_REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
  "Access-Control-Allow-Origin": "*",
};

function count(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

export async function GET() {
  try {
    const res = await fetch(STATS_URL, { next: { revalidate: STATS_REVALIDATE_SECONDS } });
    if (!res.ok) throw new Error(`stats.json ${res.status}`);
    const raw = (await res.json()) as {
      totals?: Record<string, unknown>;
      library_count?: unknown;
      tree_commit?: unknown;
      toolchain?: unknown;
      generated_at?: unknown;
      last_promoted_at?: unknown;
    };
    const t = raw.totals ?? {};
    const trusted = count(t.trusted), staging = count(t.staging), tentative = count(t.tentative), all = count(t.all);
    if (trusted === null || staging === null || tentative === null || all === null) throw new Error("stats.json: totals missing");
    const generatedAt = typeof raw.generated_at === "string" ? raw.generated_at : null;
    const ageSeconds = generatedAt ? Math.max(0, Math.round((Date.now() - Date.parse(generatedAt)) / 1000)) : null;
    return NextResponse.json(
      {
        trusted, staging, tentative, total: all,
        libraries: count(raw.library_count),
        toolchain: typeof raw.toolchain === "string" ? raw.toolchain : null,
        treeCommit: typeof raw.tree_commit === "string" ? raw.tree_commit : null,
        generatedAt,
        lastPromotedAt: typeof raw.last_promoted_at === "string" ? raw.last_promoted_at : null,
        ageSeconds: Number.isFinite(ageSeconds) ? ageSeconds : null,
        source: STATS_URL,
      },
      { headers: HEADERS },
    );
  } catch (e) {
    console.error("[tengoku] /api/tengoku/stats:", (e as Error).message);
    return NextResponse.json({ error: "stats unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
  }
}
