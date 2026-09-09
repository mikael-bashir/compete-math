'use client'

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { LogIn } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Navbar from "./navbar"
import { PRESTIGE_TITLE_CLASS, prestigeTitleStyle } from "../../utils/prestige"

// Throttle for the cosmetics self-heal below - once a minute per tab is plenty.
const COSMETICS_SYNC_KEY = "cosmeticsSyncAt"
const COSMETICS_SYNC_MIN_MS = 60_000

export function UserDisplayer2() {
  const { data: session, status, update } = useSession()

  const isAuthed = status === "authenticated" && !!session?.user
  const username = session?.user?.username

  // SELF-HEAL STALE SESSION COSMETICS. The JWT caches badgeUrl/title colours
  // and only refreshes them at credential login or a same-session equip - so
  // an equip made on another device/browser (or an admin force-equip, or a
  // direct DB change) leaves this session's navbar stale FOREVER. Once per
  // page load (throttled), compare the session against the DB truth and
  // update() the diff; the jwt callback merges it into the token.
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.username) return
    const last = Number(sessionStorage.getItem(COSMETICS_SYNC_KEY) || 0)
    if (Date.now() - last < COSMETICS_SYNC_MIN_MS) return

    let cancelled = false
    fetch("/api/user/session-sync")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (d) => {
        if (!d || cancelled) return
        const u = session.user
        const changed =
          (u.badgeUrl ?? "/badges/newbie.png") !== d.badgeUrl ||
          !!u.badgeNoBorder !== !!d.badgeNoBorder ||
          (u.titleColorFrom ?? null) !== (d.titleColorFrom ?? null) ||
          (u.titleColorTo ?? null) !== (d.titleColorTo ?? null) ||
          (u.titleTextColor ?? null) !== (d.titleTextColor ?? null)
        if (changed) {
          await update({
            badgeUrl: d.badgeUrl,
            badgeNoBorder: d.badgeNoBorder,
            titleColorFrom: d.titleColorFrom,
            titleColorTo: d.titleColorTo,
            titleTextColor: d.titleTextColor,
          })
        }
        // Mark synced only AFTER completing (a navigation mid-flight kills the
        // fetch/update; writing the key up-front would then block the retry on
        // the next page for the whole throttle window while the navbar sits
        // visibly stale).
        sessionStorage.setItem(COSMETICS_SYNC_KEY, String(Date.now()))
      })
      .catch(() => {})
    return () => { cancelled = true }
    // Deliberately keyed on auth status only: the throttle guards re-runs, and
    // re-running on every session object change would loop through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])
  // The profile card's own dropdown (My Profile / Account & Badges / Log out) —
  // what the old Settings menu in the navbar showed, now reached by clicking
  // the card itself rather than a separate "Settings" link.
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileOpen) return
    function onPointerDown(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [profileOpen])

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
                // The card itself is now the dropdown trigger — clicking it
                // opens the same menu the old "Settings" navbar item did,
                // rather than navigating straight to the profile page (that
                // is still one click away, as the first item in the menu).
                <div className="relative" ref={profileRef}>
                  <button
                    type="button"
                    onClick={() => setProfileOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                    className="flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-white/10 transition-colors outline-none"
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
                  </button>

                  {/* translucent dropdown — no backdrop-filter, same reasoning
                      as the rest of this file's fixed chrome */}
                  {profileOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-2 min-w-[11rem] rounded-lg border border-white/10 bg-[#0a0f14]/90 shadow-lg shadow-black/40 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                    >
                      <Link
                        href={`/users/${username}`}
                        role="menuitem"
                        className="block px-3.5 py-1.5 text-[13px] font-code text-white/70 hover:text-white hover:bg-white/5 transition-colors no-underline"
                      >
                        My Profile
                      </Link>
                      <Link
                        href="/account"
                        role="menuitem"
                        className="block px-3.5 py-1.5 text-[13px] font-code text-white/70 hover:text-white hover:bg-white/5 transition-colors no-underline"
                      >
                        Account &amp; Badges
                      </Link>
                      <div className="my-1 border-t border-white/[0.06]" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => signOut({ callbackUrl: "/" })}
                        className="w-full text-left px-3.5 py-1.5 text-[13px] font-code text-red-400/80 hover:text-red-300 transition-colors outline-none"
                      >
                        Log out
                      </button>
                    </div>
                  )}
                </div>
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
