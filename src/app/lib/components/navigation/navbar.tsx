'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { Heart } from "lucide-react"

import { LEARN_DROPDOWN, RESEARCH_DROPDOWN, DONATE_URL } from "../../constants/site"

// A 90° "V" (down-chevron) that carries the amber shine and flips orientation
// when its target is open. Used for the Learn/Research dropdown triggers
// (desktop) and the mobile navbar toggle.
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
 * Tier 2 of the navigation: Learn (a menu onto Home/Community/Practice/
 * Leaderboard) and Research (a menu onto Leak/LRR/Blog), plus a standalone
 * Donate button. Neither trigger navigates anywhere itself — Home lives
 * INSIDE Learn's own list, reached the same way as everything else in it.
 *
 * Desktop: hover opens a floating panel under the trigger, as normal. But a
 * click on the trigger PINS it open regardless of hover state, and a second
 * click un-pins and closes it — a plain mouse never needs this, but a wide
 * touchscreen running the desktop layout has no real hover to begin with, so
 * without a click that actually opens (and actually closes) the menu, a tap
 * could open a dropdown a second tap can never dismiss. Mobile has no hover
 * at all, so its trigger is a plain tap-toggle to start with.
 */
export default function Navbar() {
  const pathname = usePathname()

  const [navOpen, setNavOpen] = useState(false)
  const [learnOpen, setLearnOpen] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")
  const isAnyActive = (hrefs: readonly string[]) => hrefs.some(isActive)

  // Each trigger is "on" for every page its own dropdown leads to — Home's
  // page is INSIDE Learn's list now, so this alone covers it too.
  const learnActive = isAnyActive(LEARN_DROPDOWN.map((l) => l.href))
  const researchActive = isAnyActive(RESEARCH_DROPDOWN.map((l) => l.href))

  // Whether a trigger is PINNED — opened by a click/tap rather than by hover —
  // and therefore immune to hover-leave until it is clicked again. A ref, not
  // state: it only ever matters inside these handlers, and nothing needs to
  // re-render when it changes.
  const learnPinned = useRef(false)
  const researchPinned = useRef(false)
  const learnCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const researchCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Collapse everything whenever the route changes, pins included — a pin
  // surviving a navigation would leave the NEXT page's menu un-closeable by
  // hover-leave for no reason.
  useEffect(() => {
    setNavOpen(false)
    setLearnOpen(false)
    learnPinned.current = false
    setResearchOpen(false)
    researchPinned.current = false
  }, [pathname])

  // `closeOther` always releases the pin too: without that, hovering back
  // onto a trigger that was pinned-then-closed-by-its-sibling would find
  // pinned.current still true from before and refuse to close on mouse-leave
  // — a stale pin masquerading as a fresh hover.
  function triggerHandlers(
    open: boolean,
    setOpen: (v: boolean) => void,
    pinned: React.MutableRefObject<boolean>,
    timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    closeOther: () => void,
  ) {
    const clearTimer = () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
    const toggle = () => {
      clearTimer()
      if (open && pinned.current) {
        // second click on an already-pinned trigger: close it
        pinned.current = false
        setOpen(false)
      } else {
        // first click (whether it was already open via hover or not): force
        // it open and PIN it, so hover-leave — real or touch-synthesised —
        // cannot close it again until this fires a second time
        closeOther()
        pinned.current = true
        setOpen(true)
      }
    }
    return {
      onMouseEnter: () => { clearTimer(); closeOther(); setOpen(true) },
      onMouseLeave: () => {
        clearTimer()
        if (pinned.current) return
        timer.current = setTimeout(() => setOpen(false), 150)
      },
      // Keyboard parity for hover: focusing anything inside the trigger opens
      // it; focus leaving it (not just the trigger itself) closes it, unless
      // pinned — same rule as the mouse.
      onFocus: () => { clearTimer(); closeOther(); setOpen(true) },
      onBlur: (e: React.FocusEvent) => {
        if (pinned.current) return
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
      },
      onClick: (e: React.MouseEvent) => { e.preventDefault(); toggle() },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle() }
      },
    }
  }
  const learnHandlers = triggerHandlers(learnOpen, setLearnOpen, learnPinned, learnCloseTimer, () => {
    researchPinned.current = false
    setResearchOpen(false)
  })
  const researchHandlers = triggerHandlers(researchOpen, setResearchOpen, researchPinned, researchCloseTimer, () => {
    learnPinned.current = false
    setLearnOpen(false)
  })

  // Shared link styling: colour + hover feedback only. Underline (active) is
  // layered on separately so it can be scoped to just a label span when the
  // trigger also carries an arrow icon.
  const linkBase = "font-code text-[12.5px] px-3 py-1 rounded-md transition-colors duration-200"
  const linkCls = (active: boolean) =>
    `${linkBase} ${active ? "text-amber-200" : "text-white/60 hover:text-white hover:bg-white/5"}`

  // The full-width strip shared by both desktop dropdowns — the same shape the
  // old Settings sub-bar used: a horizontal row of centred links spanning the
  // ENTIRE navbar width, not a narrow box floating under just the trigger.
  // Only the two HOVER handlers are spread here (never onClick/onFocus/onBlur
  // — those are trigger-only concerns), so the mouse staying on either the
  // trigger or the panel keeps it open without the panel itself reacting to a
  // click the way the trigger does. No backdrop-filter — same reasoning as
  // the rest of this file: avoid re-blurring the large fixed page background
  // every frame.
  function DesktopPanel({
    links,
    onMouseEnter,
    onMouseLeave,
  }: {
    links: readonly DropdownLink[]
    onMouseEnter: () => void
    onMouseLeave: () => void
  }) {
    return (
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className="absolute inset-x-0 top-full border-t border-white/[0.05] bg-[#0a0f14]/95 shadow-lg shadow-black/40 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
      >
        <div className="flex items-center justify-center gap-1 py-1.5">
          {links.map((l) => {
            const active = isActive(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`${linkBase} ${active ? "text-amber-200" : "text-white/65 hover:text-white hover:bg-white/5"}`}
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
      {/* `relative` here (not on the triggers below) so each dropdown panel
          positions against the WHOLE row and can span its full width, rather
          than being confined to the width of the trigger that opened it. */}
      <div className="hidden md:block relative">
        <div className="flex items-center justify-center gap-1 py-1">

          {/* Learn — a menu onto Home/Community/Practice/Leaderboard */}
          <a
            role="button"
            tabIndex={0}
            {...learnHandlers}
            className={`${linkCls(learnActive)} inline-flex items-center gap-1 cursor-pointer select-none outline-none no-underline`}
          >
            <span className={learnActive ? ACTIVE_UNDERLINE : undefined}>Learn</span>
            <VArrow open={learnOpen} className="h-3 w-3" />
          </a>

          {/* Research — a menu onto Leak/LRR/Blog */}
          <a
            role="button"
            tabIndex={0}
            {...researchHandlers}
            className={`${linkCls(researchActive)} inline-flex items-center gap-1 cursor-pointer select-none outline-none no-underline`}
          >
            <span className={researchActive ? ACTIVE_UNDERLINE : undefined}>Research</span>
            <VArrow open={researchOpen} className="h-3 w-3" />
          </a>

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

        {/* full-width panels: siblings of the row above, not of one trigger,
            so they span the whole bar regardless of which trigger opened them */}
        {learnOpen && (
          <DesktopPanel links={LEARN_DROPDOWN} onMouseEnter={learnHandlers.onMouseEnter} onMouseLeave={learnHandlers.onMouseLeave} />
        )}
        {researchOpen && (
          <DesktopPanel links={RESEARCH_DROPDOWN} onMouseEnter={researchHandlers.onMouseEnter} onMouseLeave={researchHandlers.onMouseLeave} />
        )}
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

            {/* Learn: touch has no hover, so this is a plain tap-toggle —
                tapping it reveals the list rather than navigating away. Home
                is simply the first item inside that list. */}
            <a
              role="button"
              tabIndex={0}
              onClick={() => setLearnOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setLearnOpen((o) => !o)
                }
              }}
              className={`${linkCls(learnActive)} block text-center cursor-pointer select-none outline-none no-underline`}
            >
              <span className={learnActive ? ACTIVE_UNDERLINE : undefined}>Learn</span>
            </a>
            {learnOpen && (
              <div className="flex flex-col items-stretch gap-0.5 pb-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {LEARN_DROPDOWN.map((l) => {
                  const active = isActive(l.href)
                  return (
                    <Link key={l.href} href={l.href} className={`${linkCls(active)} text-center text-[11.5px]`}>
                      <span className={active ? ACTIVE_UNDERLINE : undefined}>{l.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Research: no page of its own, so the whole row is one tap
                target. Same shape as Learn above. */}
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
              className={`${linkCls(researchActive)} block text-center cursor-pointer select-none outline-none no-underline`}
            >
              <span className={researchActive ? ACTIVE_UNDERLINE : undefined}>Research</span>
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
