import type { Metadata } from "next";
import { SiGithub } from "react-icons/si";
import { InfoPage } from "../lib/components/info-page";
import { TengokuSearchBar } from "@/components/tengoku/search-bar";

export const metadata: Metadata = {
  title: "Tengoku",
  description:
    "A growing corpus of Lean 4 theorems and their proofs, harvested from open libraries and CompeteMath, awaiting Leak's own stamp of verification.",
};

const TENGOKU_REPO = "https://github.com/competemath/tengoku";

export default function TengokuPage() {
  return (
    <InfoPage kicker="tengoku" title="Tengoku">
      <section>
        <p>
          Tengoku (天国 — &ldquo;heaven&rdquo;) is a growing repository of Lean 4{" "}
          <strong>theorems and their proofs</strong>, harvested from open
          formalization libraries and from CompeteMath&rsquo;s own certified
          problems. Every entry already has a real proof from somewhere —
          the question is only whether <a href="/leak">Leak</a> has stamped
          it yet. <strong>Tentative</strong> entries are proofs from a real
          source (linked on every entry) that Leak hasn&rsquo;t re-verified
          itself; <strong>Leak-trusted</strong> entries are ones Leak&rsquo;s
          own toolchain has already compiled and certified.
        </p>

        <a
          href={TENGOKU_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-4 no-underline transition-colors hover:border-white/20"
        >
          <div className="flex items-center gap-3">
            <SiGithub className="h-5 w-5 text-white/70" />
            <div>
              <div className="text-sm font-semibold text-white!">
                competemath/tengoku
              </div>
              <div className="text-xs text-white/50">
                The harvester tool and every source JSONL file, public.
              </div>
            </div>
          </div>
          <span className="font-code text-xs text-emerald-300/80">&rarr;</span>
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
