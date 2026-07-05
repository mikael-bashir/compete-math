'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { useState } from "react"
import { Settings, User, Globe, Heart, LogOut } from "lucide-react"

import { NAV_LINKS, DONATE_URL } from "../../constants/site"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type SettingsItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  external?: boolean
}

/**
 * Tier 2 of the navigation — a thin bar of section links plus a Settings
 * dropdown. On desktop it is always a row; on phones it collapses to a single
 * column (toggled by the L-arrow in the strip), with Settings rendered as a
 * mini vertical list rather than a dropdown.
 */
export default function Navbar({
  open,
  onNavigate,
}: {
  open: boolean
  onNavigate: () => void
}) {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const isAuthed = status === "authenticated" && !!session?.user
  const [settingsOpen, setSettingsOpen] = useState(false)

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")

  const settingsItems: SettingsItem[] = isAuthed
    ? [
        { label: "My Profile", href: `/users/${session!.user!.username}`, icon: User },
        { label: "Account & Badges", href: "/account", icon: Globe },
        { label: "Donate", href: DONATE_URL, icon: Heart, external: true },
      ]
    : []

  return (
    <div
      className={`${open ? "block" : "hidden"} md:block border-t border-white/[0.05] bg-[#0a0f14]/95 md:bg-transparent`}
    >
      <div className="flex justify-center">
        <div className="w-full max-w-7xl px-6">

          {/* ---------- DESKTOP: single thin row ---------- */}
          <div className="hidden md:flex items-center justify-between py-1">
            <div className="flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`font-code text-[12.5px] px-3 py-1 rounded-md transition-all duration-200 ${
                    isActive(link.href)
                      ? "text-emerald-200 bg-emerald-400/10 shadow-[inset_0_-2px_0_rgba(52,211,153,0.6)]"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {isAuthed && (
              <DropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`font-code inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-md transition-colors outline-none ${
                      settingsOpen
                        ? "text-amber-200 bg-amber-400/10"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Settings
                      className={`h-3.5 w-3.5 transition-transform duration-300 ${settingsOpen ? "rotate-90" : ""}`}
                    />
                    Settings
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-[#0d141b] border-white/10 text-emerald-50">
                  {settingsItems.map(({ label, href, icon: Icon, external }) =>
                    external ? (
                      <a key={label} href={href} target="_blank" rel="noreferrer" className="w-full">
                        <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                          <Icon className="mr-2 h-4 w-4" />
                          <span>{label}</span>
                        </DropdownMenuItem>
                      </a>
                    ) : (
                      <Link key={label} href={href} className="w-full">
                        <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                          <Icon className="mr-2 h-4 w-4" />
                          <span>{label}</span>
                        </DropdownMenuItem>
                      </Link>
                    )
                  )}
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="text-red-400 focus:bg-red-900/20 focus:text-red-300 cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* ---------- MOBILE: column of single-row options ---------- */}
          <div className="md:hidden flex flex-col py-2 gap-0.5">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                className={`font-code text-[13px] px-3 py-2 rounded-md transition-colors ${
                  isActive(link.href)
                    ? "text-emerald-200 bg-emerald-400/10"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}

            {isAuthed && (
              <div className="mt-1 pt-2 border-t border-white/[0.06]">
                <p className="font-code text-[10px] uppercase tracking-widest text-white/30 px-3 mb-1">
                  Settings
                </p>
                {settingsItems.map(({ label, href, icon: Icon, external }) =>
                  external ? (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={onNavigate}
                      className="font-code flex items-center gap-2 text-[13px] px-3 py-1.5 text-white/60 hover:text-white transition-colors no-underline"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </a>
                  ) : (
                    <Link
                      key={label}
                      href={href}
                      onClick={onNavigate}
                      className="font-code flex items-center gap-2 text-[13px] px-3 py-1.5 text-white/60 hover:text-white transition-colors no-underline"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </Link>
                  )
                )}
                <button
                  onClick={() => {
                    onNavigate()
                    signOut({ callbackUrl: "/" })
                  }}
                  className="font-code flex items-center gap-2 text-[13px] px-3 py-1.5 w-full text-red-400 hover:text-red-300 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
