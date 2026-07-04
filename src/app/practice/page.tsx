"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2, CheckCircle2, Circle, SlidersHorizontal, Swords, RotateCcw,
} from "lucide-react";
import {
  PROBLEM_TOPICS, DIFFICULTY_LEVELS, KNOWLEDGE_LEVELS,
} from "../lib/constants/site";

interface PracticeProblem {
  id: number;
  title: string;
  subtitle: string | null;
  difficulty: string | null;
  topic: string;
  knowledge: string;
  isSolved: boolean;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  Medium: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  Hard: "text-rose-300 border-rose-400/30 bg-rose-400/10",
  Insane: "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-400/10",
};

export default function PracticePage() {
  const [problems, setProblems] = useState<PracticeProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [knowledge, setKnowledge] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (topic) qs.set("topic", topic);
      if (difficulty) qs.set("difficulty", difficulty);
      if (knowledge) qs.set("knowledge", knowledge);
      const res = await fetch(`/api/practice?${qs.toString()}`);
      const data = await res.json();
      setProblems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [topic, difficulty, knowledge]);

  useEffect(() => { load(); }, [load]);

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
    "font-code bg-[#121a22] border border-white/10 rounded-md px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-emerald-400/50";

  return (
    <div className="min-h-screen bg-[#0a0f14] pt-24 pb-24">
      <div className="max-w-6xl mx-auto px-6">

        {/* Header */}
        <div className="mb-10">
          <p className="font-code text-xs tracking-[0.3em] uppercase text-emerald-400/80 mb-2">
            // practice
          </p>
          <h1 className="font-code text-4xl md:text-5xl font-bold text-white!">
            Training Grounds
          </h1>
          <p className="text-white/50 mt-3 max-w-xl text-sm leading-relaxed">
            Freshly generated problems, sorted by concept. Filter by difficulty and
            required knowledge, then grind your way up the ranks.
          </p>
          {problems.length > 0 && (
            <p className="font-code text-xs text-emerald-300/70 mt-3">
              {solvedCount}/{problems.length} solved in current view
            </p>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-10 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <SlidersHorizontal className="w-4 h-4 text-white/40" />
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className={selectCls}>
            <option value="">All topics</option>
            {PROBLEM_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={selectCls}>
            <option value="">Any difficulty</option>
            {DIFFICULTY_LEVELS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={knowledge} onChange={(e) => setKnowledge(e.target.value)} className={selectCls}>
            <option value="">Any knowledge</option>
            {KNOWLEDGE_LEVELS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          {hasFilters && (
            <button
              onClick={() => { setTopic(""); setDifficulty(""); setKnowledge(""); }}
              className="font-code inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>

        {/* Grouped problem list */}
        {loading ? (
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
          <div className="space-y-12">
            {grouped.map(([topicName, list]) => (
              <section key={topicName}>
                <div className="flex items-center gap-3 mb-5">
                  <Swords className="w-5 h-5 text-emerald-400/70" />
                  <h2 className="font-code text-xl text-white! font-semibold">{topicName}</h2>
                  <span className="font-code text-xs text-white/30">{list.length} problem{list.length === 1 ? "" : "s"}</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {list.map((p) => (
                    <Link
                      key={p.id}
                      href={`/archives/problems/${p.id}`}
                      className="group rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5 hover:border-emerald-400/30 transition-all hover:shadow-[0_8px_32px_rgba(16,185,129,0.08)] no-underline"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-code text-sm font-semibold text-white! group-hover:text-emerald-200! transition-colors leading-snug">
                          {p.title}
                        </h3>
                        {p.isSolved
                          ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-label="Solved" />
                          : <Circle className="w-4 h-4 shrink-0 text-white/15" aria-label="Unsolved" />}
                      </div>
                      {p.subtitle && (
                        <p className="text-white/45 text-xs leading-relaxed line-clamp-2 mb-3">{p.subtitle}</p>
                      )}
                      <div className="flex items-center gap-2 font-code text-[10px] uppercase tracking-wider">
                        {p.difficulty && (
                          <span className={`px-2 py-0.5 rounded border ${DIFFICULTY_COLORS[p.difficulty] || "text-white/50 border-white/10 bg-white/5"}`}>
                            {p.difficulty}
                          </span>
                        )}
                        {p.knowledge !== "None" && (
                          <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-white/50">
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
        )}
      </div>
    </div>
  );
}
