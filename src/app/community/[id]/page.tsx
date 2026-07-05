"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft, Send, Loader2, CheckCircle2, XCircle, ShieldCheck, Lock, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { MathMarkdown } from "@/app/lib/components/community/math-markdown";
import { UserChip } from "@/app/lib/components/community/user-chip";
import { LevelInfo } from "@/app/lib/components/level-info";
import { COMMUNITY_MAX_ATTEMPTS } from "@/app/lib/constants/site";

interface Comment {
  id: number;
  author_username: string;
  author_badge: string | null;
  body: string;
  created_at: string;
}

interface Detail {
  problem: {
    id: number;
    title: string;
    statement: string;
    proposed_answer?: string | null; // admin only
    topic: string;
    difficulty: string;
    knowledge: string;
    status: string;
    author_username: string;
    author_badge: string | null;
    created_at: string;
    review_note: string | null;
  };
  submission: { attemptsUsed: number; attemptsLeft: number; solved: boolean };
  solveCount: number;
  comments: Comment[];
  viewer: { username: string | null; isAdmin: boolean };
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function CommunityProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { status } = useSession();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wrong, setWrong] = useState(false); // brief incorrect flash

  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/problems/${id}`);
      if (!res.ok) { setData(null); return; }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    setWrong(false);
    try {
      const res = await fetch(`/api/community/problems/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answer.trim() }),
      });
      const out = await res.json();
      if (!res.ok) { toast.error(out.error || "Submission failed"); return; }

      setData((d) => {
        if (!d) return d;
        const newlySolved = out.solved && !d.submission.solved;
        return {
          ...d,
          solveCount: d.solveCount + (newlySolved ? 1 : 0),
          submission: {
            attemptsUsed: out.attemptsUsed ?? d.submission.attemptsUsed,
            attemptsLeft: out.attemptsLeft ?? d.submission.attemptsLeft,
            solved: out.solved ?? d.submission.solved,
          },
        };
      });

      if (out.solved) {
        toast.success("Correct — problem solved! 🎉");
        setAnswer("");
      } else if (out.noAttemptsLeft) {
        toast.error("No attempts left on this problem.");
      } else {
        setWrong(true);
        const left = out.attemptsLeft ?? 0;
        toast.error(`Not quite — ${left} attempt${left === 1 ? "" : "s"} left.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const postComment = async () => {
    if (!commentBody.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/community/problems/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      const out = await res.json();
      if (!res.ok) { toast.error(out.error || "Failed to comment"); return; }
      setCommentBody("");
      load();
    } finally {
      setPostingComment(false);
    }
  };

  const review = async (action: "approve" | "reject") => {
    const res = await fetch(`/api/community/problems/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) { toast.success(`Problem ${action}d`); load(); }
    else toast.error("Review failed");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-white/40">
        <Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-[#0a0f14] flex flex-col items-center justify-center gap-4 text-white/50">
        <p className="font-code">Problem not found (or not yet approved).</p>
        <Link href="/community" className="font-code text-emerald-300 hover:text-emerald-200 text-sm">
          ← Back to the Forge
        </Link>
      </div>
    );
  }

  const { problem, submission, solveCount, comments, viewer } = data;
  const { solved, attemptsLeft, attemptsUsed } = submission;

  return (
    <div className="min-h-screen bg-[#0a0f14] pt-24 pb-24">
      <div className="max-w-4xl mx-auto px-6">
        <Link href="/community" className="font-code inline-flex items-center gap-2 text-white/40 hover:text-emerald-300 text-sm mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Problem Forge
        </Link>

        {/* Status banner for non-approved problems */}
        {problem.status !== "approved" && (
          <div className={`mb-6 rounded-lg border px-4 py-3 font-code text-sm ${
            problem.status === "pending"
              ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
              : "border-rose-400/30 bg-rose-400/10 text-rose-200"
          }`}>
            {problem.status === "pending" ? "⧗ Pending admin review — only you (and the admin) can see this." : `Rejected${problem.review_note ? `: ${problem.review_note}` : ""}`}
            {viewer.isAdmin && problem.status === "pending" && (
              <span className="inline-flex gap-2 ml-4">
                <button onClick={() => review("approve")} className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </button>
                <button onClick={() => review("reject")} className="inline-flex items-center gap-1 px-3 py-1 rounded bg-rose-500/10 border border-rose-400/30 text-rose-300 text-xs">
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </span>
            )}
          </div>
        )}

        {/* Problem card */}
        <article className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8 mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-4 font-code text-[11px] uppercase tracking-wider">
            <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60">{problem.topic}</span>
            <span className="px-2 py-1 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300">{problem.difficulty}</span>
            {problem.knowledge && problem.knowledge !== "None" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60">
                {problem.knowledge}
                <LevelInfo align="left" />
              </span>
            )}
            <span className="ml-auto text-white/35 normal-case tracking-normal">{solveCount} solved</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-white! mb-6">{problem.title}</h1>
          <div className="text-white/85">
            <MathMarkdown>{problem.statement}</MathMarkdown>
          </div>
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/10">
            <UserChip
              username={problem.author_username}
              badgeUrl={problem.author_badge}
              subtitle={`posted ${timeAgo(problem.created_at)}`}
            />
            {viewer.isAdmin && problem.proposed_answer != null && (
              <div className="font-code text-xs text-white/40 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400/60" />
                answer: <span className="text-emerald-300/80">{problem.proposed_answer}</span>
              </div>
            )}
          </div>
        </article>

        {/* Answer box — numeric, checked in the DB, capped at 3 attempts */}
        {problem.status === "approved" && (
          <div className="mb-12">
            {status !== "authenticated" ? (
              <div className="text-center py-8 rounded-xl border border-white/10 bg-white/[0.02]">
                <Link href="/auth/login" className="font-code text-emerald-300 hover:text-emerald-200 text-sm">
                  Sign in to submit an answer →
                </Link>
              </div>
            ) : solved ? (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-6 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-300 shrink-0" />
                <div>
                  <p className="font-code text-emerald-200 font-semibold">Solved</p>
                  <p className="font-code text-xs text-emerald-300/60">You cracked this one in {attemptsUsed} attempt{attemptsUsed === 1 ? "" : "s"}.</p>
                </div>
              </div>
            ) : attemptsLeft <= 0 ? (
              <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-6 flex items-center gap-3">
                <Lock className="w-5 h-5 text-rose-300/80 shrink-0" />
                <div>
                  <p className="font-code text-rose-200 font-semibold">No attempts left</p>
                  <p className="font-code text-xs text-rose-300/50">You've used all {COMMUNITY_MAX_ATTEMPTS} attempts. Compare approaches in the discussion below.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-code text-white! font-semibold">Your Answer</h3>
                  <span className="font-code text-xs text-white/40">
                    {attemptsLeft} of {COMMUNITY_MAX_ATTEMPTS} attempt{attemptsLeft === 1 ? "" : "s"} left
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={answer}
                    onChange={(e) => { setAnswer(e.target.value); setWrong(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                    inputMode="decimal"
                    placeholder="Enter a number…"
                    className={`font-code flex-1 bg-[#121a22] border rounded-lg px-4 py-3 text-white placeholder:text-white/25 focus:outline-none transition-colors ${
                      wrong ? "border-rose-400/60" : "border-white/10 focus:border-emerald-400/50"
                    }`}
                  />
                  <button
                    onClick={submit}
                    disabled={submitting || !answer.trim()}
                    className="font-code inline-flex items-center gap-2 px-6 rounded-lg bg-amber-100 hover:bg-amber-50 disabled:opacity-40 text-black font-semibold text-sm transition-all active:scale-95"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit
                  </button>
                </div>
                <p className="font-code text-[11px] text-white/30 mt-3">
                  A single numeric answer, checked instantly. You get {COMMUNITY_MAX_ATTEMPTS} attempts.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Discussion — talk through how to tackle the problem */}
        <div className="flex items-center gap-3 mb-5">
          <MessageSquare className="w-4 h-4 text-white/40" />
          <h2 className="font-display text-lg text-white! font-semibold">
            Discussion <span className="text-white/30 font-normal">· {comments.length}</span>
          </h2>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <p className="font-code text-xs text-white/35 mb-5 -mt-2">
          Discuss approaches and compare methods. Please don't post the final answer.
        </p>

        <div className="space-y-5 mb-8">
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <div className="mb-2">
                <UserChip username={c.author_username} badgeUrl={c.author_badge} size="sm" subtitle={timeAgo(c.created_at)} />
              </div>
              <div className="text-white/85 text-sm">
                <MathMarkdown>{c.body}</MathMarkdown>
              </div>
            </div>
          ))}
          {comments.length === 0 && (
            <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
              <p className="font-code text-white/35 text-sm">No discussion yet — start the conversation.</p>
            </div>
          )}
        </div>

        {status === "authenticated" ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={3}
              placeholder={"Share your approach. Markdown + LaTeX supported: $\\gcd(a,b)$"}
              className="w-full bg-[#121a22] border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/50 text-sm leading-relaxed resize-y mb-3"
            />
            <div className="flex justify-end">
              <button
                onClick={postComment}
                disabled={postingComment || !commentBody.trim()}
                className="font-code inline-flex items-center gap-2 px-5 py-2 rounded-lg border border-white/10 text-white/70 hover:text-emerald-200 hover:border-emerald-400/30 disabled:opacity-40 text-sm transition-all active:scale-95"
              >
                {postingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Post to discussion
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 rounded-xl border border-white/10 bg-white/[0.02]">
            <Link href="/auth/login" className="font-code text-emerald-300 hover:text-emerald-200 text-sm">
              Sign in to join the discussion →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
