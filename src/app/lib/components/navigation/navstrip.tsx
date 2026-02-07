'use client'

import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
// Added Globe, Archive, Heart to imports
import { Menu, LogOut, User, ChevronDown, Globe, Archive, Heart, HomeIcon } from "lucide-react"

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
    // Fixed container for the navbar
    <div className="fixed top-0 left-0 right-0 z-50 font-serif">
      
      {/* REVERTED: Standard Navbar with subtle glass effect */}
      <nav className="w-full border-b border-white/10 shadow-sm bg-black/5 backdrop-blur-sm">
        <div className="flex justify-center">
          <div className="flex justify-between items-center w-full max-w-7xl px-6 xs:py-4 py-2">
            
            {/* --- Logo Section --- */}
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="flex flex-col">
                <p
                  className="
                    font-bold text-[13pt]
                    bg-linear-to-r from-amber-300 via-yellow-200 to-amber-400
                    bg-size-[200%_auto]
                    bg-clip-text text-transparent
                    [--tw-drop-shadow:drop-shadow(0_0_5px_var(--color-yellow-200))_drop-shadow(0_0_15px_var(--color-amber-400))_drop-shadow(0_0_35px_--theme(--color-amber-600/0.8))]
                    filter animate-shimmer
                  "
                >
                  CompeteMath
                </p>
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
                      className="flex items-center gap-3 hover:bg-white/10 text-emerald-100 px-2 pl-3 hover:text-white transition-colors"
                    >
                      <span className="text-sm font-medium">
                        {session.user.username || "User"}
                      </span>
                      {/* --- THE DAZZLE BADGE --- */}
                      <div className="relative flex items-center justify-center">
                        <DazzleBadgeEffect size="48px" color="#10b981">
                          <Avatar className="h-8 w-8 border border-white/20">
                            <AvatarImage src={session.user.badgeUrl || "/placeholder.svg"} alt="User" />
                            <AvatarFallback className="bg-emerald-900/50 text-emerald-200">
                              {session.user.name?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                        </DazzleBadgeEffect>
                      </div>
                      <ChevronDown className="w-4 h-4 text-emerald-400 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  
                  <DropdownMenuContent align="end" className="w-56 bg-[#0B0F19]/90 backdrop-blur-md border-white/10 text-emerald-50">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none text-emerald-100">
                          {session.user.name}
                        </p>
                        <p className="text-xs leading-none text-emerald-400/70">
                          {session.user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    
                    <DropdownMenuSeparator className="bg-white/10" />

                    {/* --- NEW BUTTONS START --- */}
                    
                    {/* Global */}
                    <Link href="/global" className="w-full">
                      <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                        <Globe className="mr-2 h-4 w-4" />
                        <span>Global</span>
                      </DropdownMenuItem>
                    </Link>

                    {/* Archives */}
                    <Link href="/archives" className="w-full">
                      <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                        <Archive className="mr-2 h-4 w-4" />
                        <span>Archives</span>
                      </DropdownMenuItem>
                    </Link>

                    {/* Home */}
                    <Link href="/home" className="w-full">
                      <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                        <HomeIcon className="mr-2 h-4 w-4" />
                        <span>Home</span>
                      </DropdownMenuItem>
                    </Link>

                    {/* Donate */}
                    <a href="https://buy.stripe.com/eVq6oGethg9na8B7WD0Jq00" className="w-full">
                      <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                        <Heart className="mr-2 h-4 w-4" />
                        <span>Donate</span>
                      </DropdownMenuItem>
                    </a>

                    {/* --- NEW BUTTONS END --- */}
                    
                    <DropdownMenuSeparator className="bg-white/10" />
                    
                    <Link href="/account" className="w-full">
                      <DropdownMenuItem className="focus:bg-white/10 focus:text-emerald-200 cursor-pointer w-full">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </DropdownMenuItem>
                    </Link>
                    
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
                /* --- Unauthenticated --- */
                <div>
                  <div className="items-center space-x-3">
                    <Link href="/auth/login">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="
                          rounded-full
                          text-emerald-100/90
                          hover:text-white
                          hover:bg-white/10
                          transition-all
                          duration-300
                          ease-out
                        "
                      >
                        <p className="text-xs">
                          Sign In
                        </p>
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
    </div>
  )
}