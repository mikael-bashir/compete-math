import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "../lib/components/info-page";
import { ORG_URL } from "../lib/constants/site";

export const metadata: Metadata = {
  title: "Contribute",
  description: "Help build CompeteMath — problems, proofs and code.",
};

export default function ContributePage() {
  return (
    <InfoPage kicker="contribute" title="Leave your mark on the library">
      <section>
        <h2>Forge problems</h2>
        <p className="mt-3">
          The fastest way to contribute is to write problems. Open the{" "}
          <Link href="/community">Problem Forge</Link>, hit “Draft a Problem”, and
          write your problem with full Markdown + LaTeX support. Preview it, submit
          it, and an admin will review it for the public arena. Great problems have a
          single crisp insight at their core.
        </p>
      </section>

      <section>
        <h2>Formalise with Lean 4</h2>
        <p className="mt-3">
          We formally verify answers to problems using{" "}
          <a href="https://lean-lang.org" target="_blank" rel="noreferrer">Lean 4</a>,{" "}
          <a href="https://github.com/leanprover-community/mathlib4" target="_blank" rel="noreferrer">Mathlib</a>, and{" "}
          <a href="https://github.com/competemath/tengoku" target="_blank" rel="noreferrer">Tengoku</a>.
          If you can produce high-quality Lean 4 proofs, think you can make an
          improvement to our services, or are genuinely curious about something and
          just want to talk, these are the most valuable contribution of all. Visit
          our{" "}
          <a href={ORG_URL} target="_blank" rel="noreferrer">public organisation repository</a>{" "}
          to see what we are currently working on, or contact me directly using the
          mail icon in the footer.
        </p>
      </section>

      <section>
        <h2>Spread the word</h2>
        <p className="mt-3">
          Communities thrive on people. Share a problem that stumped you, drag a
          friend onto the leaderboard, or start a rivalry. CompeteMath is better
          with you in it.
        </p>
      </section>
    </InfoPage>
  );
}
