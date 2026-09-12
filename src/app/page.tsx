'use client';

import { useEffect, useRef, useState, type ComponentType } from "react";
import HeroContent from "@/app/lib/components/landing/hero";
import { CONTACT_EMAIL, ORG_URL } from "@/app/lib/constants/site";

/**
 * Device gate for the shader film. Every check errs toward the static page —
 * the film is a desktop-only enhancement, never a requirement.
 */
function shaderEligible(): boolean {
  if (typeof window === "undefined") return false
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false
  // Touch-primary devices (phones, tablets) — regardless of viewport size.
  if (window.matchMedia("(pointer: coarse)").matches) return false
  if (window.innerWidth < 1024 || window.innerHeight < 600) return false
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean }; deviceMemory?: number }
  if (nav.userAgentData?.mobile === true) return false
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return false
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false
  if (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency < 4) return false
  // Real-GPU probe: failIfMajorPerformanceCaveat rejects software renderers.
  try {
    const c = document.createElement("canvas")
    const gl = c.getContext("webgl2", { failIfMajorPerformanceCaveat: true })
    if (!gl) return false
    gl.getExtension("WEBGL_lose_context")?.loseContext()
  } catch {
    return false
  }
  return true
}

export default function HomePage() {
  // Static initially (matches the server-rendered HTML, and is the final
  // answer for phones / weak GPUs / reduced-motion). The film module is
  // imported MANUALLY only after the gate passes — a conditional dynamic
  // import(), not next/dynamic, so ineligible devices never even fetch the
  // chunk. If the film aborts (watchdog), static is permanent for the session.
  const [Film, setFilm] = useState<ComponentType<{ onAbort: () => void }> | null>(null)
  const aborted = useRef(false)

  useEffect(() => {
    if (aborted.current || !shaderEligible()) return
    let cancelled = false
    import("@/app/lib/components/landing/equation-film").then((m) => {
      if (!cancelled && !aborted.current) setFilm(() => m.default)
    })
    return () => { cancelled = true }
  }, [])

  // Dev-contract parity for the static page (the film handles its own):
  // ?jump=<scrollY> must land instantly (atomix sets global smooth scroll).
  useEffect(() => {
    if (Film) return
    const jump = new URLSearchParams(window.location.search).get("jump")
    if (jump !== null) {
      history.scrollRestoration = "manual"
      window.scrollTo({ top: Number(jump) || 0, left: 0, behavior: "instant" })
    }
    ;(window as unknown as { __ready?: boolean }).__ready = true
  }, [Film])

  return (
    <div className="font-serif">
      {/* Film mode: the hero lives INSIDE the film's pinned stage (it is the
          film's opening frame, dissolving into the shader on scroll), so the
          film replaces both hero and sections. Static mode (server render,
          phones, weak GPUs): plain hero + plain sections, unchanged. */}
      {Film ? (
        <Film
          onAbort={() => {
            aborted.current = true
            setFilm(null)
          }}
        />
      ) : (
        <>
          {/* bg color = requested landing fallback; shows as the
              suspense fallback until the (large) art paints. */}
          <div className="relative h-screen w-full bg-[#12170d]">
            <HeroContent />
          </div>
          <StaticStories />
        </>
      )}
    </div>
  );
}

function StaticStories() {
  return (
    <div className="
      py-24 md:py-32
      bg-[#13170d]
      relative
      -mt-0.5 /* Your 1px line fix */
      overflow-hidden /* Good practice for alternating layouts */
    ">
      <div className="max-w-6xl mx-auto px-6 space-y-24 md:space-y-32">

        {/* Feature 1: Competition (Centered) */}
        <div className="flex flex-col items-center gap-12">
          <div className="flex-1 text-center">
            <div className="inline-flex items-center gap-3 mb-2">
              <p className="font-display text-4xl md:text-5xl font-bold text-white! text-center">
                Learn through <span className="italic">Competition</span>
              </p>
            </div>
            <p className="text-lg text-gray-300 mt-4 max-w-lg mx-auto">
              Race to be the first to solve a new practice problem, climb the global leaderboards, earn exclusive badges, and push yourself to share creative ways to solve community made problems. We learn by competing.
            </p>
          </div>
        </div>

        {/* Tenet 2: Empowering the ambitious */}
        <div className="flex flex-col items-center gap-12">
          <div className="flex-1 text-center">
            <div className="inline-flex items-center gap-3 mb-2">
              <p className="font-display text-4xl md:text-5xl font-bold text-white! text-center">
                Empowering the <span className="italic">ambitious</span>
              </p>
            </div>
            <p className="text-lg text-gray-300 mt-4 max-w-xl mx-auto">
              All of our services aim to solve real problems in the real world. Part of the reason CompeteMath was even created was with frustrations towards the cost of entry to do something that is genuinely meaningful and challenging at the same time. We welcome <em>anyone</em> who feels the same way to get involved, however they feel like doing so — beginner, expert, or anything in between. We promise to never intentionally remove credits to your contributions; drop a pull request to improve one of our current{" "}
              <a href={ORG_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4 decoration-amber-200/50 text-amber-200/90 hover:text-amber-100">open-source projects</a>{" "}
              today, or <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 decoration-amber-200/50 text-amber-200/90 hover:text-amber-100">get in touch</a>.
            </p>
          </div>
        </div>

        {/* Tenet 3: Sharing useful knowledge */}
        <div className="flex flex-col items-center gap-12">
          <div className="flex-1 text-center">
            <div className="inline-flex items-center gap-3 mb-2">
              <p className="font-display text-4xl md:text-5xl font-bold text-white! text-center">
                Sharing useful <span className="italic">knowledge</span>
              </p>
            </div>
            <p className="text-lg text-gray-300 mt-4 max-w-xl mx-auto">
              We are grateful that you chose to use our services — if we have helped you to learn or do something useful, that means more than the world to us. This is the sole purpose of CompeteMath, and we intend to keep our services free forever. The beneficial things that we taught others will long outlive us.
            </p>
          </div>
        </div>

        {/* Tenet 4: Relentless passion */}
        <div className="flex flex-col items-center gap-12">
          <div className="flex-1 text-center">
            <div className="inline-flex items-center gap-3 mb-2">
              <p className="font-display text-4xl md:text-5xl font-bold text-white! text-center">
                Relentless <span className="italic">passion</span>
              </p>
            </div>
            <p className="text-lg text-gray-300 mt-4 max-w-xl mx-auto">
              We value the impact of our work to even one person. Nothing great was ever built through excuses — we work unreasonably hard with layered tests and incessant resourcefulness, to ensure our services are the best they can be, making use of a mixture of autonomous and HITL systems.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
