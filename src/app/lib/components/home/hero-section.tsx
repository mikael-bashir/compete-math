"use client"

import React, { useEffect, useState } from "react"
import { Clock, Flame } from "lucide-react"
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

      // Configuration: Friday (5) at 6am BST
      // Note: 6am BST (UTC+1) is 5am UTC.
      // We use UTC calculations to ensure global synchronization.
      const targetDayOfWeek = 5 // Friday
      const targetHourUTC = 6   // 05:00 UTC = 06:00 BST

      const currentDay = now.getUTCDay()
      
      // Calculate days until the next Friday
      // If today is Friday (5) and we haven't passed 5am UTC yet, diff is 0.
      let daysUntil = (targetDayOfWeek - currentDay + 7) % 7

      // Set the target date
      target.setUTCDate(now.getUTCDate() + daysUntil)
      target.setUTCHours(targetHourUTC, 0, 0, 0)

      // If the calculated target is in the past (e.g. it's Friday 8am), jump to next week
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
    <section className="py-8 text-center mt-8">
      {/* Dynamic Streak Badge */}
      {streak > 0 && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 backdrop-blur-sm transition-colors animate-in fade-in slide-in-from-bottom-2">
          <Flame className="h-4 w-4 text-orange-500 fill-orange-500" />
          <span className="text-sm font-medium text-orange-200">
            {streak} day streak!
          </span>
        </div>
      )}

      <div className="mt-4 font-code text-4xl font-light tracking-tight md:text-5xl lg:text-6xl text-white">
        Welcome back, <span className="font-semibold text-emerald-200">{session?.user?.username || "Guest"}</span>
      </div>
      
      <p className="mx-auto mt-4 max-w-2xl font-serif text-lg italic text-white/60 leading-relaxed">
        {/* Timestamp 0:47 from your video */}
        "...it is often the small steps, not the giant leaps, that bring about the most lasting change."
      </p>
      <p className="mt-2 text-sm text-white/40 tracking-wider uppercase">— Queen Elizabeth II</p>

      {/* Countdown timer */}
      <div className="mx-auto mt-10 max-w-xl">
        <div className="flex items-center justify-center gap-2 text-white/60">
          <Clock className="h-4 w-4" />
          <span className="text-sm">New problem in</span>
        </div>
        <div className="mt-3 flex justify-center gap-3">
          <TimeBlock value={timeLeft.days} label="Days" />
          <TimeSeparator />
          <TimeBlock value={timeLeft.hours} label="Hours" />
          <TimeSeparator />
          <TimeBlock value={timeLeft.minutes} label="Min" />
          <TimeSeparator />
          <TimeBlock value={timeLeft.seconds} label="Sec" />
        </div>
      </div>
    </section>
  )
}

function TimeBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="min-w-16 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md px-4 py-3">
        <span className="font-code text-2xl font-semibold tabular-nums text-white">
          {value.toString().padStart(2, "0")}
        </span>
      </div>
      <span className="font-code mt-1 text-xs text-white/40 uppercase tracking-wider">{label}</span>
    </div>
  )
}

function TimeSeparator() {
  return <span className="text-2xl font-light text-white/20 self-start mt-3">:</span>
}