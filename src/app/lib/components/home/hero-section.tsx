"use client"

import React, { useEffect, useState } from "react"
import { Flame } from "lucide-react"
import { useSession } from "next-auth/react"

export function HeroSection() {
  const [streak, setStreak] = useState(0)
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  })

  const { data: session } = useSession();

  // 1. Fetch Streak
  useEffect(() => {
    if (session?.user?.username) {
      fetch('/api/user/profile/streak')
        .then((res) => res.json())
        .then((data) => {
          if (typeof data.streak === 'number') {
            setStreak(data.streak)
          }
        })
        .catch((err) => console.error("Failed to load streak", err))
    }
  }, [session])

// 2. Timer Logic (Friday 6am BST)
  useEffect(() => {
    const getNextFriday6amBST = () => {
      const now = new Date()
      const target = new Date(now)

      // 6am BST (UTC+1) — UTC calculations keep it globally synchronized.
      const targetDayOfWeek = 5 // Friday
      const targetHourUTC = 6   // 05:00 UTC = 06:00 BST

      const currentDay = now.getUTCDay()
      let daysUntil = (targetDayOfWeek - currentDay + 7) % 7

      target.setUTCDate(now.getUTCDate() + daysUntil)
      target.setUTCHours(targetHourUTC, 0, 0, 0)

      if (target.getTime() <= now.getTime()) {
        target.setUTCDate(target.getUTCDate() + 7)
      }

      return target
    }

    const updateTimer = () => {
      const now = new Date()
      const target = getNextFriday6amBST()
      const diff = target.getTime() - now.getTime()

      if (diff > 0) {
        setTimeLeft({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
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
    <section className="pt-10 pb-2 text-center">
      {/* Kicker */}
      <p className="font-code text-[11px] tracking-[0.35em] uppercase text-rose-300/70 mb-4">
        — the weekly arena —
      </p>

      <h1 className="font-code text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl text-white!">
        Welcome back,{" "}
        <span className="bg-linear-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
          {session?.user?.username || "Guest"}
        </span>
      </h1>

      <p className="mx-auto mt-4 max-w-xl text-sm md:text-base text-white/50 leading-relaxed">
        One problem. Seven days. The whole world racing you to the insight.
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
        <div className="relative rounded-2xl border border-white/10 bg-[#141013]/92 px-8 py-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
          {/* rose hairline along the top */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-rose-300/50 to-transparent" />

          <p className="font-code text-[10px] tracking-[0.3em] uppercase text-white/35 mb-3">
            next problem drops in
          </p>
          <div className="flex items-baseline justify-center gap-1.5">
            <TimeUnit value={timeLeft.days} label="d" />
            <Colon />
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
