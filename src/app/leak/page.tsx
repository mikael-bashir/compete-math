import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "../lib/components/info-page";
import { LocalClaudeAgentManagement } from "@/components/local-claude-agent-management";
import { MCPServerManagement } from "@/components/mcp-server-management";
import { ProverPlayground } from "@/components/prover/prover-playground";

const SERVICES_REPO = "https://github.com/mikael-bashir/leak-services";

export const metadata: Metadata = {
  title: "Leak",
  description: "Leak, CompeteMath's automated theorem-proving research effort.",
};

// Reached from the navbar's Research dropdown; the real writeup on Leak's
// architecture and methodology lives at /about/leak. This route is
// deliberately separate so it can grow into its own page without disturbing
// that one — the playground below is the first thing growing here. Open to
// everyone; only the Local Agent setup dialog itself requires being signed
// in (see local-claude-agent-management.tsx).
export default function LeakPage() {
  return (
    <InfoPage kicker="leak" title="Leak" logo="/logos/Leak.png">
      <section>
        <p className="mt-1 text-sm text-white/60">
          New to Leak?{" "}
          <Link href="/about/leak" className="underline underline-offset-4 hover:text-emerald-200">
            Read what it is and how it works
          </Link>{" "}
          &mdash; the harnesses, the services, and the results on FATE-X.
        </p>
      </section>

      <section>
        <h2>Playground</h2>
        <p className="mt-3">
          Choose a harness and a driving model, connect your own local
          Claude Code CLI as the prover, and send a statement straight from
          here.
        </p>
        <p className="mt-3">
          Leak&rsquo;s main strength is the strength of its tools &mdash; see the{" "}
          <a href={SERVICES_REPO} target="_blank" rel="noopener noreferrer">Leak services</a>.
          Be sure to connect context-rich tools when using this harness for the
          best performance.
        </p>
        <div className="leak-dark-scope mt-6 mb-6 flex flex-wrap items-center gap-1.5">
          <LocalClaudeAgentManagement />
          <MCPServerManagement />
        </div>
        <div className="leak-dark-scope not-prose">
          <ProverPlayground />
        </div>
      </section>

      <section>
        <p className="mt-3">
          This page is under construction; the write-up on Leak&rsquo;s
          architecture and methodology is at{" "}
          <Link href="/about/leak" className="underline underline-offset-4 hover:text-emerald-200">/about/leak</Link>.
        </p>
      </section>
    </InfoPage>
  );
}
