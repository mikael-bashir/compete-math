"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  PROBLEM_TOPICS, DIFFICULTY_LEVELS, KNOWLEDGE_LEVELS,
} from "../lib/constants/site";
import { LevelInfo } from "../lib/components/level-info";
import { CertifiedInfo } from "../lib/components/certified-info";
import { StaticArtBackground } from "../lib/components/home/static-art-background";

interface PracticeProblem {
  id: number;
  title: string;
  subtitle: string | null;
  difficulty: string | null;
  topic: string;
  knowledge: string | null;
  hasProof?: boolean;
  isSolved: boolean;
}

// Difficulty as a single warm heat ramp (pale gold → gold → orange → red) so it
// escalates without introducing off-palette colours.
const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "text-amber-100/80 border-white/10 bg-white/[0.04]",
  Medium: "text-amber-300 border-amber-400/25 bg-amber-500/10",
  Hard: "text-orange-400 border-orange-400/25 bg-orange-500/10",
  Insane: "text-red-400 border-red-400/25 bg-red-500/10",
};

// How many cards per page. The page renders exactly one page at a time, so the
// DOM only ever holds PAGE_SIZE cards — keeps the paint cheap even for a big pool.
const PAGE_SIZE = 48;

// Build the pager token list: always page 1 + last page, a window around the
// current page, and "…" for the gaps. e.g. [1, "…", 4, 5, 6, "…", 20].
function pageItems(current: number, totalPages: number): (number | "…")[] {
  const delta = 1; // neighbours shown on each side of the current page
  const pages: number[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    }
  }
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const i of pages) {
    if (prev) {
      if (i - prev === 2) out.push(prev + 1); // single gap ⇒ show the number
      else if (i - prev > 2) out.push("…");
    }
    out.push(i);
    prev = i;
  }
  return out;
}

const PAGER_BTN =
  "font-code text-[13px] min-w-[34px] h-[34px] px-2 rounded-lg border transition-colors inline-flex items-center justify-center";

function Pager({
  page,
  totalPages,
  busy,
  onGo,
}: {
  page: number;
  totalPages: number;
  busy: boolean;
  onGo: (p: number) => void;
}) {
  const [jump, setJump] = useState("");
  const submitJump = () => {
    const n = Number.parseInt(jump, 10);
    if (Number.isFinite(n)) onGo(n);
    setJump("");
  };
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 mt-12">
      <button
        onClick={() => onGo(page - 1)}
        disabled={busy || page <= 1}
        aria-label="Previous page"
        className={`${PAGER_BTN} border-white/10 text-white/60 hover:bg-white/[0.05] hover:text-white disabled:opacity-30`}
      >
        ‹
      </button>
      {pageItems(page, totalPages).map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="font-code text-white/30 px-1 select-none">…</span>
        ) : (
          <button
            key={it}
            onClick={() => onGo(it)}
            disabled={busy}
            className={`${PAGER_BTN} disabled:opacity-50 ${
              it === page
                ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                : "border-white/10 text-white/60 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            {it}
          </button>
        ),
      )}
      <button
        onClick={() => onGo(page + 1)}
        disabled={busy || page >= totalPages}
        aria-label="Next page"
        className={`${PAGER_BTN} border-white/10 text-white/60 hover:bg-white/[0.05] hover:text-white disabled:opacity-30`}
      >
        ›
      </button>
      {/* Jump to an arbitrary page. */}
      <span className="inline-flex items-center gap-1 ml-2">
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jump}
          onChange={(e) => setJump(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitJump(); }}
          placeholder="Go to"
          aria-label="Go to page"
          className="font-code w-[72px] bg-[#141013] border border-white/10 rounded px-2 h-[34px] text-[12px] text-white/70 focus:outline-none focus:border-amber-400/50"
        />
        <button
          onClick={submitJump}
          disabled={busy || !jump}
          className={`${PAGER_BTN} border-white/10 text-white/60 hover:bg-white/[0.05] hover:text-white disabled:opacity-40`}
        >
          Go
        </button>
      </span>
    </nav>
  );
}

export default function PracticePage() {
  const [problems, setProblems] = useState<PracticeProblem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [knowledge, setKnowledge] = useState("");

  // Fetch one page at the given offset for the current filters.
  const fetchPage = useCallback(
    async (offset: number) => {
      const qs = new URLSearchParams();
      if (topic) qs.set("topic", topic);
      if (difficulty) qs.set("difficulty", difficulty);
      if (knowledge) qs.set("knowledge", knowledge);
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(offset));
      const res = await fetch(`/api/practice?${qs.toString()}`);
      const data = await res.json();
      return {
        items: Array.isArray(data?.items) ? (data.items as PracticeProblem[]) : [],
        total: typeof data?.total === "number" ? data.total : 0,
      };
    },
    [topic, difficulty, knowledge],
  );

  // Load one 1-indexed page, replacing the current view.
  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const { items, total } = await fetchPage((targetPage - 1) * PAGE_SIZE);
        setProblems(items);
        setTotal(total);
        setPage(targetPage);
      } finally {
        setLoading(false);
      }
    },
    [fetchPage],
  );

  // Filters changed ⇒ jump back to page one (load's identity tracks the filters).
  useEffect(() => {
    load(1);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = useCallback(
    (p: number) => {
      if (!Number.isFinite(p)) return;
      const clamped = Math.min(Math.max(Math.trunc(p), 1), totalPages);
      if (clamped === page) return;
      load(clamped);
      // Bring the top of the list into view after switching pages.
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [load, totalPages, page],
  );

  // Group by topic for the "sorted by concept" presentation.
  const grouped = useMemo(() => {
    const map = new Map<string, PracticeProblem[]>();
    for (const p of problems) {
      const key = p.topic || "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [problems]);

  const solvedCount = problems.filter((p) => p.isSolved).length;
  const hasFilters = topic || difficulty || knowledge;

  const selectCls =
    "font-code bg-[#141013]/70 backdrop-blur-sm border border-white/10 rounded px-2 py-1 text-[12px] text-white/70 focus:outline-none focus:border-amber-400/50";

  return (
    <div className="relative min-h-screen overflow-hidden pt-24 pb-24">
      <StaticArtBackground />
      <div className="relative z-10 max-w-6xl mx-auto px-6">

        {/* Header */}
        <div className="mb-10">
          <p className="font-code text-xs tracking-[0.3em] uppercase text-amber-400/80 mb-2">
            // practice
          </p>
          <h1 className="font-code text-4xl md:text-5xl font-bold text-white!">
            Training Grounds
          </h1>
          <p className="text-white/50 mt-3 max-w-xl text-sm leading-relaxed">
            Freshly generated problems, sorted by concept. Filter by difficulty and
            knowledge level, then grind your way up the ranks.
          </p>
          {problems.length > 0 && (
            <p className="font-code text-xs text-amber-300/70 mt-3">
              {solvedCount}/{problems.length} solved on this page
              {totalPages > 1 && (
                <span className="text-white/35"> · page {page} of {totalPages} · {total} total</span>
              )}
            </p>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className={selectCls}>
            <option value="">All topics</option>
            {PROBLEM_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={selectCls}>
            <option value="">Any difficulty</option>
            {DIFFICULTY_LEVELS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="inline-flex items-center gap-1.5">
            <select value={knowledge} onChange={(e) => setKnowledge(e.target.value)} className={selectCls}>
              <option value="">Any level</option>
              {KNOWLEDGE_LEVELS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <LevelInfo />
          </span>
          {hasFilters && (
            <button
              onClick={() => { setTopic(""); setDifficulty(""); setKnowledge(""); }}
              className="font-code text-[13px] text-white/40 hover:text-white transition-colors ml-auto"
            >
              Reset
            </button>
          )}
        </div>

        {/* Grouped problem list */}
        {loading && problems.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-white/40">
            <Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading problems…
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-white/10 rounded-2xl">
            <p className="font-code text-white/40">
              No problems match these filters yet — the generator refills the pool weekly.
            </p>
          </div>
        ) : (
          <>
          <div className={`space-y-12 ${loading ? "opacity-50 transition-opacity pointer-events-none" : "transition-opacity"}`}>
            {grouped.map(([topicName, list]) => (
              <section key={topicName}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="font-code text-sm! text-white/80! font-medium uppercase tracking-wider">{topicName}</h2>
                  <span className="font-code text-xs text-white/25">{list.length}</span>
                  <div className="h-px flex-1 bg-white/[0.07]" />
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {list.map((p) => (
                    <Link
                      key={p.id}
                      href={`/practice/problems/${p.id}`}
                      className={`rounded-xl border px-4 py-3 no-underline transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
                        p.isSolved
                          ? "border-amber-400/25 bg-amber-500/[0.05] hover:border-amber-400/45"
                          : "border-white/[0.08] bg-[#141013]/70 hover:bg-[#1a1315] hover:border-white/15"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <h3 className="font-code text-[13px] font-medium text-white! leading-snug">
                          {p.title}
                        </h3>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {p.hasProof && <CertifiedInfo interactive={false} />}
                          {p.isSolved && (
                            <span className="font-code text-[10px] uppercase tracking-wider text-amber-300">solved</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-code text-[10px] uppercase tracking-wider">
                        {p.difficulty && (
                          <span className={`px-1.5 py-0.5 rounded border ${DIFFICULTY_COLORS[p.difficulty] || "text-white/50 border-white/10 bg-white/5"}`}>
                            {p.difficulty}
                          </span>
                        )}
                        {p.knowledge && p.knowledge !== "None" && (
                          <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-white/45">
                            {p.knowledge}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Numbered page selector — only when the pool spans multiple pages. */}
          {totalPages > 1 && (
            <Pager page={page} totalPages={totalPages} busy={loading} onGo={goToPage} />
          )}
          </>
        )}
      </div>
    </div>
  );
}
