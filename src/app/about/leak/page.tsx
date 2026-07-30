import type { Metadata } from "next";
import Link from "next/link";
import { SiGithub } from "react-icons/si";
import { InfoPage } from "../../lib/components/info-page";

export const metadata: Metadata = {
  title: "What is Leak?",
  description:
    "The Lean 4 proving engine behind CompeteMath's verified problems — four prover families and the services they run on.",
};

// PLACEHOLDER repository links. The repos are not published yet; these are
// dummies so the page renders with working markup. Kept in one block so there
// is exactly one place to edit when the real URLs exist.
const REPO = {
  river: "https://github.com/mikael-bashir/leak-river",
  stronghold: "https://github.com/mikael-bashir/leak-stronghold",
  ultra: "https://github.com/mikael-bashir/leak-ultra",
  finality: "https://github.com/mikael-bashir/leak-finality",
  leakI: "https://github.com/mikael-bashir/leak-i",
  leakII: "https://github.com/mikael-bashir/leak-ii",
  leakIII: "https://github.com/mikael-bashir/leak-iii",
  leakIV: "https://github.com/mikael-bashir/leak-iv",
};

export default function AboutLeakPage() {
  return (
    <InfoPage kicker="leak" title="What is Leak?">
      <section>
        <p>
          Leak is the proving engine behind CompeteMath. When a problem here is
          marked verified, a Leak prover wrote a proof in{" "}
          <a href="https://lean-lang.org" target="_blank" rel="noreferrer">
            Lean&nbsp;4
          </a>{" "}
          and the Lean kernel checked it — the claim is machine-checked, not
          eyeballed. See <Link href="/about">About</Link> for the wider project.
        </p>
        <p className="mt-4">
          Leak is not one program. It is four families of prover, each attacking
          a proof a different way, plus a small set of services they all share.
        </p>
      </section>

      <section>
        <h2>The four prover families</h2>
        <p className="mt-3">
          They differ in how much compute they are willing to spend and in how
          they break a hard theorem into pieces it can actually close.
        </p>

        <div className="mt-6 space-y-4">
          <Family
            name="Leak River"
            badge="Open source · light"
            tone="emerald"
            href={REPO.river}
          >
            The lightweight member of the family. River goes at a problem
            directly and cheaply, which makes it the right first attempt on
            anything that is not deeply hard — and a fast baseline to measure
            the heavier provers against.
          </Family>

          <Family
            name="Leak Stronghold"
            badge="Partially closed · heavy"
            tone="amber"
            href={REPO.stronghold}
          >
            A heavy recursive decomposer. Stronghold splits a theorem into
            sub-goals, then splits the sub-goals that resist, recursing until
            the pieces are small enough to close outright and reassembling the
            proof on the way back up.
          </Family>

          <Family
            name="Leak Ultra"
            badge="Partially closed · heavy"
            tone="amber"
            href={REPO.ultra}
          >
            A heavy DAG-refinement loop. Ultra lays the argument out as a
            dependency graph of lemmas and repeatedly refines that graph in
            light of what the last pass proved and what it got stuck on, rather
            than committing to one decomposition up front.
          </Family>

          <Family
            name="Leak Finality"
            badge="Partially closed · heavy · most advanced"
            tone="violet"
            href={REPO.finality}
          >
            Our most advanced prover, and a hybrid of the two above. Finality
            takes Stronghold&rsquo;s decomposition and Ultra&rsquo;s refinement
            loop and runs them together, so it can keep breaking a goal down{" "}
            <strong>and</strong> redesign the whole plan when the evidence says
            the plan is wrong. The result adapts to a problem far better than
            either parent does alone.
          </Family>
        </div>
      </section>

      <section>
        <h2>Why three of them are &ldquo;partially closed&rdquo;</h2>
        <p className="mt-3">
          Stronghold, Ultra and Finality drive Anthropic&rsquo;s Claude models
          as their reasoning core. Everything we write — the orchestration, the
          decomposition, the refinement, the verification gates — is open, but
          the model at the centre is not ours to open. So those three are open
          source in the parts we own and closed in the part we do not, and we
          would rather say that plainly than call them something they are not.
        </p>
      </section>

      <section>
        <h2>The Leak services</h2>
        <p className="mt-3">
          Every prover talks to the same set of MCP services. The deployments
          are private — they are ours, and they cost real compute to run — but
          the source is open, so you can read exactly what a prover is allowed
          to ask for and what it gets back.
        </p>

        <div className="mt-6 space-y-4">
          <Family name="Leak I" badge="Search" tone="slate" href={REPO.leakI}>
            Lemma search over Mathlib. A prover describes the shape of the
            result it needs and Leak&nbsp;I finds what already exists, so it
            builds on the library instead of reinventing it.
          </Family>

          <Family name="Leak II" badge="Proof state" tone="slate" href={REPO.leakII}>
            An interactive Lean proof-state daemon. A prover can open a goal,
            apply one tactic, and look at what it did — the difference between
            reasoning about a proof and actually stepping through it.
          </Family>

          <Family name="Leak III" badge="Retired" tone="muted" href={REPO.leakIII}>
            No longer in service. It is listed here for provenance: the
            repository stays public so the history of how the stack got to its
            current shape is not quietly erased.
          </Family>

          <Family name="Leak IV" badge="Verification" tone="slate" href={REPO.leakIV}>
            The gate. Leak&nbsp;IV compiles a complete proof script against
            Lean&nbsp;4 and Mathlib and reports exactly what the kernel says. A
            proof only counts as proved once this service accepts it — and it
            rejects on warnings too, so an unfinished proof can never pass as a
            finished one.
          </Family>
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

// One prover family or service: name, a short status badge, the pitch, and a
// link to its repository.
function Family({
  name,
  badge,
  tone,
  href,
  children,
}: {
  name: string;
  badge: string;
  tone: keyof typeof TONES | string;
  href: string;
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

      <p className="mt-3 text-sm leading-relaxed text-white/65">{children}</p>

      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-code mt-4 inline-flex items-center gap-2 text-xs text-white/40! hover:text-emerald-300! transition-colors no-underline"
      >
        <SiGithub className="h-3.5 w-3.5" />
        View repository
      </a>
    </div>
  );
}
