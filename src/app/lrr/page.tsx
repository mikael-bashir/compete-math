import type { Metadata } from "next";
import Link from "next/link";
import { SiGithub } from "react-icons/si";
import { InfoPage } from "../lib/components/info-page";
import { AccessForm } from "./access-form";

export const metadata: Metadata = {
  title: "LRR | CompeteMath",
  description: "Secure Leak Research Repository benchmarks and automated theorem proving runs.",
};

export default function LRRPage() {
  return (
    <InfoPage kicker="lrr" title="Leak Research Repository">
      <section>
        <p className="mt-3">
          This vault contains the formal verification benchmarks, Lean 4 proofs, and automated theorem proving runs associated with the FATE-X evaluation on Leak.
        </p>
        <p className="mt-3">
          To prevent data contamination and preserve benchmark integrity, access to these proofs is restricted to verified evaluators via single-use access codes.
        </p>
        
        <div className="mt-6 rounded-b-sm rounded-t-sm border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-3">
            Resources:
          </p>
          <div className="flex flex-col gap-2.5 text-sm">
            <Link 
              href="/about/leak" 
              target="_blank" 
              rel="noreferrer"
              className="text-emerald-300/90 hover:text-emerald-300 underline underline-offset-4 transition-colors"
            >
              &rarr; What is Leak? (Architecture &amp; Methodology)
            </Link>
            {/* <a 
              href="https://github.com/mikael-bashir/leak-services" 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors no-underline"
            >
              <SiGithub className="h-4 w-4" />
              <span>mikael-bashir/leak-services</span>
            </a>
            <a 
              href="https://github.com/mikael-bashir/nextjs-ai-chatbot" 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors no-underline"
            >
              <SiGithub className="h-4 w-4" />
              <span>mikael-bashir/nextjs-ai-chatbot</span>
            </a> */}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <AccessForm />
      </section>
    </InfoPage>
  );
}