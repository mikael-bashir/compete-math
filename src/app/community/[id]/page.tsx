"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft, ArrowBigUp, MessageSquare, Send, Loader2,
  CheckCircle2, XCircle, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { MathMarkdown } from "@/app/lib/components/community/math-markdown";
import { UserChip } from "@/app/lib/components/community/user-chip";

interface Answer {
  id: number;
  author_username: string;
  author_badge: string | null;
  body: string;
  created_at: string;
  votes: number;
  voted_by_me: boolean;
}

interface Comment {
  id: number;
  answer_id: number;
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
    proposed_answer: string | null;
    topic: string;
    difficulty: string;
    knowledge: string;
    status: string;
    author_username: string;
    author_badge: string | null;
    created_at: string;
    review_note: string | null;
  };
  answers: Answer[];
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
  const [answerBody, setAnswerBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});

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

  const toggleVote = async (answerId: number) => {
    if (status !== "authenticated") { toast.error("Sign in to upvote"); return; }
    // Optimistic update
    setData((d) => d && {
      ...d,
      answers: d.answers.map((a) =>
        a.id === answerId
          ? { ...a, votes: a.votes + (a.voted_by_me ? -1 : 1), voted_by_me: !a.voted_by_me }
          : a,
      ),
    });
    const res = await fetch(`/api/community/answers/${answerId}/vote`, { method: "POST" });
    if (!res.ok) { toast.error("Vote failed"); load(); }
  };

  const postAnswer = async () => {
    if (!answerBody.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/community/problems/${id}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: answerBody }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setAnswerBody("");
      toast.success("Answer posted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const postComment = async (answerId: number) => {
    const body = commentDrafts[answerId];
    if (!body?.trim()) return;
    const res = await fetch(`/api/community/answers/${answerId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      setCommentDrafts((d) => ({ ...d, [answerId]: "" }));
      load();
    } else {
      const out = await res.json().catch(() => ({}));
      toast.error(out.error || "Failed to comment");
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

  const { problem, answers, comments, viewer } = data;
  const commentsFor = (answerId: number) => comments.filter((c) => c.answer_id === answerId);

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
        <article className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8 mb-10">
          <div className="flex flex-wrap items-center gap-2 mb-4 font-code text-[11px] uppercase tracking-wider">
            <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60">{problem.topic}</span>
            <span className="px-2 py-1 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300">{problem.difficulty}</span>
            <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60">req: {problem.knowledge}</span>
          </div>
          <h1 className="font-code text-3xl md:text-4xl font-bold text-white! mb-6">{problem.title}</h1>
          <div className="text-white/85">
            <MathMarkdown>{problem.statement}</MathMarkdown>
          </div>
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/10">
            <UserChip
              username={problem.author_username}
              badgeUrl={problem.author_badge}
              subtitle={`posted ${timeAgo(problem.created_at)}`}
            />
            {viewer.isAdmin && problem.proposed_answer && (
              <div className="font-code text-xs text-white/40 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400/60" />
                proposed: <span className="text-emerald-300/80">{problem.proposed_answer}</span>
              </div>
            )}
          </div>
        </article>

        {/* Answers */}
        <div className="flex items-center gap-3 mb-6">
          <h2 className="font-code text-xl text-white! font-semibold">
            {answers.length} Answer{answers.length === 1 ? "" : "s"}
          </h2>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="space-y-6 mb-12">
          {answers.map((a) => (
            <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex gap-4">
                {/* Upvote column — upvotes only, no downvote by design */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleVote(a.id)}
                    aria-label="Upvote"
                    className={`p-1.5 rounded-lg border transition-all active:scale-90 ${
                      a.voted_by_me
                        ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
                        : "border-white/10 text-white/40 hover:text-emerald-300 hover:border-emerald-400/30"
                    }`}
                  >
                    <ArrowBigUp className="w-5 h-5" />
                  </button>
                  <span className={`font-code text-sm font-semibold ${a.voted_by_me ? "text-emerald-300" : "text-white/60"}`}>
                    {a.votes}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="mb-3">
                    <UserChip
                      username={a.author_username}
                      badgeUrl={a.author_badge}
                      size="sm"
                      subtitle={timeAgo(a.created_at)}
                    />
                  </div>
                  <div className="text-white/85">
                    <MathMarkdown>{a.body}</MathMarkdown>
                  </div>

                  {/* Comments on this answer (flat, by design) */}
                  <div className="mt-4 pt-3 border-t border-white/5">
                    <button
                      onClick={() => setOpenComments((o) => ({ ...o, [a.id]: !o[a.id] }))}
                      className="font-code inline-flex items-center gap-2 text-xs text-white/40 hover:text-emerald-300 transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {commentsFor(a.id).length} comment{commentsFor(a.id).length === 1 ? "" : "s"}
                    </button>

                    {openComments[a.id] && (
                      <div className="mt-3 space-y-3 pl-3 border-l-2 border-white/10">
                        {commentsFor(a.id).map((c) => (
                          <div key={c.id} className="text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              <UserChip username={c.author_username} badgeUrl={c.author_badge} size="sm" subtitle={timeAgo(c.created_at)} />
                            </div>
                            <p className="text-white/70 pl-8">{c.body}</p>
                          </div>
                        ))}
                        {status === "authenticated" && (
                          <div className="flex gap-2 pt-1">
                            <input
                              value={commentDrafts[a.id] || ""}
                              onChange={(e) => setCommentDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                              onKeyDown={(e) => e.key === "Enter" && postComment(a.id)}
                              placeholder="Add a comment…"
                              className="flex-1 bg-[#121a22] border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/40"
                            />
                            <button
                              onClick={() => postComment(a.id)}
                              className="px-3 rounded-md border border-white/10 text-white/50 hover:text-emerald-300 hover:border-emerald-400/30 transition-colors"
                              aria-label="Post comment"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {answers.length === 0 && problem.status === "approved" && (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
              <p className="font-code text-white/35 text-sm">No answers yet. Claim first blood.</p>
            </div>
          )}
        </div>

        {/* Post an answer */}
        {problem.status === "approved" && (
          status === "authenticated" ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="font-code text-white! font-semibold mb-4">Your Answer</h3>
              <textarea
                value={answerBody}
                onChange={(e) => setAnswerBody(e.target.value)}
                rows={5}
                placeholder={"Write your solution. Markdown + LaTeX supported: $e^{i\\pi} + 1 = 0$"}
                className="w-full bg-[#121a22] border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/50 text-sm leading-relaxed resize-y mb-4"
              />
              <div className="flex justify-end">
                <button
                  onClick={postAnswer}
                  disabled={posting || !answerBody.trim()}
                  className="font-code inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-40 text-black font-semibold text-sm transition-all active:scale-95"
                >
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Post Answer
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 rounded-xl border border-white/10 bg-white/[0.02]">
              <Link href="/auth/login" className="font-code text-emerald-300 hover:text-emerald-200 text-sm">
                Sign in to post an answer →
              </Link>
            </div>
          )
        )}
      </div>
    </div>
  );
}
