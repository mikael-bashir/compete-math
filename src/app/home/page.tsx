import Link from "next/link"
import { HeroSection } from "../lib/components/home/hero-section"
import { WeeklyProblem } from "../lib/components/home/weekly-problem"
import { Leaderboard } from "../lib/components/home/leaderboard"
import { StaticArtBackground } from "../lib/components/home/static-art-background"
import { Swords, MessagesSquare, Archive } from "lucide-react"

const QUICK_LINKS = [
  {
    href: "/practice",
    icon: Swords,
    title: "Training Grounds",
    text: "Generated problems by topic — filter, grind, repeat.",
  },
  {
    href: "/community",
    icon: MessagesSquare,
    title: "Problem Forge",
    text: "Draft problems for the community and battle over solutions.",
  },
  {
    href: "/archives",
    icon: Archive,
    title: "Archives",
    text: "Every past weekly problem, ready to be conquered.",
  },
]

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <StaticArtBackground />
      <div className="relative z-10">
        <main className="container mx-auto px-4 py-8">
          <HeroSection />

          <div className="mt-12 flex flex-col gap-8 lg:flex-row lg:items-start">
            <div className="w-full min-w-0 lg:w-3/5">
              <WeeklyProblem />
            </div>
            <div className="w-full min-w-0 lg:w-2/5">
              <Leaderboard />
            </div>
          </div>

          {/* Quick navigation cards */}
          <div className="mt-10 grid gap-4 sm:grid-cols-3 pb-8">
            {QUICK_LINKS.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="group rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-5 hover:border-emerald-400/40 transition-all hover:shadow-[0_8px_40px_rgba(16,185,129,0.12)] no-underline"
              >
                <q.icon className="w-5 h-5 text-emerald-400/80 mb-3 transition-transform group-hover:scale-110" />
                <h3 className="font-code text-sm font-semibold text-white group-hover:text-emerald-200 transition-colors">
                  {q.title}
                </h3>
                <p className="text-white/45 text-xs mt-1.5 leading-relaxed">{q.text}</p>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
