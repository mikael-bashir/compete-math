import { CONTACT_EMAIL, ORG_URL } from "@/app/lib/constants/site"

export const CHAPTER_LABELS = ["compete", "ambition", "knowledge", "passion"] as const

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

const linkClass = "underline underline-offset-4 decoration-amber-200/50 text-amber-200/90 hover:text-amber-100"

// The four tenets — same copy as the static sections this film replaces.
// Timings are in STORY progress (post-hero).
export const BEATS: Beat[] = [
  {
    in: 0.13, peak: 0.17, hold: 0.27, out: 0.315,
    kicker: "// competition",
    title: (
      <>Learn through <span className="italic">Competition</span></>
    ),
    body: "Race to be the first to solve a new practice problem, climb the global leaderboards, earn exclusive badges, and push yourself to share creative ways to solve community made problems. We learn by competing.",
  },
  {
    in: 0.43, peak: 0.465, hold: 0.545, out: 0.585,
    kicker: "// ambition",
    title: (
      <>Empowering the <span className="italic">ambitious</span></>
    ),
    body: (
      <>
        All of our services aim to solve real problems in the real world. Part of the reason
        CompeteMath was even created was with frustrations towards the cost of entry to do
        something that is genuinely meaningful and challenging at the same time. We welcome{" "}
        <em>anyone</em> who feels the same way to get involved, however they feel like doing so
        — beginner, expert, or anything in between. We promise to never intentionally remove
        credits to your contributions; drop a pull request to improve one of our current{" "}
        <a href={ORG_URL} target="_blank" rel="noreferrer" className={linkClass}>open-source projects</a>{" "}
        today, or <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>get in touch</a>.
      </>
    ),
  },
  {
    in: 0.63, peak: 0.665, hold: 0.755, out: 0.80,
    kicker: "// knowledge",
    title: (
      <>Sharing useful <span className="italic">knowledge</span></>
    ),
    body: "We are grateful that you chose to use our services — if we have helped you to learn or do something useful, that means more than the world to us. This is the sole purpose of CompeteMath, and we intend to keep our services free forever. The beneficial things that we taught others will long outlive us.",
  },
  {
    in: 0.88, peak: 0.93, hold: 2, out: 2, cta: true,
    kicker: "// passion",
    title: (
      <>Relentless <span className="italic">passion</span></>
    ),
    body: "We value the impact of our work to even one person. Nothing great was ever built through excuses — we work unreasonably hard with layered tests and incessant resourcefulness, to ensure our services are the best they can be, making use of a mixture of autonomous and HITL systems.",
  },
]
