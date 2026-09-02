import type { Metadata } from "next";
import Link from "next/link";
import { SiGithub } from "react-icons/si";
import { InfoPage } from "../../lib/components/info-page";

export const metadata: Metadata = {
  title: "What is Leak?",
  description:
    "The experimental Lean 4 proving engine behind CompeteMath's verified problems.",
};

const MAIN_REPO = "https://github.com/mikael-bashir/nextjs-ai-chatbot";
const SERVICES_REPO = "https://github.com/mikael-bashir/leak-services";

export default function AboutLeakPage() {
  return (
    <InfoPage kicker="leak" title="What is Leak?">
      <section>
        <p>
          Leak is the proving engine behind CompeteMath. When a problem here is
          marked verified, a Leak prover wrote a proof in{" "}
          <a href="https://lean-lang.org" target="_blank" rel="noopener noreferrer">
            Lean&nbsp;4
          </a>{" "}
          and the Lean kernel checked it.
        </p>
        <p className="mt-4">
          Rather than being a single program, Leak consists of many experimental pipelines designed to test different approaches to automated theorem proving. Currently, we operate five main agent harnesses, all driven by Anthropic&rsquo;s Claude Sonnet 5 CLI Agent.
        </p>
      </section>

      <section>
        <h2>Leak Harnesses</h2>
        <p className="mt-3">
          These harnesses differ in the tools they are allowed to use, how they interact with the Lean kernel, and their underlying proof strategies.
        </p>

        <div className="mt-6 space-y-4">
          <FeatureCard
            name="Leak Control-I"
            badge="Agent · One-Shot"
            tone="slate"
          >
            A Claude Sonnet 5 agent forced to prove a theorem one-shot with no compiler feedback or internet search, invigilated by Leak-IV. This harness is highly significant as a baseline control: it failed comedically at FATE-X, agreeing with the findings by the authors of FATE-X, proving exactly why iterative feedback loops are necessary.
          </FeatureCard>

          <FeatureCard
            name="Leak Control-II"
            badge="Agent · Leak-I, Leak-IV"
            tone="emerald"
          >
            The best performing harness of this project. A Claude Sonnet 5 agent forced to continuously try to prove a theorem with no internet search, but granted access to Leak-I and Leak-IV, invigilated by a seperate Leak-IV gate, and allowed to use tools and think for itself. This minimalist but persistent pipeline is significant because it achieved a breakthrough score of <strong>38/98 on FATE-X</strong>.
          </FeatureCard>

          <FeatureCard
            name="Leak Control-III"
            badge="Agent · Leak-I, Leak-II, Leak-IV"
            tone="violet"
          >
            A Claude Sonnet 5 agent forced to continuously try to prove a theorem with no internet search, but given access to Leak-I, Leak-II, and Leak-IV, invigilated by a seperate Leak-IV gate. This harness was designed specifically to test the benefit and reasoning impact of an upgraded pantograph service.
          </FeatureCard>

          <FeatureCard
            name="Leak Stronghold"
            badge="Agent · Have-based decomposition"
            tone="amber"
          >
            A family of Claude Sonnet 5 agent harnesses utilizing different strategies, but all attempting to construct a <a href="https://lean-lang.org/theorem_proving_in_lean4/tactics.html#more-tactics" target="_blank" rel="noopener noreferrer">have-based</a> proof skeleton for a theorem. Stronghold is significant because it performed highly efficiently in production, successfully proving the vast majority of the <Link href="/practice">CompeteMath practice problem roster</Link>.
          </FeatureCard>

          <FeatureCard
            name="Leak Ultra"
            badge="Agent · Blueprint Refinement"
            tone="amber"
          >
            A spin on the architecture from the <a href="https://arxiv.org/abs/2606.06468" target="_blank" rel="noopener noreferrer">goedel-architect prover</a>, making use of Leak-XI, Leak-XII, and Leak-XIV. While the underlying architecture is provably excellent, this harness is significant for demonstrating that the design actually performs <em>worse</em> when driven by a slower agentic loop, compared to other strategies such as Leak Control-II, in contrast to Goedel-Architect's performance when driver by a fast LLM such as Deepseek Flash V4, and compared to other LLM based pipelines.
          </FeatureCard>
        </div>
      </section>

      <section>
        <h2>The Leak Services (MCP Tooling)</h2>
        <p className="mt-3">
          The agent harnesses do not interact with Lean directly. They rely on specialized Model Context Protocol (MCP) services to navigate the library, manipulate proof states, and compile results.
        </p>

        <div className="mt-6 space-y-4">
          <FeatureCard name="Leak-I & Leak-XI" badge="Library Search" tone="slate">
            Lemma search over Mathlib. The agent describes the shape of the required theorem, and the service retrieves existing declarations so the prover builds on the library rather than reinventing it. (Leak-XI targets a newer toolchain than Leak-I).
          </FeatureCard>

          <FeatureCard name="Leak-II" badge="Proof-State Daemon" tone="slate">
            An interactive Lean proof-state daemon. The agent can open a goal, apply a tactic, and observe the resulting state difference before committing to a path—providing vital execution feedback.
          </FeatureCard>

          <FeatureCard name="Leak-XII" badge="Blueprint Compiler" tone="slate">
            A graph-based elaboration service used primarily by Ultra. It validates dependency graphs and elaborates individual declarations so the prover can verify exactly what a specific name means.
          </FeatureCard>

          <FeatureCard name="Leak-IV & Leak-XIV" badge="Verification Gates" tone="slate">
            The final compilation gates. These services compile the completed proof script against the Lean kernel. A proof is only accepted if it passes with zero warnings, ensuring unfinished proofs never slip through. (Leak-XIV targets a newer toolchain than Leak-IV).
          </FeatureCard>
        </div>
      </section>

      <section>
        <h2>Source &amp; Availability</h2>
        <p className="mt-3">
          To maintain a consolidated codebase and simplify deployments, the experimental pipelines and harnesses do not live in separate repositories. 
        </p>
        <p className="mt-3">
          The code for all five harnesses, along with their prompts and MCP tool configurations, is open-source and available directly within the main CompeteMath infrastructure repositories.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <a
            href={MAIN_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/20 no-underline"
          >
            <div className="flex items-center gap-3">
              <SiGithub className="h-5 w-5 text-white/70" />
              <div>
                <div className="text-sm font-semibold text-white">mikael-bashir/nextjs-ai-chatbot</div>
                <div className="text-xs text-white/50">Contains all Leak harnesses, prompts, and orchestration logic.</div>
              </div>
            </div>
            <span className="text-xs text-emerald-300/80 font-code">&rarr;</span>
          </a>

          <a
            href={SERVICES_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/20 no-underline"
          >
            <div className="flex items-center gap-3">
              <SiGithub className="h-5 w-5 text-white/70" />
              <div>
                <div className="text-sm font-semibold text-white">mikael-bashir/leak-services</div>
                <div className="text-xs text-white/50">Lean 4 MCP services, proof-state daemon, and search tooling.</div>
              </div>
            </div>
            <span className="text-xs text-emerald-300/80 font-code">&rarr;</span>
          </a>
        </div>
      </section>
    </InfoPage>
  );
}

const TONES: Record<string, string> = {
  emerald: "border-emerald-400/25 text-emerald-300/85",
  amber: "border-amber-400/25 text-amber-300/85",
  violet: "border-violet-400/25 text-violet-300/85",
  slate: "border-white/15 text-white/45",
  muted: "border-white/10 text-white/30",
};

// Renamed from Harness to FeatureCard so it works semantically for both sections
function FeatureCard({
  name,
  badge,
  tone,
  children,
}: {
  name: string;
  badge: string;
  tone: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/20">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-code text-base font-semibold text-white!">{name}</h3>
        <span
          className={`font-code rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
            TONES[tone] ?? TONES.slate
          }`}
        >
          {badge}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white/65 [&>a]:text-emerald-300/80 [&>a]:underline [&>a]:underline-offset-4 [&>a]:transition-colors hover:[&>a]:text-emerald-300">{children}</p>
    </div>
  );
}