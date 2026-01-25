"use client"

import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Menu, LogOut, User, ChevronDown } from "lucide-react"
import { AtomixGlass } from "@shohojdhara/atomix"
import { DazzleBadgeEffect } from "../art/badges/effects"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function UserDisplayer2() {
  const { data: session, status } = useSession()

  return (
    <div className="fixed top-0 left-0 right-0 z-50 font-serif">
      <AtomixGlass
        mode="standard"
        displacementScale={80}
        blurAmount={12}
        saturation={120}
        aberrationIntensity={1.5}
        elasticity={0.1}
        cornerRadius={0}
        className="w-full shadow-sm border-b border-[EAEADB]"
      >
        <div className="flex justify-center">
          <div className="flex justify-between items-center w-full max-w-7xl px-6 xs:py-4 py-2">
            {/* --- Logo Section --- */}
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="flex flex-col">
                <h1
                  className="
                    font-bold xs:text-xl text-[13pt]
                    bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400
                    bg-[length:200%_auto]
                    bg-clip-text text-transparent
                    [--tw-drop-shadow:drop-shadow(0_0_5px_theme(colors.yellow.200))_drop-shadow(0_0_15px_theme(colors.amber.400))_drop-shadow(0_0_35px_theme(colors.amber.600/_0.8))]
                    filter animate-[shimmer_3s_linear_infinite]
                  "
                >
                  CompeteMath
                </h1>
              </div>
            </Link>

            {/* --- User Session Area --- */}
            <div className="flex items-center space-x-4">
              {status === "loading" ? (
                <div className="h-9 w-24 bg-emerald-50/50 animate-pulse rounded-md" />
              ) : status === "authenticated" && session?.user ? (
                /* --- Authenticated: User Dropdown --- */
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex items-center gap-3 hover:bg-emerald-50 text-emerald-900 px-2 pl-3"
                    >
                      <span className="text-sm font-medium">
                        {session.user.username || "User"}
                      </span>
                      {/* --- THE DAZZLE BADGE --- */}
                      {/* Replaces standard icon. Size is slightly larger (48px) to allow room for the rays. */}
                      <div className="relative flex items-center justify-center">
                        <DazzleBadgeEffect size="48px" color="#10b981">
                          <Avatar className="h-8 w-8 border border-emerald-200/15">
                            <AvatarImage src={session.user.badgeUrl || "/placeholder.svg"} alt="User" />
                            <AvatarFallback className="bg-emerald-100 text-emerald-700">
                              {session.user.name?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                        </DazzleBadgeEffect>
                      </div>
                      <ChevronDown className="w-4 h-4 text-emerald-600 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-sm border-emerald-100">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none text-emerald-900">
                          {session.user.name}
                        </p>
                        <p className="text-xs leading-none text-emerald-600/70">
                          {session.user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-emerald-100" />
                    <Link href="/account" className="w-full">
                      <DropdownMenuItem className="focus:bg-emerald-50 focus:text-emerald-900 cursor-pointer w-full">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator className="bg-emerald-100" />
                    <DropdownMenuItem
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="text-red-600 focus:bg-red-50 focus:text-red-700 cursor-pointer"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                /* --- Unauthenticated --- */
                <div>
                  <div className="hidden xs:flex items-center space-x-3">
                    <Link href="/auth/login">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="
                          text-emerald-800/90
                          hover:text-emerald-500
                          hover:bg-transparent
                          transition-all
                          duration-300
                          ease-out
                          hover:-translate-y-0.5
                          hover:drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]
                        "
                      >
                        Sign In
                      </Button>
                    </Link>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="xs:hidden text-emerald-700 hover:bg-emerald-50"
                    aria-label="Open menu"
                  >
                    <Menu className="w-5 h-5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </AtomixGlass>
    </div>
  )
}
