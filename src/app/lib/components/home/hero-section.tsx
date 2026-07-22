"use client"

import React, { useEffect, useState } from "react"
import { Flame } from "lucide-react"
import { useSession } from "next-auth/react"
import { PRESTIGE_TITLE_CLASS, prestigeTitleStyle } from "../../utils/prestige"

// Guest greeting adjectives — one is picked at random and cached in the browser
// for the day so the greeting doesn't reshuffle on every render/visit.
const GUEST_ADJECTIVES = ["Ambitious", "Curious", "Aspiring", "Dedicated"]

export function HeroSection() {
  const [streak, setStreak] = useState(0)
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 })
  const [guestAdj, setGuestAdj] = useState<string | null>(null)

  const { data: session } = useSession()
  const username = session?.user?.username
  const isAuthed = !!username
  // Equipped prestige title styles the name in the greeting (null = plain).
  const nameStyle = prestigeTitleStyle(
    session?.user?.titleColorFrom,
    session?.user?.titleColorTo,
    session?.user?.titleTextColor,
  )

  // Pick (or reuse) today's guest adjective, cached in localStorage for a day.
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const raw = localStorage.getItem("cm_guest_adj")
      const cached = raw ? JSON.parse(raw) : null
      if (cached?.date === today && cached?.adj) {
        setGuestAdj(cached.adj)
        return
      }
      const adj = GUEST_ADJECTIVES[Math.floor(Math.random() * GUEST_ADJECTIVES.length)]
      localStorage.setItem("cm_guest_adj", JSON.stringify({ date: today, adj }))
      setGuestAdj(adj)
    } catch {
      setGuestAdj(GUEST_ADJECTIVES[0])
    }
  }, [])

  // 1. Fetch Streak
  useEffect(() => {
    if (username) {
      fetch('/api/user/profile/streak')
        .then((res) => res.json())
        .then((data) => {
          if (typeof data.streak === 'number') setStreak(data.streak)
        })
        .catch((err) => console.error("Failed to load streak", err))
    }
  }, [username])

  // 2. Timer Logic — counts down to the next 06:00 UTC (a fresh problem daily).
  useEffect(() => {
    const getNext6amUTC = () => {
      const now = new Date()
      const target = new Date(now)
      target.setUTCHours(6, 0, 0, 0)
      if (target.getTime() <= now.getTime()) {
        target.setUTCDate(target.getUTCDate() + 1)
      }
      return target
    }

    const updateTimer = () => {
      const diff = getNext6amUTC().getTime() - Date.now()
      if (diff > 0) {
        setTimeLeft({
          hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((diff / (1000 * 60)) % 60),
          seconds: Math.floor((diff / 1000) % 60),
        })
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    // pt preserves the gap between the greeting and the navbar now that the
    // "weekly arena" kicker above it has been removed.
    <section className="pt-[4.5rem] pb-2 text-center">
      <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl text-white!">
        {/* comma after "Welcome" kept; "back" only appears when signed in */}
        Welcome{isAuthed ? " back," : ","}{" "}
        <span
          className={isAuthed && nameStyle
            ? PRESTIGE_TITLE_CLASS
            : "bg-linear-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent"}
          style={isAuthed && nameStyle ? nameStyle : undefined}
        >
          {isAuthed ? username : (guestAdj ?? " ")}
        </span>
        {!isAuthed && " one"}
      </h1>

      <p className="mx-auto mt-4 max-w-xl text-sm md:text-base text-white/50 leading-relaxed">
        A fresh problem every day. The whole world racing you to the insight.
      </p>

      {/* Streak badge */}
      {streak > 0 && (
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-4 py-1.5 animate-in fade-in slide-in-from-bottom-2">
          <Flame className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
          <span className="font-code text-xs font-medium text-amber-200">
            {streak}-day streak
          </span>
        </div>
      )}

      {/* Countdown strip */}
      <div className="mx-auto mt-10 max-w-md">
        <div className="relative rounded-2xl border border-white/[0.08] bg-[#141013]/92 px-8 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_60px_-20px_rgba(0,0,0,0.8)]">
          {/* rose hairline along the top */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-rose-300/50 to-transparent" />

          <p className="font-code text-[10px] tracking-[0.3em] uppercase text-white/35 mb-3">
            next problem drops in
          </p>
          <div className="flex items-baseline justify-center gap-1.5">
            <TimeUnit value={timeLeft.hours} label="h" />
            <Colon />
            <TimeUnit value={timeLeft.minutes} label="m" />
            <Colon />
            <TimeUnit value={timeLeft.seconds} label="s" />
          </div>
        </div>
      </div>
    </section>
  )
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <span className="font-code tabular-nums">
      <span className="text-3xl md:text-4xl font-semibold text-white">
        {value.toString().padStart(2, "0")}
      </span>
      <span className="ml-0.5 text-xs text-rose-300/70">{label}</span>
    </span>
  )
}

function Colon() {
  return <span className="font-code text-2xl text-white/20 px-0.5">:</span>
}
