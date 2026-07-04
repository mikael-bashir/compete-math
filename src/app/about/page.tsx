import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "../lib/components/info-page";

export const metadata: Metadata = {
  title: "About",
  description: "What CompeteMath is, and why it exists.",
};

export default function AboutPage() {
  return (
    <InfoPage kicker="about" title="Built for the love of the game">
      <section>
        <h2>What is CompeteMath?</h2>
        <p className="mt-3">
          CompeteMath is a competitive mathematics arena. Every week a fresh problem
          drops, the leaderboard resets its rhythm, and solvers from around the world
          race to find the key insight. No ads, no fluff — just problems worth your
          time.
        </p>
      </section>

      <section>
        <h2>How it works</h2>
        <p className="mt-3">
          <strong>Weekly problems</strong> arrive every Friday. Solve them for points,
          climb the <Link href="/global">leaderboard</Link>, and keep your streak
          alive. Between drops, the <Link href="/practice">Training Grounds</Link>{" "}
          hold a growing pool of generated problems sorted by concept, and the{" "}
          <Link href="/community">Problem Forge</Link> lets you draft problems of your
          own for the community to battle over.
        </p>
      </section>

      <section>
        <h2>Verified by Lean 4</h2>
        <p className="mt-3">
          Where possible, our problems and solutions are formally verified with the{" "}
          <a href="https://lean-lang.org" target="_blank" rel="noreferrer">Lean 4</a>{" "}
          proof assistant against Mathlib. When we say an answer is correct, we mean
          a computer checked the proof — not that someone eyeballed it.
        </p>
      </section>

      <section>
        <h2>Who builds this</h2>
        <p className="mt-3">
          CompeteMath is an independent project built by a small team that believes
          competition is the fastest way to fall in love with mathematics. Want to
          help? See <Link href="/contribute">Contribute</Link>.
        </p>
      </section>
    </InfoPage>
  );
}
