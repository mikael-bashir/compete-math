export const CHAPTER_LABELS = ["compete", "insight", "community", "trust"] as const

export type Beat = {
  in: number
  peak: number
  hold: number // full-opacity plateau: the copy RESTS from peak to here
  out: number // > 1.5 means the beat holds to the end of the film (finale)
  kicker: string
  title: React.ReactNode
  body: React.ReactNode
  lean?: string
  cta?: boolean // render the Start-solving call to action (finale beat)
}

// The four stories — same copy as the static sections this film replaces.
// Timings are in STORY progress (post-hero).
export const BEATS: Beat[] = [
  {
    in: 0.13, peak: 0.17, hold: 0.27, out: 0.315,
    kicker: "// competition",
    title: (
      <>Learn through <span className="italic">Competition</span></>
    ),
    body: "Work through a bottomless pool of fresh problems, climb the global leaderboards, earn exclusive badges, and prove your skills in officially hosted competitions. Every solve pushes you up the ranks.",
  },
  {
    in: 0.43, peak: 0.465, hold: 0.545, out: 0.585,
    kicker: "// practice",
    title: (
      <>Never stay <span className="italic">stuck</span></>
    ),
    body: (
      <>
        After a few honest attempts, every practice problem reveals its{" "}
        <span className="text-amber-200/90">key insight</span> — backed by a{" "}
        <span className="text-amber-200/90">machine-checked formal proof in Lean&nbsp;4</span>{" "}
        you can open, copy, and verify yourself. No hand-waving, no &ldquo;trust me.&rdquo;
      </>
    ),
    lean: `theorem am_gm (a b : ℝ) :\n    a * b ≤ ((a + b) / 2) ^ 2 := by\n  nlinarith [sq_nonneg (a - b)]`,
  },
  {
    in: 0.63, peak: 0.665, hold: 0.755, out: 0.80,
    kicker: "// community",
    title: "Grow with the Community",
    body: (
      <>
        Submit your own challenges, and on every community problem join an open{" "}
        <span className="text-amber-200/90">discussion</span> to contest an answer, suggest a
        sharper solution, and compare methods with solvers who see the problem differently.
      </>
    ),
  },
  {
    in: 0.88, peak: 0.93, hold: 2, out: 2, cta: true,
    kicker: "// quality",
    title: (
      <>Quality you can <span className="italic">trust</span></>
    ),
    body: (
      <>
        Nothing goes live unchecked. Every question is reviewed for quality and correctness
        before it reaches you, and its answer is enforced by a formal Lean&nbsp;4 certificate —
        so the problems you train on are the real deal.
      </>
    ),
  },
]
