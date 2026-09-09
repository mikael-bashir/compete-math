'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { Heart } from "lucide-react"

import { HOME_HREF, HOME_DROPDOWN, RESEARCH_DROPDOWN, DONATE_URL } from "../../constants/site"

// A 90° "V" (down-chevron) that carries the amber shine and flips orientation
// when its target is open. Used for the Home/Research dropdown triggers (desktop
// hover, mobile tap) and the mobile navbar toggle.
function VArrow({ open, className = "h-5 w-5" }: { open: boolean; className?: string }) {
  const raw = useId()
  const gid = "v-" + raw.replace(/:/g, "")
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} transition-transform duration-300 ${open ? "rotate-180" : ""}`}
      fill="none"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ filter: "drop-shadow(0 0 4px rgba(251,191,36,0.5))" }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="50%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* vertex at (12,15.5); the two arms are perpendicular → a 90° V */}
      <path d="M6 9.5 L12 15.5 L18 9.5" stroke={`url(#${gid})`} />
    </svg>
  )
}

// Underline, not glow: the only visual cue for "you are on this page (or one
// of this menu's pages)". No background pill, no inset shadow — just the
// label gaining an amber underline, scoped to the label text itself so it
// never draws under a trigger's arrow icon too.
const ACTIVE_UNDERLINE = "underline decoration-amber-400/70 underline-offset-4"

type DropdownLink = { label: string; href: string }

/**
 * Tier 2 of the navigation: Home (a real link, hover-reveals a dropdown of
 * Community/Practice/Leaderboard), Research (no page of its own — purely a
 * hover-dropdown onto Leak/LRR/Blog), and a standalone Donate button.
 *
 * Desktop: hover opens a floating panel under the trigger. Mobile has no
 * hover, so Home splits into a label (navigates to /home) + a separate arrow
 * tap-target (reveals the sub-list); Research's whole row is one tap-target
 * since it has nowhere of its own to navigate to.
 */
export default function Navbar() {
  const pathname = usePathname()

  const [navOpen, setNavOpen] = useState(false)
  const [homeOpen, setHomeOpen] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)

  // Collapse everything whenever the route changes.
  useEffect(() => {
    setNavOpen(false)
    setHomeOpen(false)
    setResearchOpen(false)
  }, [pathname])

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")
  const isAnyActive = (hrefs: readonly string[]) => hrefs.some(isActive)

  // Home is "on" for its own page AND every page its dropdown leads to;
  // Research has no page of its own, so it is only ever "on" via its dropdown.
  const homeActive = isAnyActive([HOME_HREF, ...HOME_DROPDOWN.map((l) => l.href)])
  const researchActive = isAnyActive(RESEARCH_DROPDOWN.map((l) => l.href))

  // Grace-period close, factored once and used for both triggers: crossing the
  // gap between a trigger and the panel below it must not slam the menu shut,
  // and a quick flick across the bar must not leave two panels open at once.
  const homeCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const researchCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function hoverHandlers(setOpen: (v: boolean) => void, timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) {
    const clear = () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
    return {
      onMouseEnter: () => { clear(); setOpen(true) },
      onMouseLeave: () => { clear(); timer.current = setTimeout(() => setOpen(false), 150) },
      // Keyboard parity: focusing anything inside the trigger's container opens
      // it; focus leaving the container (not just the trigger itself) closes
      // it, so tabbing from the trigger into its own dropdown items is fine.
      onFocus: () => { clear(); setOpen(true) },
      onBlur: (e: React.FocusEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
      },
    }
  }
  const homeHover = hoverHandlers(setHomeOpen, homeCloseTimer)
  const researchHover = hoverHandlers(setResearchOpen, researchCloseTimer)

  // Shared link styling: colour + hover feedback only. Underline (active) is
  // layered on separately so it can be scoped to just a label span when the
  // trigger also carries an arrow icon.
  const linkBase = "font-code text-[12.5px] px-3 py-1 rounded-md transition-colors duration-200"
  const linkCls = (active: boolean) =>
    `${linkBase} ${active ? "text-amber-200" : "text-white/60 hover:text-white hover:bg-white/5"}`

  // The floating panel shared by both desktop dropdowns. No backdrop-filter —
  // same reasoning as the rest of this file: avoid re-blurring the large fixed
  // page background every frame. Wrapped in a padded-top spacer so the mouse
  // never leaves the hoverable region while crossing from trigger to panel.
  function DesktopPanel({ links }: { links: readonly DropdownLink[] }) {
    return (
      <div className="absolute left-1/2 -translate-x-1/2 top-full pt-1.5 z-50">
        <div className="min-w-[9.5rem] rounded-lg border border-white/10 bg-[#0a0f14]/95 shadow-lg shadow-black/40 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {links.map((l) => {
            const active = isActive(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`block px-3.5 py-1.5 text-[12.5px] font-code transition-colors ${
                  active ? "text-amber-200" : "text-white/65 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className={active ? ACTIVE_UNDERLINE : undefined}>{l.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    // Mobile surface: translucent (no backdrop-filter, same reasoning as the
    // navstrip) — /45 continues the strip gradient's bottom stop so the two
    // tiers read as one; deepens while the menu is open so links stay legible.
    <div
      className={`border-t border-white/[0.05] md:bg-transparent transition-colors duration-300 ${
        navOpen ? "bg-[#0a0f14]/85" : "bg-[#0a0f14]/45"
      }`}
    >

      {/* ==================== DESKTOP ==================== */}
      <div className="hidden md:block">
        <div className="flex items-center justify-center gap-1 py-1">

          {/* Home — a real link, plus a hover dropdown onto everything else */}
          <div className="relative" {...homeHover}>
            <Link href={HOME_HREF} className={`${linkCls(homeActive)} inline-flex items-center gap-1`}>
              <span className={homeActive ? ACTIVE_UNDERLINE : undefined}>Home</span>
              <VArrow open={homeOpen} className="h-3 w-3" />
            </Link>
            {homeOpen && <DesktopPanel links={HOME_DROPDOWN} />}
          </div>

          {/* Research — no page of its own, purely a menu */}
          <div className="relative" {...researchHover}>
            <a
              role="button"
              tabIndex={0}
              onClick={() => setResearchOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setResearchOpen((o) => !o)
                }
              }}
              className={`${linkCls(researchActive)} inline-flex items-center gap-1 cursor-pointer select-none outline-none no-underline`}
            >
              <span className={researchActive ? ACTIVE_UNDERLINE : undefined}>Research</span>
              <VArrow open={researchOpen} className="h-3 w-3" />
            </a>
            {researchOpen && <DesktopPanel links={RESEARCH_DROPDOWN} />}
          </div>

          {/* Donate — a standalone action, not a page link */}
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noreferrer"
            className="font-code text-[12.5px] px-3 py-1 ml-1 rounded-md inline-flex items-center gap-1.5 border border-amber-300/40 text-amber-200 hover:bg-amber-400/10 transition-colors no-underline"
          >
            <Heart className="h-3 w-3" />
            Donate
          </a>
        </div>
      </div>

      {/* ==================== MOBILE ==================== */}
      <div className="md:hidden">
        {/* the toggle V, dead centre of the navbar */}
        <div className="flex justify-center py-1.5">
          <button
            type="button"
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Toggle navigation"
            aria-expanded={navOpen}
            className="inline-flex items-center justify-center h-7 w-12 rounded-md hover:bg-white/5 transition-colors outline-none"
          >
            <VArrow open={navOpen} className="h-5 w-5" />
          </button>
        </div>

        {/* popped-up column */}
        {navOpen && (
          <div className="flex flex-col items-stretch px-4 pb-3 gap-0.5 animate-in fade-in slide-in-from-top-1 duration-200">

            {/* Home: the label navigates; the arrow (a separate tap target)
                reveals the sub-list without leaving the page — touch has no
                hover, so Home's two behaviours need two targets. */}
            <div className="flex items-stretch gap-0.5">
              <Link href={HOME_HREF} className={`${linkCls(homeActive)} flex-1 text-center`}>
                <span className={homeActive ? ACTIVE_UNDERLINE : undefined}>Home</span>
              </Link>
              <button
                type="button"
                onClick={() => setHomeOpen((o) => !o)}
                aria-label="Toggle Home menu"
                aria-expanded={homeOpen}
                className={`${linkCls(false)} px-3 inline-flex items-center justify-center outline-none`}
              >
                <VArrow open={homeOpen} className="h-3.5 w-3.5" />
              </button>
            </div>
            {homeOpen && (
              <div className="flex flex-col items-stretch gap-0.5 pb-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {HOME_DROPDOWN.map((l) => {
                  const active = isActive(l.href)
                  return (
                    <Link key={l.href} href={l.href} className={`${linkCls(active)} text-center text-[11.5px]`}>
                      <span className={active ? ACTIVE_UNDERLINE : undefined}>{l.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Research: no page of its own, so the whole row just toggles */}
            <a
              role="button"
              tabIndex={0}
              onClick={() => setResearchOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setResearchOpen((o) => !o)
                }
              }}
              className={`${linkCls(researchActive)} flex items-center justify-center gap-1 cursor-pointer select-none outline-none no-underline`}
            >
              <span className={researchActive ? ACTIVE_UNDERLINE : undefined}>Research</span>
              <VArrow open={researchOpen} className="h-3.5 w-3.5" />
            </a>
            {researchOpen && (
              <div className="flex flex-col items-stretch gap-0.5 pb-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {RESEARCH_DROPDOWN.map((l) => {
                  const active = isActive(l.href)
                  return (
                    <Link key={l.href} href={l.href} className={`${linkCls(active)} text-center text-[11.5px]`}>
                      <span className={active ? ACTIVE_UNDERLINE : undefined}>{l.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Donate */}
            <a
              href={DONATE_URL}
              target="_blank"
              rel="noreferrer"
              className="font-code text-[12.5px] px-3 py-1.5 mt-1 rounded-md inline-flex items-center justify-center gap-1.5 border border-amber-300/40 text-amber-200 hover:bg-amber-400/10 transition-colors no-underline"
            >
              <Heart className="h-3.5 w-3.5" />
              Donate
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
