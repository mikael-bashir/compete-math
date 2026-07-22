'use client'

import Link from "next/link"
import { useSession } from "next-auth/react"
import { LogIn } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Navbar from "./navbar"
import { PRESTIGE_TITLE_CLASS, prestigeTitleStyle } from "../../utils/prestige"

export function UserDisplayer2() {
  const { data: session, status } = useSession()

  const isAuthed = status === "authenticated" && !!session?.user
  const username = session?.user?.username
  // Equipped prestige title styles the name (null for plain titles).
  const nameStyle = prestigeTitleStyle(
    session?.user?.titleColorFrom,
    session?.user?.titleColorTo,
    session?.user?.titleTextColor,
  )

  return (
    // Fixed header. Solid-ish translucent surface (no backdrop-filter) so it
    // doesn't re-blur the large fixed page background on every scroll frame.
    // `site-chrome`: the landing page's equation-film fades all fixed chrome
    // out while pinned (body[data-film-immersed] rule in globals.css).
    <div className="site-chrome fixed top-0 left-0 right-0 z-50 font-code">
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

            {/* Right: user chip (auth) or Sign In (guest) */}
            <div className="flex items-center gap-2">
              {status === "loading" ? (
                <div className="h-7 w-20 bg-white/5 animate-pulse rounded-md" />
              ) : isAuthed ? (
                <Link
                  href={`/users/${username}`}
                  className="flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-white/10 transition-colors no-underline"
                >
                  <span
                    className={`text-[13px] font-medium hidden xs:inline ${nameStyle ? PRESTIGE_TITLE_CLASS : "text-emerald-100"}`}
                    style={nameStyle || undefined}
                  >
                    {username || "User"}
                  </span>
                  {session?.user?.badgeNoBorder ? (
                    // Frameless prestige art - show the full square, no circle clip.
                    <img
                      src={session!.user!.badgeUrl || "/placeholder.svg"}
                      alt="User"
                      className="h-7 w-7 object-contain"
                    />
                  ) : (
                    <Avatar className="h-7 w-7 border border-white/20">
                      <AvatarImage src={session!.user!.badgeUrl || "/placeholder.svg"} alt="User" />
                      <AvatarFallback className="bg-emerald-900/50 text-emerald-200 text-xs">
                        {username?.charAt(0)?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  )}
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
            </div>
          </div>
        </div>

        {/* ---------- Tier 2: the navbar (links + Settings) ---------- */}
        <Navbar />
      </div>
    </div>
  )
}
