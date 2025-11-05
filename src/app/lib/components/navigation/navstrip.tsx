"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function UserDisplayer1() {
  const [session, setSession] = useState<{ user: { username: string; iat?: number } } | null>(null)
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading")
  const [badge] = useState<string>("")

  useEffect(() => {
    const checkAuth = () => {
      // For now, set as unauthenticated - you can implement actual auth checking here
      setStatus("unauthenticated")
      setSession(null)
    }

    checkAuth()
  }, [])

  return (
    <div className="relative bg-gradient-to-r from-emerald-50/80 to-white/80 backdrop-blur-sm border-b border-emerald-100/50">
      <div className="flex justify-center">
        <div className="flex justify-between items-center w-full max-w-7xl px-6 py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center shadow-lg group-hover:shadow-emerald-200 transition-all duration-300">
              <span className="text-white font-bold text-lg">∑</span>
            </div>
            <div className="flex flex-col">
              <h1 className="font-heading text-xl font-bold text-emerald-900 group-hover:text-emerald-700 transition-colors">
                CompeteMath
              </h1>
              <p className="text-xs text-emerald-600 font-medium">Frontier of Math LLMs</p>
            </div>
          </Link>

          {/* User Session Area */}
          <div className="flex items-center space-x-4">
            {status === "authenticated" && session?.user ? (
              <div className="flex items-center space-x-3">
                <div className="flex flex-col items-end">
                  <p className="text-sm font-medium text-emerald-900">Welcome, {session.user.username}</p>
                  {session.user.iat && (
                    <p className="text-xs text-emerald-600">
                      Last login: {new Date(session.user.iat * 1000).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {badge && (
                  <img src={badge || "/placeholder.svg"} alt="User Badge" className="h-8 w-8 rounded-full shadow-sm" />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 bg-transparent"
                >
                  Logout
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link href="/auth/login">
                  <Button variant="ghost" size="sm" className="text-emerald-700 hover:bg-emerald-50">
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/register">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-emerald-200"
                  >
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function UserDisplayer2() {
  const [session, setSession] = useState<{ user: { username: string; iat?: number } } | null>(null)
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading")
  const [badge] = useState<string>("")

  useEffect(() => {
    const checkAuth = () => {
      // For now, set as unauthenticated - you can implement actual auth checking here
      setStatus("unauthenticated")
      setSession(null)
    }

    checkAuth()
  }, [])

  return (
    <div className="relative bg-transparent backdrop-blur-sm shadow-sm border-[EAEADB]">
      <div className="flex justify-center">
        <div className="flex justify-between items-center w-full max-w-7xl px-6 py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3 group">
            {/* <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center shadow-lg group-hover:shadow-emerald-200 transition-all duration-300">
              <span className="text-white font-bold text-lg">∑</span>
            </div> */}
            <div className="flex flex-col">
              {/* <h1 className="font-heading text-xl font-bold text-emerald-900 group-hover:text-emerald-700 transition-colors">
                CompeteMath
              </h1> */}
              <h1
                className="
                  text-xl font-bold 
                  
                  bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400
                  bg-[length:200%_auto] 
                  bg-clip-text text-transparent 
                  
                  [--tw-drop-shadow:drop-shadow(0_0_5px_theme(colors.yellow.200))_drop-shadow(0_0_15px_theme(colors.amber.400))_drop-shadow(0_0_35px_theme(colors.amber.600_/_0.8))]
                  filter
                  
                  animate-[shimmer_3s_linear_infinite]
                "
              >
                CompeteMath
              </h1>
              {/* <p className="text-xs text-emerald-600 font-medium">Frontier of Math LLMs</p> */}
            </div>
          </Link>

          {/* User Session Area */}
          <div className="flex items-center space-x-4">
            {status === "authenticated" && session?.user ? (
              <div className="flex items-center space-x-3">
                <div className="flex flex-col items-end">
                  <p className="text-sm font-medium text-emerald-900">Welcome, {session.user.username}</p>
                  {session.user.iat && (
                    <p className="text-xs text-emerald-600">
                      Last login: {new Date(session.user.iat * 1000).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {badge && (
                  <img src={badge || "/placeholder.svg"} alt="User Badge" className="h-8 w-8 rounded-full shadow-sm" />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 bg-transparent"
                >
                  Logout
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link href="/auth/login">
                  <Button variant="ghost" size="sm" className="text-emerald-700 hover:bg-emerald-50">
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/register">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-emerald-200"
                  >
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
