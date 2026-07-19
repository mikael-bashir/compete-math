'use client';

import { useEffect, useRef, useState, type ComponentType } from "react";
import HeroContent from "@/app/lib/components/landing/hero";

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
              Work through a bottomless pool of fresh problems, climb the global leaderboards, earn exclusive badges, and prove your skills in officially hosted competitions. Every solve pushes you up the ranks.
            </p>
          </div>
        </div>

        {/* Feature 2: Practice — never stay stuck (insight + Lean proof) */}
        <div className="flex flex-col items-center gap-12">
          <div className="flex-1 text-center">
            <div className="inline-flex items-center gap-3 mb-2">
              <p className="font-display text-4xl md:text-5xl font-bold text-white! text-center">
                Never stay <span className="italic">stuck</span>
              </p>
            </div>
            <p className="text-lg text-gray-300 mt-4 max-w-xl mx-auto">
              Doubt a problem? You&rsquo;re never left guessing. After a few honest attempts, every practice problem reveals its{" "}
              <span className="text-amber-200/90">key insight</span> — the core idea behind the answer — backed by a{" "}
              <span className="text-amber-200/90">machine-checked formal proof in Lean&nbsp;4</span> you can open, copy, and verify yourself. No hand-waving, no &ldquo;trust me.&rdquo;
            </p>
          </div>
        </div>

        {/* Feature 3: Community (discussion / contest answers) */}
        <div className="flex flex-col items-center gap-12">
          <div className="flex-1 text-center">
            <div className="inline-flex items-center gap-3 mb-2">
              <p className="font-display text-4xl md:text-5xl font-bold text-white! text-center">
                Grow with the Community
              </p>
            </div>
            <p className="text-lg text-gray-300 mt-4 max-w-xl mx-auto">
              It&rsquo;s not just about winning. Submit your own challenges, and on every community problem join an open{" "}
              <span className="text-amber-200/90">discussion</span> to contest an answer, suggest a sharper solution, and compare methods with solvers who see the problem differently.
            </p>
          </div>
        </div>

        {/* Feature 4: Quality you can trust (admin review + formal verification) */}
        <div className="flex flex-col items-center gap-12">
          <div className="flex-1 text-center">
            <div className="inline-flex items-center gap-3 mb-2">
              <p className="font-display text-4xl md:text-5xl font-bold text-white! text-center">
                Quality you can <span className="italic">trust</span>
              </p>
            </div>
            <p className="text-lg text-gray-300 mt-4 max-w-xl mx-auto">
              Nothing goes live unchecked. Every question is reviewed by an admin for quality and correctness before it reaches you, and its answer is enforced by a formal Lean&nbsp;4 certificate — so the problems you train on are the real deal.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
