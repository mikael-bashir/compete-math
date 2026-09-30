import type { Metadata } from "next";
import { SiGithub } from "react-icons/si";
import { InfoPage } from "../lib/components/info-page";
import { TengokuSearchBar } from "@/components/tengoku/search-bar";
import { StatPill } from "@/components/tengoku/stat-pill";
import { getTreeStats } from "@/app/lib/data/tengoku-stats";

export const metadata: Metadata = {
  title: "Tengoku",
  description:
    "Tengoku (天国 — “heaven”) is an open-source Lean 4 formal knowledge tree: many libraries unified on one toolchain, open to contributions, growing autonomously with Leak.",
};

const TENGOKU_REPO = "https://github.com/competemath/tengoku";

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export default async function TengokuPage() {
  const stats = await getTreeStats();

  return (
    <InfoPage kicker="tengoku" title="Tengoku" logo="/logos/Tengoku.png">
      <section className="text-center">
        <p className="text-white/60! text-base leading-relaxed max-w-2xl mx-auto">
          Tengoku (天国 — &ldquo;heaven&rdquo;) is an open-source Lean&nbsp;4 formal
          knowledge tree.
        </p>

        <div className="not-prose mt-8 flex flex-wrap items-center justify-center gap-3 font-code text-xs">
          <StatPill tone="neutral">
            <strong className="text-white!">{formatCount(stats.total)}</strong> theorems
          </StatPill>
          <StatPill
            tone="trusted"
            note="Anything marked Leak-trusted compiles from scratch in the self-contained Tengoku tree, on its one pinned Lean toolchain, with no sorry, only the standard axioms, and assumptions that are not contradictory."
          >
            <strong className="text-emerald-300">{formatCount(stats.trusted)}</strong> Leak-trusted
          </StatPill>
          <StatPill
            tone="tentative"
            note="Anything marked tentative has a real proof at its source, but Leak has not verified it yet."
          >
            <strong className="text-amber-300">{formatCount(stats.tentative)}</strong> tentative
          </StatPill>
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
            {stats.libraryCount} sources
          </StatPill>
        </div>

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
          <TengokuSearchBar />
        </div>
      </section>
    </InfoPage>
  );
}
