import { HeroSection } from "../lib/components/home/hero-section"
import { WeeklyProblem } from "../lib/components/home/weekly-problem"
import { Leaderboard } from "../lib/components/home/leaderboard"
import { GlimmeringMapBackground } from "../lib/components/home/glimmering-map-background"

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <GlimmeringMapBackground />
      <div className="relative z-10">
        <main className="container mx-auto px-4 py-8">
          <HeroSection />
          
          {/* Changed from Grid to Flex */}
          <div className="mt-12 flex flex-col gap-8 lg:flex-row lg:items-start">
            
            {/* Left Column: 
               - w-full: takes full width on mobile
               - lg:w-3/5: takes 60% on desktop (mimics col-span-3)
               - min-w-0: allows flex child to shrink below content size (prevents overflow)
            */}
            <div className="w-full min-w-0 lg:w-3/5">
              <WeeklyProblem />
            </div>
            
            {/* Right Column:
               - w-full: takes full width on mobile
               - lg:w-2/5: takes 40% on desktop (mimics col-span-2)
            */}
            <div className="w-full min-w-0 lg:w-2/5">
              <Leaderboard />
            </div>
            
          </div>
        </main>
      </div>
    </div>
  )
}