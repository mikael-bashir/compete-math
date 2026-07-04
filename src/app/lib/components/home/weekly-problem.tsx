"use client"

import { useState, useEffect } from "react"
import { ArrowRight, CheckCircle2, Lightbulb, Sparkles, Loader2, RotateCcw, Lock, Archive } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useSession, signIn } from "next-auth/react"

interface Problem {
  id: number
  title: string
  subtitle: string
  content: string
  difficulty: string
  points: number
  hint?: string
  isSolved: boolean
}

export function WeeklyProblem() {
  const { data: session, status: authStatus } = useSession()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [loading, setLoading] = useState(true)
  const [showHint, setShowHint] = useState(false)
  const [answer, setAnswer] = useState("")
  const [status, setStatus] = useState<'idle' | 'submitting' | 'wrong' | 'correct'>('idle')

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res = await fetch('/api/problems/latest')
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        setProblem(data)
        if (data.isSolved) setStatus('correct')
      } catch (error) {
        console.error("Error loading weekly problem:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchLatest()
  }, [])

  const handleSubmit = async () => {
    if (!problem || !answer) return
    setStatus('submitting')

    try {
      const res = await fetch(`/api/problems/${problem.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempt: answer })
      })

      const result = await res.json()

      if (result.correct || (result.success === false && result.message === 'Question was already solved')) {
        setStatus('correct')
      } else {
        setStatus('wrong')
      }
    } catch (error) {
      console.error(error)
      setStatus('idle')
    }
  }

  if (loading || authStatus === "loading") {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#170a0e]/70 backdrop-blur-xl">
        <Loader2 className="h-8 w-8 animate-spin text-white/50" />
      </div>
    )
  }

  if (!problem) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#170a0e]/70 p-8 text-center text-white/60 backdrop-blur-xl">
        Unable to load the problem of the week.
      </div>
    )
  }

  const isAuthenticated = authStatus === "authenticated"

  return (
    <div className="relative rounded-2xl border border-white/[0.08] bg-[#170a0e]/70 backdrop-blur-xl transition-all overflow-hidden w-full max-w-full shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-rose-300/40 to-transparent" />
      <div className="p-6 md:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <p className="font-code text-[10px] tracking-[0.3em] uppercase text-rose-300/70 mb-3">
                // problem of the week
              </p>
              {/* Using P tag instead of H tag for strict styling control */}
              <p className="font-code text-2xl md:text-3xl font-semibold text-white wrap-break-words leading-tight">
                {problem.title}
              </p>
              <p className="mt-2 text-sm text-white/60">{problem.subtitle}</p>
            </div>
            
            {/* Badges: Dark on White for readability */}
            <div className="flex items-center gap-2 self-start shrink-0">
              {problem.difficulty && (
                <div className="font-code rounded-md border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-[11px] uppercase tracking-wider text-rose-200 capitalize">
                  {problem.difficulty}
                </div>
              )}
              <div className="font-code rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] uppercase tracking-wider text-amber-200 whitespace-nowrap">
                {problem.points} pts
              </div>
            </div>
          </div>
        </div>

        {/* Problem statement */}
        <div className="mt-7 rounded-xl bg-black/30 border border-white/[0.06] p-6 overflow-hidden">
          <div className="prose prose-invert max-w-none wrap-break-words">
            <ReactMarkdown 
              remarkPlugins={[remarkMath]} 
              rehypePlugins={[rehypeKatex]} 
              components={{
                // standard paragraph
                p: ({node, ...props}) => <p className="text-white/90 text-lg leading-relaxed mb-6 last:mb-0 font-light" {...props} />,
                
                // span
                span: ({node, ...props}) => <span className="text-white/90" {...props} />,
                
                // math block
                div: ({node, className, ...props}) => {
                  if (className?.includes('math-display')) {
                    return <div className="my-6 text-center text-xl text-white overflow-x-auto py-2" {...props} />
                  }
                  return <div className={className} {...props} />
                },

                // --- OVERRIDES TO FIX BLACK TEXT ---

                // Force Headers to render as P tags with white text and bold styling
                h1: ({node, ...props}) => <p className="text-white text-2xl font-bold mt-8 mb-4" {...props} />,
                h2: ({node, ...props}) => <p className="text-white text-xl font-bold mt-8 mb-4" {...props} />,
                h3: ({node, ...props}) => <p className="text-white text-lg font-bold mt-6 mb-3" {...props} />,
                h4: ({node, ...props}) => <p className="text-white text-base font-bold mt-4 mb-2" {...props} />,

                // Force Lists to use white text
                ul: ({node, ...props}) => <ul className="list-disc list-outside ml-6 mb-6 text-white/90" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-6 mb-6 text-white/90" {...props} />,
                li: ({node, ...props}) => <li className="mb-2 pl-1 marker:text-white/50" {...props} />,

                // Force Bold/Italic to stay white
                strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                em: ({node, ...props}) => <em className="italic text-white/90" {...props} />,
              }}
            >
              {problem.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Hint section */}
        {problem.hint && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowHint(!showHint)}
              className="flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white group"
            >
              <Lightbulb className="h-4 w-4 group-hover:text-yellow-400 transition-colors" />
              <span>{showHint ? "Hide hint" : "Show hint"}</span>
            </button>
            {showHint && (
              <div className="mt-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 animate-in fade-in slide-in-from-top-2">
                <p className="text-sm text-white/80">
                  {problem.hint}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Answer input area */}
        <div className="mt-8">
          {status === 'correct' ? (
            <div className="flex w-full items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-emerald-400">
               <div className="flex items-center gap-3 font-medium text-lg">
                 <CheckCircle2 className="h-6 w-6" />
                 <span>Problem Solved!</span>
               </div>
            </div>
          ) : (
            <div className="relative">
              <label htmlFor="answer" className="sr-only">Your Answer</label>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="answer"
                  type="text"
                  value={answer}
                  disabled={status === 'submitting' || !isAuthenticated} 
                  onChange={(e) => {
                    setAnswer(e.target.value)
                    if (status === 'wrong') setStatus('idle')
                  }}
                  placeholder={isAuthenticated ? "Enter your answer..." : "Please log in to answer"}
                  className={`
                    w-full flex-1 rounded-xl border bg-black/40 px-5 py-4 text-white font-code text-sm
                    placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-rose-400/40 transition-all
                    ${status === 'wrong' ? 'border-red-500/50 focus:ring-red-500/50' : 'border-white/10'}
                    ${!isAuthenticated ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/20'}
                  `}
                />
                
                {isAuthenticated ? (
                  <Button
                    onClick={handleSubmit}
                    disabled={status === 'submitting' || !answer}
                    className={`
                      w-full sm:w-auto rounded-xl px-8 py-6 min-w-35 font-code font-semibold text-sm transition-all
                      ${status === 'wrong' 
                        ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30' 
                        : 'bg-amber-100 text-black hover:bg-amber-50 hover:scale-[1.03] active:scale-95 shadow-[0_0_30px_-8px_rgba(251,213,130,0.5)]'
                      }
                    `}
                  >
                    <span>
                      {status === 'submitting' ? (
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      ) : status === 'wrong' ? (
                        <span className="flex items-center gap-2">Retry <RotateCcw className="h-4 w-4" /></span>
                      ) : (
                        <span className="flex items-center gap-2">Submit <ArrowRight className="h-4 w-4" /></span>
                      )}
                    </span>
                  </Button>
                ) : (
                  <Button
                    onClick={() => signIn()}
                    className="w-full sm:w-auto rounded-xl px-8 py-6 min-w-35 bg-amber-100 text-black hover:bg-amber-50 hover:scale-[1.03] active:scale-95 shadow-lg font-code font-semibold text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      <span>Log In</span>
                    </span>
                  </Button>
                )}
              </div>
              
              {status === 'wrong' && (
                <p className="absolute -bottom-8 left-6 text-sm font-medium text-red-400 animate-in fade-in slide-in-from-top-1">
                  Incorrect answer. Please try again.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer: Slick Archive Link */}
        <div className="mt-8 flex justify-end pt-4 border-t border-white/5">
          <Link 
            href="/archives" 
            className="group flex items-center gap-2 text-sm font-medium text-white/40 hover:text-white transition-colors duration-300"
          >
            <span className="font-code text-xs">Rest of archives</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-all duration-300 group-hover:border-white/30 group-hover:bg-white/10">
              <ArrowRight className="h-3 w-3 -rotate-45 transition-transform duration-300 group-hover:rotate-0" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}