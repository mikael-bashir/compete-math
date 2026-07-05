'use client'

import Link from "next/link"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { LogIn } from "lucide-react"

import { DazzleBadgeEffect } from "../art/badges/effects"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Navbar from "./navbar"

// L-shaped (elbow) arrow that toggles the navbar on phones. It carries the same
// amber shine as the logo (gradient stroke + glow) and shifts orientation when
// the navbar is open vs closed.
function LArrow({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 transition-transform duration-300 ${open ? "rotate-90" : ""}`}
      fill="none"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ filter: "drop-shadow(0 0 4px rgba(251,191,36,0.55))" }}
      aria-hidden
    >
      <defs>
        <linearGradient id="larrow-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="50%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <g stroke="url(#larrow-shine)">
        {/* the elbow: down, then right */}
        <path d="M8 4.5 V15.5 H16" />
        {/* arrowhead at the corner's end, pointing right */}
        <path d="M12.5 12 L16.5 15.5 L12.5 19" />
      </g>
    </svg>
  )
}

export function UserDisplayer2() {
  const { data: session, status } = useSession()
  const [navOpen, setNavOpen] = useState(false)

  const isAuthed = status === "authenticated" && !!session?.user
  const username = session?.user?.username

  return (
    // Fixed header. Solid-ish translucent surface (no backdrop-filter) so it
    // doesn't re-blur the large fixed page background on every scroll frame.
    <div className="fixed top-0 left-0 right-0 z-50 font-code">
      <div className="bg-gradient-to-b from-[#0a0f14]/85 to-[#0a0f14]/45">

        {/* ---------- Tier 1: the strip (logo + user/badge) ---------- */}
        <div className="flex justify-center">
          <div className="flex justify-between items-center w-full max-w-7xl px-6 py-1">

            {/* Logo (live shine) */}
            <Link href="/" className="flex items-center group no-underline">
              <p
                className="
                  font-code font-bold text-[13pt]
                  bg-linear-to-r from-amber-300 via-yellow-200 to-amber-400
                  bg-size-[200%_auto]
                  bg-clip-text text-transparent
                  [--tw-drop-shadow:drop-shadow(0_0_5px_var(--color-yellow-200))_drop-shadow(0_0_15px_var(--color-amber-400))]
                  filter animate-shimmer
                "
              >
                CompeteMath
              </p>
            </Link>

            {/* Right: user chip (auth) or Sign In (guest) + mobile toggle */}
            <div className="flex items-center gap-2">
              {status === "loading" ? (
                <div className="h-7 w-20 bg-white/5 animate-pulse rounded-md" />
              ) : isAuthed ? (
                <Link
                  href={`/users/${username}`}
                  className="flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-white/10 transition-colors no-underline"
                >
                  <span className="text-[13px] font-medium text-emerald-100 hidden xs:inline">
                    {username || "User"}
                  </span>
                  <DazzleBadgeEffect size="34px" color="#10b981">
                    <Avatar className="h-7 w-7 border border-white/20">
                      <AvatarImage src={session!.user!.badgeUrl || "/placeholder.svg"} alt="User" />
                      <AvatarFallback className="bg-emerald-900/50 text-emerald-200 text-xs">
                        {username?.charAt(0)?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </DazzleBadgeEffect>
                </Link>
              ) : (
                <Link
                  href="/auth/login"
                  className="font-code inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1 rounded-md border border-amber-300/40 text-amber-200 hover:bg-amber-400/10 transition-colors no-underline"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign In
                </Link>
              )}

              {/* Mobile-only navbar toggle (replaces the old burger) */}
              <button
                type="button"
                onClick={() => setNavOpen((o) => !o)}
                aria-label="Toggle navigation"
                aria-expanded={navOpen}
                className="md:hidden inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-white/5 transition-colors outline-none"
              >
                <LArrow open={navOpen} />
              </button>
            </div>
          </div>
        </div>

        {/* ---------- Tier 2: the navbar (links + Settings) ---------- */}
        <Navbar open={navOpen} onNavigate={() => setNavOpen(false)} />
      </div>
    </div>
  )
}
