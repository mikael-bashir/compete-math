'use client';

import ProofFilm from "@/app/lib/components/landing/proof-film"

const FEATURES = [
  {
    kicker: "// competition",
    title: (
      <>
        Learn through <span className="italic">competition</span>
      </>
    ),
    body: "Work through a bottomless pool of fresh problems, climb the global leaderboards, earn exclusive badges, and prove your skills in officially hosted competitions. Every solve pushes you up the ranks.",
  },
  {
    kicker: "// practice",
    title: (
      <>
        Never stay <span className="italic">stuck</span>
      </>
    ),
    body: (
      <>
        Doubt a problem? You&rsquo;re never left guessing. After a few honest attempts, every practice problem reveals its{" "}
        <span className="text-amber-200/90">key insight</span> — the core idea behind the answer — backed by a{" "}
        <span className="text-amber-200/90">machine-checked formal proof in Lean&nbsp;4</span> you can open, copy, and verify yourself. No hand-waving, no &ldquo;trust me.&rdquo;
      </>
    ),
  },
  {
    kicker: "// community",
    title: "Grow with the community",
    body: (
      <>
        It&rsquo;s not just about winning. Submit your own challenges, and on every community problem join an open{" "}
        <span className="text-amber-200/90">discussion</span> to contest an answer, suggest a sharper solution, and compare methods with solvers who see the problem differently.
      </>
    ),
  },
  {
    kicker: "// quality",
    title: (
      <>
        Quality you can <span className="italic">trust</span>
      </>
    ),
    body: "Nothing goes live unchecked. Every question is reviewed by an admin for quality and correctness before it reaches you, and its answer is enforced by a formal Lean 4 certificate — so the problems you train on are the real deal.",
  },
]

export default function HomePage() {
  return (
    <div className="font-serif">
      <ProofFilm />

      {/* After-film content — opens on the exact colour the film settles on. */}
      <div className="py-24 md:py-32 bg-[#13170d] relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 space-y-20 md:space-y-28">
          {FEATURES.map((f, i) => (
            <div key={i} className="text-center">
              <p className="font-code text-amber-300/70 text-xs tracking-[0.25em] uppercase mb-3">
                {f.kicker}
              </p>
              <p className="font-display text-4xl md:text-5xl font-bold text-white! text-center">
                {f.title}
              </p>
              <div className="mt-6 mx-auto h-px w-16 bg-linear-to-r from-transparent via-amber-300/40 to-transparent" />
              <p className="text-lg text-gray-300 mt-6 max-w-xl mx-auto">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
