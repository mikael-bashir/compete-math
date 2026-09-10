import type { Metadata } from "next";
import { SiGithub } from "react-icons/si";
import { InfoPage } from "../lib/components/info-page";
import { TengokuSearchBar } from "@/components/tengoku/search-bar";
import { getTengokuStats } from "@/app/lib/data/tengoku";

export const metadata: Metadata = {
  title: "Tengoku",
  description:
    "The world's biggest open-source Lean 4 formal knowledge tree — every entry a real theorem, with a proof, unified in one searchable place.",
};

const TENGOKU_REPO = "https://github.com/competemath/tengoku";

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export default async function TengokuPage() {
  const stats = await getTengokuStats();

  return (
    <InfoPage kicker="tengoku" title="Tengoku">
      <section className="text-center">
        <p className="text-white/60! text-base leading-relaxed max-w-2xl mx-auto">
          Tengoku (天国 — &ldquo;heaven&rdquo;) is the world&rsquo;s biggest
          open-source Lean&nbsp;4 formal knowledge tree — layered checks unify
          every significant formalized theorem in one place. Anything marked{" "}
          <strong>Leak-trusted</strong> has been verified by{" "}
          <a href="/leak">Leak</a> itself. Extensive metadata and an adaptive
          relevance-weighting system surface the results that matter for any
          search.
        </p>

        <div className="not-prose mt-8 flex flex-wrap items-center justify-center gap-3 font-code text-xs">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-white/70">
            <strong className="text-white!">{formatCount(stats.total)}</strong> theorems
          </span>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/[0.06] px-4 py-1.5 text-emerald-300/80">
            <strong className="text-emerald-300">{formatCount(stats.trusted)}</strong> Leak-trusted
          </span>
          <span className="rounded-full border border-amber-400/20 bg-amber-500/[0.06] px-4 py-1.5 text-amber-300/80">
            <strong className="text-amber-300">{formatCount(stats.tentative)}</strong> tentative
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-white/50">
            {stats.libraryCount} sources
          </span>
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
