import type { Metadata } from "next";
import { Suspense, cache } from "react";
import { after } from "next/server";
import { SiGithub } from "react-icons/si";
import { InfoPage } from "../lib/components/info-page";
import { TengokuSearchBar } from "@/components/tengoku/search-bar";
import { StatPill } from "@/components/tengoku/stat-pill";
import { HistoryChart } from "@/components/tengoku/history-chart";
import { ChartSkeleton, PillsSkeleton } from "@/components/tengoku/skeletons";
import { getTreeStats } from "@/app/lib/data/tengoku-stats";
import { getDailyCounts, logTodayIfMissing } from "@/app/lib/data/tengoku-history";
import { utcDay, type DayPoint } from "@/app/lib/data/tengoku-history-core";

export const metadata: Metadata = {
  title: "Tengoku",
  description:
    "Tengoku (天国 — “heaven”) is an open-source Lean 4 formal knowledge tree: many libraries unified on one toolchain, open to contributions, growing autonomously with Leak.",
};

const TENGOKU_REPO = "https://github.com/competemath/tengoku";

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

// The numbers are counted from the tree (GitHub) and read from the database, which takes from a second to several when nothing is cached.
// They are fetched inside their own Suspense boundaries, so the page itself, its search box included, appears at once and each block fills in
// when its data arrives. `cache` makes the pills and the chart share one count within a request.
const treeStats = cache(() => getTreeStats().catch(() => null));

async function Pills() {
  const stats = await treeStats();
  const count = (n: number | undefined) => (n === undefined ? "—" : formatCount(n));
  return (
    // Leak-trusted is the number that matters, so it sits at the middle of the page and the other two flank it (a plain centred row would centre
    // the group, not the pill). On a phone it takes the first row and the other two are centred together on the second.
    <div className="not-prose mt-8 flex flex-wrap items-center justify-center gap-3 font-code text-xs sm:grid sm:grid-cols-[1fr_auto_1fr]">
      <span className="flex w-full justify-center sm:col-start-2 sm:row-start-1 sm:w-auto">
        <StatPill
          tone="trusted"
          note="Anything marked Leak-trusted compiles from scratch in the self-contained Tengoku tree, on its one pinned Lean toolchain, with no sorry, only the standard axioms, and assumptions that are not contradictory."
        >
          <strong className="text-emerald-300">{count(stats?.trusted)}</strong> Leak-trusted
        </StatPill>
      </span>
      <span className="sm:col-start-1 sm:row-start-1 sm:justify-self-end">
        <StatPill
          tone="tentative"
          note="Anything marked tentative has a real proof at its source, but Leak has not verified it yet."
        >
          <strong className="text-amber-300">{count(stats?.tentative)}</strong> tentative
        </StatPill>
      </span>
      <span className="sm:col-start-3 sm:row-start-1 sm:justify-self-start">
        <StatPill
          tone="muted"
          note={
            <>
              Visit the{" "}
              <a href={TENGOKU_REPO} target="_blank" rel="noopener noreferrer">
                Tengoku repository
              </a>{" "}
              to see the full list of sources.
            </>
          }
        >
          {stats ? stats.libraryCount : "—"} sources
        </StatPill>
      </span>
    </div>
  );
}

async function History() {
  // the logged days, with today's point being what the pills above show right now (the day's last count replaces it in the log)
  const today = utcDay(new Date());
  const [stats, logged] = await Promise.all([treeStats(), getDailyCounts(90)]);
  const history: DayPoint[] = [
    ...logged.filter((p) => p.day !== today),
    ...(stats ? [{ day: today, total: stats.total, trusted: stats.trusted, tentative: stats.tentative }] : []),
  ];
  return <HistoryChart points={history} today={today} />;
}

export default function TengokuPage() {
  after(() => logTodayIfMissing()); // the graph's own catch-up if the daily cron missed

  return (
    <InfoPage kicker="tengoku" title="Tengoku" logo="/logos/Tengoku.png">
      <section className="text-center">
        <p className="text-white/60! text-base leading-relaxed max-w-2xl mx-auto">
          Tengoku (天国 — &ldquo;heaven&rdquo;) is an open-source Lean&nbsp;4 formal
          knowledge tree.
        </p>

        <Suspense fallback={<PillsSkeleton />}>
          <Pills />
        </Suspense>

        <a
          href={TENGOKU_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="not-prose mt-6 inline-flex items-center gap-2 font-code text-xs text-white/40 no-underline transition-colors hover:text-emerald-300"
        >
          <SiGithub className="h-3.5 w-3.5" />
          competemath/tengoku &rarr;
        </a>
      </section>

      <section>
        <div className="not-prose">
          <Suspense fallback={<ChartSkeleton />}>
            <History />
          </Suspense>
        </div>
      </section>

      <section>
        <div className="not-prose">
          <TengokuSearchBar />
        </div>
      </section>
    </InfoPage>
  );
}
