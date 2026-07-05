"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, Send, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MathMarkdown } from "../lib/components/community/math-markdown";
import { UserChip } from "../lib/components/community/user-chip";
import {
  PROBLEM_TOPICS, DIFFICULTY_LEVELS, KNOWLEDGE_LEVELS, isAdminEmail,
} from "../lib/constants/site";
import { LevelInfo } from "../lib/components/level-info";

interface CommunityProblem {
  id: number;
  title: string;
  statement: string;
  topic: string;
  difficulty: string;
  knowledge: string;
  status: string;
  author_username: string;
  author_badge: string | null;
  created_at: string;
  review_note: string | null;
  solve_count: number;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  Medium: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  Hard: "text-rose-300 border-rose-400/30 bg-rose-400/10",
  Insane: "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-400/10",
};

type Tab = "browse" | "drafts" | "review";

export default function CommunityPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = isAdminEmail(session?.user?.email);

  const [tab, setTab] = useState<Tab>("browse");
  const [problems, setProblems] = useState<CommunityProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicFilter, setTopicFilter] = useState<string>("");
  const [showDraft, setShowDraft] = useState(false);

  // Draft form state
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [proposedAnswer, setProposedAnswer] = useState("");
  const [topic, setTopic] = useState<string>(PROBLEM_TOPICS[0]);
  const [difficulty, setDifficulty] = useState<string>("Medium");
  const [knowledge, setKnowledge] = useState<string>("Level 2");
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/community/problems?";
      if (tab === "browse") url += `status=approved`;
      if (tab === "drafts") url += `status=pending&mine=1`;
      if (tab === "review") url += `status=pending`;
      if (topicFilter) url += `&topic=${encodeURIComponent(topicFilter)}`;
      const res = await fetch(url);
      const data = await res.json();
      setProblems(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load problems");
    } finally {
      setLoading(false);
    }
  }, [tab, topicFilter]);

  useEffect(() => { load(); }, [load]);

  const submitDraft = async () => {
    if (!title.trim() || !statement.trim()) {
      toast.error("A title and a problem statement are required.");
      return;
    }
    if (!proposedAnswer.trim() || !Number.isFinite(Number(proposedAnswer.trim()))) {
      toast.error("A single numeric answer is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/community/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, statement, proposedAnswer, topic, difficulty, knowledge }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Draft submitted for review!");
      setShowDraft(false);
      setTitle(""); setStatement(""); setProposedAnswer("");
      setTab("drafts");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const reviewAction = async (id: number, action: "approve" | "reject") => {
    try {
      const res = await fetch(`/api/community/problems/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
      toast.success(action === "approve" ? "Problem approved ✓" : "Problem rejected");
      load();
    } catch {
      toast.error("Review action failed");
    }
  };

  const tabs = useMemo(() => {
    const base: { id: Tab; label: string }[] = [{ id: "browse", label: "Browse" }];
    if (status === "authenticated") base.push({ id: "drafts", label: "My Drafts" });
    if (isAdmin) base.push({ id: "review", label: "Review Queue" });
    return base;
  }, [status, isAdmin]);

  return (
    <div className="min-h-screen bg-[#0a0f14] pt-24 pb-24">
      <div className="max-w-6xl mx-auto px-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <p className="font-code text-xs tracking-[0.3em] uppercase text-emerald-400/80 mb-2">
              // community
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-white!">
              Problem Forge
            </h1>
            <p className="text-white/50 mt-3 max-w-xl text-sm leading-relaxed">
              Draft original problems, submit them for review, and battle over the
              cleanest solutions. Approved problems join the community arena.
            </p>
          </div>
          <button
            onClick={() => {
              if (status !== "authenticated") { router.push("/auth/login"); return; }
              setShowDraft(true);
            }}
            className="font-code px-4 py-2 rounded-md bg-amber-100 hover:bg-amber-50 text-black font-medium text-[13px] transition-colors active:scale-95 self-start"
          >
            Draft a Problem
          </button>
        </div>

        {/* Tabs + topic filter */}
        <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-white/10 pb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`font-code px-2.5 py-1 rounded text-[12px] transition-colors ${
                tab === t.id
                  ? "bg-white/10 text-white"
                  : "text-white/45 hover:text-white hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="ml-auto font-code bg-[#121a22] border border-white/10 rounded px-2 py-1 text-[12px] text-white/70 focus:outline-none focus:border-emerald-400/50"
          >
            <option value="">All topics</option>
            {PROBLEM_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Problem grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-white/40">
            <Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading problems…
          </div>
        ) : problems.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-white/10 rounded-2xl">
            <p className="font-code text-white/40">
              {tab === "browse" && "No approved problems yet — be the first to forge one."}
              {tab === "drafts" && "You have no pending drafts."}
              {tab === "review" && "Review queue is empty. All clear, admin."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {problems.map((p) => (
              <div
                key={p.id}
                className="rounded-md border border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.04] hover:border-white/[0.12] transition-colors"
              >
                {/* Whole card is the link — a single thin full-width row */}
                <Link
                  href={`/community/${p.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 no-underline"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="font-code text-[13px] font-medium text-white! truncate">
                      {p.title}
                    </span>
                    <span className={`font-code shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${DIFFICULTY_COLORS[p.difficulty] || DIFFICULTY_COLORS.Medium}`}>
                      {p.difficulty}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0 font-code text-[11px] text-white/35">
                    <UserChip username={p.author_username} badgeUrl={p.author_badge} size="sm" />
                    <span className="hidden sm:inline whitespace-nowrap">
                      {p.topic} · {p.solve_count} solved
                    </span>
                  </span>
                </Link>

                {tab === "review" && (
                  <div className="flex gap-2 px-4 pb-2.5">
                    <button
                      onClick={() => reviewAction(p.id, "approve")}
                      className="font-code flex-1 py-1 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-xs hover:bg-emerald-500/25 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => reviewAction(p.id, "reject")}
                      className="font-code flex-1 py-1 rounded bg-rose-500/10 border border-rose-400/30 text-rose-300 text-xs hover:bg-rose-500/20 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {tab === "drafts" && (
                  <p className="font-code px-4 pb-2 text-[11px] text-amber-300/70">
                    awaiting admin review
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Draft modal with live preview ---- */}
      {showDraft && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 md:p-10">
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0d141b] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="font-code text-lg text-white! font-semibold">Draft a Problem</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreview(!preview)}
                  className={`font-code inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs border transition-colors ${
                    preview ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200" : "border-white/10 text-white/60 hover:text-white"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" /> {preview ? "Editing preview" : "Preview"}
                </button>
                <button onClick={() => setShowDraft(false)} className="text-white/50 hover:text-white p-1.5">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Problem title — e.g. The Impossible Staircase"
                className="font-code w-full bg-[#121a22] border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/50 text-sm"
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "Topic", value: topic, set: setTopic, options: PROBLEM_TOPICS, info: false },
                  { label: "Difficulty", value: difficulty, set: setDifficulty, options: DIFFICULTY_LEVELS, info: false },
                  { label: "Level", value: knowledge, set: setKnowledge, options: KNOWLEDGE_LEVELS, info: true },
                ].map((f) => (
                  <label key={f.label} className="flex flex-col gap-1.5">
                    <span className="font-code text-[10px] uppercase tracking-widest text-white/40 inline-flex items-center gap-1.5">
                      {f.label}
                      {f.info && <LevelInfo align="left" />}
                    </span>
                    <select
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      className="font-code bg-[#121a22] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 focus:outline-none focus:border-emerald-400/50"
                    >
                      {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              {preview ? (
                <div className="min-h-[180px] rounded-lg border border-emerald-400/20 bg-[#0a1015] p-5 text-white/90">
                  {statement.trim() ? (
                    <MathMarkdown>{statement}</MathMarkdown>
                  ) : (
                    <p className="text-white/30 text-sm font-code">Nothing to preview yet…</p>
                  )}
                </div>
              ) : (
                <textarea
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  rows={8}
                  placeholder={"State your problem. Markdown + LaTeX supported:\n\nProve that $a^2 + b^2 \\geq 2ab$ for all reals $a, b$."}
                  className="w-full bg-[#121a22] border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/50 text-sm leading-relaxed resize-y"
                />
              )}

              <input
                value={proposedAnswer}
                onChange={(e) => setProposedAnswer(e.target.value)}
                inputMode="decimal"
                placeholder="The answer — a single number (checked when solvers submit)"
                className="w-full bg-[#121a22] border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/50 text-sm"
              />

              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-white/35 font-code">
                  Submitted drafts are reviewed by an admin before going live.
                </p>
                <button
                  onClick={submitDraft}
                  disabled={submitting}
                  className="font-code inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-sm transition-all active:scale-95"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit for review
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
