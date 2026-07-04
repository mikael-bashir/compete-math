'use client'

import Link from "next/link"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { LogOut, User, Globe, Heart, LogIn } from "lucide-react"

import { DazzleBadgeEffect } from "../art/badges/effects"
import { NAV_LINKS, DONATE_URL } from "../../constants/site"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// Ornate, code-themed menu glyph. Closed = a decorated three-bar sigil with a
// diamond node; open = a diamond-centred X. Swapping on `open` gives the
// requested state-reactive affordance instead of a plain burger.
function OrnateMenuGlyph({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
        <>
          <path d="M6.5 6.5 L17.5 17.5" />
          <path d="M17.5 6.5 L6.5 17.5" />
          <path d="M12 9.6 L14.4 12 L12 14.4 L9.6 12 Z" fill="currentColor" stroke="none" />
        </>
      ) : (
        <>
          <path d="M4.5 7 H19.5" />
          <path d="M4.5 12 H14.5" />
          <path d="M4.5 17 H19.5" />
          <path d="M18 9.8 L20.2 12 L18 14.2 L15.8 12 Z" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  )
}

export function UserDisplayer2() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")

  return (
    // Fixed container for the navbar. Solid (no backdrop-filter) so it doesn't
    // re-blur the large fixed page background on every scroll frame.
    <div className="fixed top-0 left-0 right-0 z-50 font-code">
      <nav className="w-full border-b border-white/[0.06] bg-gradient-to-b from-[#0a0f14]/80 to-[#0a0f14]/25">
        <div className="flex justify-center">
          <div className="flex justify-between items-center w-full max-w-7xl px-6 xs:py-4 py-2">

            {/* --- Logo (static gradient — no per-frame shimmer/drop-shadow) --- */}
            <Link href="/" className="flex items-center space-x-3 group">
              <p
                className="
                  font-code font-bold text-[13pt]
                  bg-linear-to-r from-amber-300 via-yellow-200 to-amber-400
                  bg-clip-text text-transparent
                "
              >
                CompeteMath
              </p>
            </Link>

            {/* --- Static desktop nav links --- */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    font-code text-[13px] px-3.5 py-2 rounded-md transition-all duration-200
                    ${isActive(link.href)
                      ? "text-emerald-200 bg-emerald-400/10 shadow-[inset_0_-2px_0_rgba(52,211,153,0.6)]"
                      : "text-white/60 hover:text-white hover:bg-white/5"}
                  `}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* --- Right side: account (auth) or ornate menu (guest) --- */}
            <div className="flex items-center gap-2">
              {status === "loading" ? (
                <div className="h-9 w-24 bg-white/5 animate-pulse rounded-md" />
              ) : status === "authenticated" && session?.user ? (

                /* Authenticated: avatar dropdown (chevron rotates on open) */
                <DropdownMenu open={accountOpen} onOpenChange={setAccountOpen}>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/10 text-emerald-100 hover:text-white transition-colors outline-none">
                      <span className="text-sm font-medium hidden sm:inline">
                        {session.user.username || "User"}
                      </span>
                      <DazzleBadgeEffect size="40px" color="#10b981">
                        <Avatar className="h-8 w-8 border border-white/20">
                          <AvatarImage src={session.user.badgeUrl || "/placeholder.svg"} alt="User" />
                          <AvatarFallback className="bg-emerald-900/50 text-emerald-200">
                            {session.user.username?.charAt(0)?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                      </DazzleBadgeEffect>
                      <span className={`transition-transform duration-300 ${accountOpen ? "rotate-90" : ""}`}>
                        <OrnateMenuGlyph open={false} />
                      </span>
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-56 bg-[#0d141b] border-white/10 text-emerald-50">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none text-emerald-100">
                          {session.user.username}
                        </p>
                        <p className="text-xs leading-none text-emerald-400/70 truncate">
                          {session.user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>

                    <DropdownMenuSeparator className="bg-white/10" />

                    {/* Nav links — shown in-menu on mobile only */}
                    <div className="md:hidden">
                      {NAV_LINKS.map((link) => (
                        <Link key={link.href} href={link.href} className="w-full">
                          <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                            <span>{link.label}</span>
                          </DropdownMenuItem>
                        </Link>
                      ))}
                      <DropdownMenuSeparator className="bg-white/10" />
                    </div>

                    <Link href={`/users/${session.user.username}`} className="w-full">
                      <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                        <User className="mr-2 h-4 w-4" />
                        <span>My Profile</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/account" className="w-full">
                      <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                        <Globe className="mr-2 h-4 w-4" />
                        <span>Account &amp; Badges</span>
                      </DropdownMenuItem>
                    </Link>
                    <a href={DONATE_URL} target="_blank" rel="noreferrer" className="w-full">
                      <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                        <Heart className="mr-2 h-4 w-4" />
                        <span>Donate</span>
                      </DropdownMenuItem>
                    </a>

                    <DropdownMenuSeparator className="bg-white/10" />

                    <DropdownMenuItem
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="text-red-400 focus:bg-red-900/20 focus:text-red-300 cursor-pointer"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (

                /* Guest: ornate menu button — holds Sign In + nav + Donate */
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Menu"
                      className={`
                        inline-flex items-center justify-center h-10 w-10 rounded-lg border transition-all duration-200 outline-none
                        ${menuOpen
                          ? "border-amber-300/50 text-amber-200 bg-amber-400/10 shadow-[0_0_20px_-6px_rgba(251,213,130,0.6)]"
                          : "border-white/15 text-white/70 hover:text-white hover:border-white/30 hover:bg-white/5"}
                      `}
                    >
                      <OrnateMenuGlyph open={menuOpen} />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-52 bg-[#0d141b] border-white/10 text-emerald-50">
                    {/* Nav links — mobile only (desktop has the strip) */}
                    <div className="md:hidden">
                      {NAV_LINKS.map((link) => (
                        <Link key={link.href} href={link.href} className="w-full">
                          <DropdownMenuItem
                            className={`focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full ${isActive(link.href) ? "text-emerald-200" : ""}`}
                          >
                            <span>{link.label}</span>
                          </DropdownMenuItem>
                        </Link>
                      ))}
                      <DropdownMenuSeparator className="bg-white/10" />
                    </div>

                    <Link href="/auth/login" className="w-full">
                      <DropdownMenuItem className="cursor-pointer w-full text-amber-200 focus:bg-amber-400/10 focus:text-amber-100 font-medium">
                        <LogIn className="mr-2 h-4 w-4" />
                        <span>Sign In</span>
                      </DropdownMenuItem>
                    </Link>
                    <a href={DONATE_URL} target="_blank" rel="noreferrer" className="w-full">
                      <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                        <Heart className="mr-2 h-4 w-4" />
                        <span>Donate</span>
                      </DropdownMenuItem>
                    </a>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </nav>
    </div>
  )
}
