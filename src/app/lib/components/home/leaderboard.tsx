"use client"

import { useState, useEffect } from "react"
import { Crown, Timer, ChevronRight, Loader2, Trophy, Medal } from "lucide-react"
import Link from "next/link"

// Interface matching the response from your /api/leaderboard/[id]
interface LeaderboardUser {
  rank: number
  username: string
  badgeId: string   // This is the URL based on your API
  badgeTitle: string
  solvedAt: string
  attempts: number
  timeTaken: string
}

function LeaderboardRow({ 
  user, 
  isCurrentUser = false 
}: { 
  user: LeaderboardUser
  isCurrentUser?: boolean
}) {
  const getRankColor = (rank: number) => {
    if (rank === 1) return "text-yellow-400"
    if (rank === 2) return "text-gray-300" 
    if (rank === 3) return "text-amber-600"
    return "text-white/50"
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="mx-auto h-5 w-5 text-yellow-400" />
    if (rank === 2) return <Medal className="mx-auto h-4 w-4 text-gray-300" />
    if (rank === 3) return <Medal className="mx-auto h-4 w-4 text-amber-600" />
    return `#${rank}`
  }

  return (
    <div 
      className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${
        isCurrentUser 
          ? "bg-primary/10 ring-1 ring-primary/30" 
          : "hover:bg-white/5"
      }`}
    >
      {/* Rank Column */}
      <div className={`w-8 text-center font-semibold ${getRankColor(user.rank)}`}>
        {getRankIcon(user.rank)}
      </div>

      {/* Avatar / Badge */}
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/40">
        {user.badgeId ? (
          <img 
            src={user.badgeId} 
            alt={user.badgeTitle}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-medium text-white/50">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name & Badge Title */}
      <div className="flex-1 min-w-0">
        <p className={`truncate font-medium ${isCurrentUser ? "text-primary" : "text-white"}`}>
          {user.username}
        </p>
        <p className="truncate text-xs text-white/40">
          {user.badgeTitle}
        </p>
      </div>

      {/* Stats (Time Taken) */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono font-medium text-white/80">
          {user.timeTaken}
        </span>
      </div>
    </div>
  )
}

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)
  const [problemTitle, setProblemTitle] = useState("")
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        // 1. Get the latest problem to know which ID to fetch
        const problemRes = await fetch('/api/problems/latest')
        if (!problemRes.ok) throw new Error("Failed to fetch recent problem")
        const problemData = await problemRes.json()
        
        setProblemTitle(problemData.title)

        // 2. Fetch leaderboard for that problem ID
        const lbRes = await fetch(`/api/leaderboard/${problemData.id}`)
        if (!lbRes.ok) throw new Error("Failed to fetch leaderboard")
        const lbData = await lbRes.json()

        // 3. Set data (Take top 7 for the widget)
        setData(lbData.leaderboard.slice(0, 7))
      } catch (e) {
        console.error(e)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
  }, [])

  return (
    <div className="relative flex flex-col h-full rounded-2xl border border-white/[0.08] bg-[#170a0e]/70 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-code text-[10px] tracking-[0.3em] uppercase text-amber-300/70 mb-2">
              // this week's fastest
            </p>
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-4 w-4 text-amber-300" />
              <p className="font-code text-lg font-semibold text-white">Leaderboard</p>
            </div>
            {!loading && problemTitle && (
              <p className="text-xs text-white/40 truncate max-w-50">
                {problemTitle}
              </p>
            )}
          </div>
          
          {/* Changed button to Link pointing to /global */}
          <Link 
            href="/global"
            className="font-code flex items-center gap-1 text-xs text-white/50! transition-colors hover:text-white! group"
          >
            All leaderboards 
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-6 min-h-75">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-white/40">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Syncing scores...</span>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center py-10 text-sm text-white/40">
              Unavailable
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-10 text-white/40">
              <Timer className="mb-2 h-8 w-8 opacity-20" />
              <p className="text-sm">Be the first to solve it.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {data.map((user) => (
                <LeaderboardRow key={user.rank} user={user} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}