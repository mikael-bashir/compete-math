import Link from "next/link"
import { HeroSection } from "../lib/components/home/hero-section"
import { WeeklyProblem } from "../lib/components/home/weekly-problem"
import { Leaderboard } from "../lib/components/home/leaderboard"
import { StaticArtBackground } from "../lib/components/home/static-art-background"
import { ArrowRight } from "lucide-react"

const QUICK_LINKS = [
  {
    href: "/practice",
    index: "01",
    title: "Training Grounds",
    text: "Generated problems by concept — filter, grind, repeat.",
  },
  {
    href: "/community",
    index: "02",
    title: "Problem Forge",
    text: "Draft problems for the community and battle over solutions.",
  },
  {
    href: "/global",
    index: "03",
    title: "Leaderboard",
    text: "See this week's fastest solvers and climb the ranks.",
  },
]

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <StaticArtBackground />
      <div className="relative z-10">
        <main className="container mx-auto px-4 py-8">
          <HeroSection />

          <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="w-full min-w-0 lg:w-3/5">
              <WeeklyProblem />
            </div>
            <div className="w-full min-w-0 lg:w-2/5">
              <Leaderboard />
            </div>
          </div>

          {/* Quick navigation — console-menu style */}
          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#141013]/92 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] divide-y divide-white/[0.06] mb-10 overflow-hidden">
            {QUICK_LINKS.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="group flex items-center gap-5 px-6 md:px-8 py-5 no-underline transition-colors hover:bg-rose-400/[0.04]"
              >
                <span className="font-code text-xs text-rose-300/60 tabular-nums shrink-0">
                  {q.index}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="font-code block text-sm font-semibold text-white! group-hover:text-rose-100! transition-colors">
                    {q.title}
                  </span>
                  <span className="block text-xs text-white/40 mt-0.5 truncate">
                    {q.text}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 shrink-0 text-white/25 transition-all group-hover:text-rose-200 group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
