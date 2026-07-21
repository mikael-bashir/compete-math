"use client"

import { useState, useEffect } from "react"
import { Timer, ChevronRight, Loader2, Trophy } from "lucide-react"
import Link from "next/link"
import { flagEmoji, countryName } from "../../data/countries"

// Shape of one row from /api/leaderboard/latest
interface LeaderboardUser {
  rank: number
  username: string
  badgeId: string | null
  badgeTitle: string
  solvedAt: string
  attempts: number
  country: string | null
}

// "12 Jul · 14:32" — compact enough for the widget column
const formatSolved = (iso: string) => {
  const d = new Date(iso)
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
  return `${date} · ${time}`
}

function LeaderboardRow({ user }: { user: LeaderboardUser }) {
  const rankColor =
    user.rank === 1 ? "text-yellow-400" :
    user.rank === 2 ? "text-gray-300" :
    user.rank === 3 ? "text-amber-600" :
    "text-white/40"

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/5">
      {/* Rank */}
      <div className={`w-5 shrink-0 text-center font-mono text-xs font-semibold tabular-nums ${rankColor}`}>
        {user.rank}
      </div>

      {/* Badge avatar */}
      <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/40">
        {user.badgeId ? (
          <img
            src={user.badgeId}
            alt={user.badgeTitle}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] font-medium text-white/50">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name + badge title, single dense line */}
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate text-[13px] font-medium text-white">
          {user.username}
        </span>
        <span className="hidden truncate text-[9px] uppercase tracking-wider text-white/35 sm:inline">
          {user.badgeTitle}
        </span>
      </div>

      {/* Country flag */}
      {user.country && (
        <span className="shrink-0 text-sm leading-none" title={countryName(user.country)}>
          {flagEmoji(user.country)}
        </span>
      )}

      {/* Tries */}
      <span
        className={`w-6 shrink-0 text-right font-mono text-[11px] tabular-nums ${
          user.attempts === 1 ? "text-amber-300/90" : "text-white/40"
        }`}
        title={`${user.attempts} ${user.attempts === 1 ? "try" : "tries"}`}
      >
        {user.attempts}×
      </span>

      {/* Answered at */}
      <span className="shrink-0 whitespace-nowrap text-right font-mono text-[10px] tabular-nums text-white/50">
        {formatSolved(user.solvedAt)}
      </span>
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
        // One call: the CURRENT FEATURED problem + its live leaderboard — the
        // same problem the featured card beside this widget shows, resolved
        // server-side from the same source so they can never drift.
        const res = await fetch("/api/leaderboard/featured")
        if (!res.ok) throw new Error("Failed to fetch leaderboard")
        const json = await res.json()

        setProblemTitle(json.problem?.title || "")
        setData((json.leaderboard || []).slice(0, 10))
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
    <div className="relative flex flex-col h-full rounded-2xl border border-white/[0.08] bg-[#141013]/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-code text-[10px] tracking-[0.3em] uppercase text-amber-300/70 mb-2">
              // this week&apos;s race
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

          <Link
            href="/global"
            className="font-code flex items-center gap-1 text-xs text-white/50! transition-colors hover:text-white! group"
          >
            All leaderboards
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-5 min-h-75">
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
            <div className="space-y-0.5">
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
