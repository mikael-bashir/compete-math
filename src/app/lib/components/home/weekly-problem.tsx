"use client"

import { useState, useEffect } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"

interface Problem {
  id: number
  title: string
  subtitle?: string
  content: string
  difficulty: string
  points: number
  community?: boolean
}

export function WeeklyProblem() {
  const [problem, setProblem] = useState<Problem | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/problems/latest")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setProblem(data && !data.error ? data : null))
      .catch(() => setProblem(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-white/[0.07] bg-[#141013]/85">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    )
  }

  if (!problem) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-[#141013]/85 p-8 text-center text-sm text-white/50">
        No featured problem yet — check back once the community pool fills up.
      </div>
    )
  }

  const href = problem.community ? `/community/${problem.id}` : `/practice/problems/${problem.id}`

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#141013]/85 overflow-hidden">
      <div className="p-6 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-code text-[10px] tracking-[0.3em] uppercase text-rose-300/70 mb-2">
              // problem of the week
            </p>
            <p className="font-display text-xl md:text-2xl font-semibold text-white leading-tight">
              {problem.title}
            </p>
            {problem.subtitle && (
              <p className="mt-1 text-xs text-white/40">{problem.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 font-code text-[11px] uppercase tracking-wider">
            <span className="rounded border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-rose-200">
              {problem.difficulty}
            </span>
            <span className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-amber-200 whitespace-nowrap">
              {problem.points} pts
            </span>
          </div>
        </div>

        <div className="mt-5 text-sm text-white/80 [&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_p]:my-2">
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {problem.content}
          </ReactMarkdown>
        </div>

        <div className="mt-6 pt-4 border-t border-white/[0.06] flex justify-end">
          <Link
            href={href}
            className="font-code group inline-flex items-center gap-2 rounded-lg bg-amber-100 px-5 py-2.5 text-sm font-semibold text-black transition-transform hover:scale-[1.02] active:scale-95 no-underline"
          >
            Attempt this problem
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
