import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "../lib/components/info-page";
import { GITHUB_URL, CONTACT_EMAIL } from "../lib/constants/site";

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
          We formally verify problems and solutions using{" "}
          <a href="https://lean-lang.org" target="_blank" rel="noreferrer">Lean 4</a>{" "}
          and Mathlib. If you can write Lean proofs — or want to learn — this is the
          most valuable contribution of all. Reach out at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we'll get you
          set up with the verification pipeline.
        </p>
      </section>

      <section>
        <h2>Hack on the platform</h2>
        <p className="mt-3">
          CompeteMath is an evolving codebase — find it on{" "}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>. Issues,
          bug reports and pull requests are all welcome, from typo fixes to whole
          features.
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
