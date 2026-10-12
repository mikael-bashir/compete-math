// The stat pills read what the tree holds straight from GitHub. The trusted and staging counts are COUNTED live from the tree's own
// record files (tengoku-live-count.ts), cached and revalidated every ten minutes (ISR). Tentative is 3 GB of records, so it comes from
// the tree's data/stats.json (written by scripts/stats.py), which is also what the pills use if the live count fails. The old
// cached-table path is only a last fallback.
import { getTengokuStats, type TengokuStats } from "./tengoku";

export const STATS_URL = "https://raw.githubusercontent.com/competemath/tengoku/main/data/stats.json";
export const STATS_REVALIDATE_SECONDS = 600;

export interface TreeStats {
  totals: { trusted: number; staging: number; tentative: number; all: number };
  libraries: Record<string, { trusted: number; staging: number; tentative: number; last_promoted_at?: string }>;
  library_count: number;
  generated_at?: string;
  tree_commit?: string;
  toolchain?: string;
  last_promoted_at?: string | null;
}

/** Shape the tree's stats.json into what the pills show. Staging counts as
 * tentative on the page: real proof, not yet promoted. */
export function parseTreeStats(raw: unknown): TengokuStats & { treeCommit?: string; generatedAt?: string } {
  const s = raw as Partial<TreeStats>;
  const t = s.totals;
  if (!t || typeof t.all !== "number") throw new Error("stats.json: missing totals");
  return {
    total: t.all,
    trusted: t.trusted ?? 0,
    tentative: (t.tentative ?? 0) + (t.staging ?? 0),
    libraryCount: s.library_count ?? Object.keys(s.libraries ?? {}).length,
    treeCommit: s.tree_commit,
    generatedAt: s.generated_at,
  };
}

/** Everything the tree's stats.json says, validated: one shape for the page's pills, GET /api/tengoku/stats and anything else that
 * quotes the counts. `staging` is kept apart here; the pills fold it into "tentative" (see parseTreeStats). */
export interface FullTreeStats {
  trusted: number;
  staging: number;
  tentative: number;
  total: number;
  libraries: number | null;
  toolchain: string | null;
  treeCommit: string | null;
  generatedAt: string | null;
  lastPromotedAt: string | null;
  source: string;
  /** true when trusted and staging were counted from the tree just now; false when they are stats.json's (the live count failed) */
  live: boolean;
  /** trusted = trustedRecords (data/trusted) + trustedIntake (intake manifests); null when not counted live */
  trustedRecords: number | null;
  trustedIntake: number | null;
  /** the tree commit that was counted, and when */
  countedCommit: string | null;
  countedAt: string | null;
  /** why the live count fell back to stats.json; null when it did not */
  liveError: string | null;
}

function count(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

export function parseFullStats(raw: unknown): FullTreeStats {
  const s = (raw ?? {}) as Partial<Record<keyof TreeStats, unknown>>;
  const t = (s.totals ?? {}) as Record<string, unknown>;
  const trusted = count(t.trusted);
  const staging = count(t.staging);
  const tentative = count(t.tentative);
  const total = count(t.all);
  if (trusted === null || staging === null || tentative === null || total === null) throw new Error("stats.json: totals missing");
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    trusted,
    staging,
    tentative,
    total,
    libraries: count(s.library_count),
    toolchain: str(s.toolchain),
    treeCommit: str(s.tree_commit),
    generatedAt: str(s.generated_at),
    lastPromotedAt: str(s.last_promoted_at),
    source: STATS_URL,
    live: false,
    trustedRecords: null,
    trustedIntake: null,
    countedCommit: null,
    countedAt: null,
    liveError: null,
  };
}

export async function getTreeStatsFull(): Promise<FullTreeStats> {
  const res = await fetch(STATS_URL, { next: { revalidate: STATS_REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`stats.json ${res.status}`);
  const base = parseFullStats(await res.json());
  try {
    // loaded here, not at the top, so importing this module (and its tests) never pulls in next/cache
    const { countLiveTrusted } = await import("./tengoku-live-count");
    const live = await countLiveTrusted();
    return {
      ...base,
      trusted: live.trusted,
      staging: live.staging,
      total: live.trusted + live.staging + base.tentative,
      treeCommit: live.commit,
      live: true,
      trustedRecords: live.trustedRecords,
      trustedIntake: live.trustedIntake,
      countedCommit: live.commit,
      countedAt: live.countedAt,
      liveError: null,
    };
  } catch (e) {
    const why = (e as Error).message;
    console.error("[tengoku] live count failed, using stats.json:", why);
    return { ...base, liveError: why };
  }
}

export async function getTreeStats(): Promise<TengokuStats> {
  try {
    const f = await getTreeStatsFull();
    return { total: f.total, trusted: f.trusted, tentative: f.tentative + f.staging, libraryCount: f.libraries ?? 0 };
  } catch (e) {
    console.error("[tengoku] stats.json unavailable, using the database snapshot:", (e as Error).message);
    return getTengokuStats();
  }
}
