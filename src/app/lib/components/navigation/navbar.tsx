'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { useEffect, useId, useState } from "react"

import { NAV_LINKS, DONATE_URL } from "../../constants/site"

// A 90° "V" (down-chevron) that carries the amber shine and flips orientation
// when its target is open. Reused for the mobile navbar toggle (large) and the
// Settings disclosure (mini).
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

type SettingsLink = { label: string; href: string; external?: boolean }

/**
 * Tier 2 of the navigation. Desktop: the section links are centred, with a
 * Settings item styled identically to them (plus a mini V) that drops a small
 * secondary bar of setting links. Phones: the navbar collapses to a single
 * centred V that pops the links into a column; Settings there also styles like
 * a link and its mini V reveals a smaller sub-list.
 */
export default function Navbar() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const isAuthed = status === "authenticated" && !!session?.user

  const [navOpen, setNavOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Collapse everything whenever the route changes.
  useEffect(() => {
    setNavOpen(false)
    setSettingsOpen(false)
  }, [pathname])

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")

  const settingsLinks: SettingsLink[] = isAuthed
    ? [
        { label: "My Profile", href: `/users/${session!.user!.username}` },
        { label: "Account & Badges", href: "/account" },
        { label: "Donate", href: DONATE_URL, external: true },
      ]
    : []

  // Shared link styling so Settings is visually identical to the nav links.
  const linkBase = "font-code text-[12.5px] px-3 py-1 rounded-md transition-all duration-200"
  const linkCls = (active: boolean) =>
    `${linkBase} ${
      active
        ? "text-emerald-200 bg-emerald-400/10 shadow-[inset_0_-2px_0_rgba(52,211,153,0.6)]"
        : "text-white/60 hover:text-white hover:bg-white/5"
    }`

  const secondaryLink = `${linkBase} text-white/45 hover:text-white`

  return (
    <div className="border-t border-white/[0.05] bg-[#0a0f14]/95 md:bg-transparent">

      {/* ==================== DESKTOP ==================== */}
      <div className="hidden md:block">
        <div className="flex items-center justify-center gap-1 py-1">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkCls(isActive(link.href))}>
              {link.label}
            </Link>
          ))}
          {isAuthed && (
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              className={`${linkCls(settingsOpen)} inline-flex items-center gap-1 outline-none`}
            >
              Settings
              <VArrow open={settingsOpen} className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* secondary navbar of setting links */}
        {isAuthed && settingsOpen && (
          <div className="flex items-center justify-center gap-1 pt-0.5 pb-1.5 border-t border-white/[0.04] animate-in fade-in slide-in-from-top-1 duration-200">
            {settingsLinks.map((s) =>
              s.external ? (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className={`${secondaryLink} no-underline`}>
                  {s.label}
                </a>
              ) : (
                <Link key={s.label} href={s.href} className={`${secondaryLink} no-underline`}>
                  {s.label}
                </Link>
              )
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className={`${linkBase} text-red-400/80 hover:text-red-300 outline-none`}
            >
              Log out
            </button>
          </div>
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
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`${linkBase} text-center ${
                  isActive(link.href)
                    ? "text-emerald-200 bg-emerald-400/10"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}

            {isAuthed && (
              <>
                {/* Settings — identical to a nav link, plus a smaller V */}
                <button
                  type="button"
                  onClick={() => setSettingsOpen((o) => !o)}
                  className={`${linkBase} inline-flex items-center justify-center gap-1 outline-none ${
                    settingsOpen ? "text-amber-200" : "text-white/70 hover:text-white hover:bg-white/5"
                  }`}
                >
                  Settings
                  <VArrow open={settingsOpen} className="h-3.5 w-3.5" />
                </button>

                {/* smaller, minimised set of setting links */}
                {settingsOpen && (
                  <div className="flex flex-col items-stretch gap-0.5 pb-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {settingsLinks.map((s) =>
                      s.external ? (
                        <a
                          key={s.label}
                          href={s.href}
                          target="_blank"
                          rel="noreferrer"
                          className="font-code text-[11.5px] px-3 py-1 rounded-md text-center text-white/45 hover:text-white transition-colors no-underline"
                        >
                          {s.label}
                        </a>
                      ) : (
                        <Link
                          key={s.label}
                          href={s.href}
                          className="font-code text-[11.5px] px-3 py-1 rounded-md text-center text-white/45 hover:text-white transition-colors no-underline"
                        >
                          {s.label}
                        </Link>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="font-code text-[11.5px] px-3 py-1 rounded-md text-center text-red-400/80 hover:text-red-300 transition-colors w-full"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
