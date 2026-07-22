'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronDown, Timer, Loader2, Hexagon, Search, Globe, Check, CalendarDays, Users, RefreshCw
} from 'lucide-react';
import Image from 'next/image';
import { StaticArtBackground } from '../lib/components/home/static-art-background';
import { flagEmoji, countryName } from '../lib/data/countries';
import { PRESTIGE_TITLE_CLASS, prestigeTitleStyle } from '../lib/utils/prestige';

interface ProblemOption {
  id: number;
  title: string;
  subtitle?: string;
  difficulty?: string;
  isSolved?: boolean;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  badgeId: string | null;
  noBorder?: boolean;
  title: string;
  titleColorFrom?: string | null;
  titleColorTo?: string | null;
  titleTextColor?: string | null;
  solvedAt: string;
  attempts: number;
  country: string | null;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: 'bg-emerald-500',
  Medium: 'bg-amber-400',
  Hard: 'bg-orange-500',
  Insane: 'bg-red-500',
};

// "12 Jul 2026 · 14:32" — compact, unambiguous, sorts visually by eye
const formatSolved = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
};

const rankClass = (rank: number) =>
  rank === 1 ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]' :
  rank === 2 ? 'text-slate-300' :
  rank === 3 ? 'text-amber-600' :
  'text-slate-600';

// --- SEARCHABLE PROBLEM SELECTOR (built for a 200+ and growing library) ---
function ProblemSelector({
  problems,
  selectedId,
  onSelect,
}: {
  problems: ProblemOption[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = problems.find(p => p.id === selectedId);

  // Newest problems first; filter on number, title and subtitle.
  const filtered = useMemo(() => {
    const sorted = [...problems].sort((a, b) => b.id - a.id);
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.subtitle || '').toLowerCase().includes(q) ||
      String(p.id).includes(q)
    );
  }, [problems, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative z-50 w-full md:w-105">
      <button
        onClick={() => { setOpen(!open); setQuery(''); }}
        disabled={problems.length === 0}
        className="flex w-full items-center gap-3 bg-[#0a0a0a] border border-[#333] hover:border-amber-700/60 px-4 py-2.5 rounded-xl transition-all justify-between group disabled:opacity-50"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {selected && (
            <span className="shrink-0 font-mono text-[11px] text-amber-500/80">#{selected.id}</span>
          )}
          <span className="font-medium text-slate-200 truncate text-sm">
            {selected?.title || 'Loading problems...'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-full bg-[#0a0a0a] border border-[#333] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1f1f1f] bg-[#0d0d0d]">
            <Search className="w-4 h-4 text-slate-600 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${problems.length} problems...`}
              className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none"
            />
          </div>
          <div className="max-h-80 overflow-y-auto overscroll-contain">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); setOpen(false); }}
                className="flex w-full items-center gap-3 px-3 py-2 hover:bg-[#151515] cursor-pointer text-left transition-colors border-b border-[#141414] last:border-0 group"
              >
                <span className="shrink-0 w-10 font-mono text-[11px] text-slate-600 group-hover:text-amber-500/80 text-right">
                  #{p.id}
                </span>
                <span
                  className={`shrink-0 w-1.5 h-1.5 rounded-full ${DIFFICULTY_COLORS[p.difficulty || ''] || 'bg-slate-700'}`}
                  title={p.difficulty}
                />
                <span className={`flex-1 truncate text-sm ${p.id === selectedId ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-200'}`}>
                  {p.title}
                </span>
                {p.isSolved && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500/80" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-slate-600">
                No problems match &ldquo;{query}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const [problems, setProblems] = useState<ProblemOption[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<number | null>(null);
  const [problemTitle, setProblemTitle] = useState<string>('');

  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);

  const loadLeaderboard = async (id: number | 'latest') => {
    setLoadingLeaderboard(true);
    try {
      const res = await fetch(`/api/leaderboard/${id}`);
      if (!res.ok) throw new Error('Failed to fetch leaderboard');
      const json = await res.json();
      setLeaderboardData(json.leaderboard || []);
      if (json.problem) {
        setSelectedProblem(json.problem.id);
        setProblemTitle(json.problem.title || '');
      }
    } catch (e) {
      console.error(e);
      setLeaderboardData([]);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  // Full library for the selector + default to the newest board with entries —
  // the page never opens on an empty hall.
  useEffect(() => {
    fetch('/api/problems')
      .then(res => res.ok ? res.json() : [])
      .then(json => Array.isArray(json) && setProblems(json))
      .catch(console.error);
    loadLeaderboard('latest');
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-300 font-sans selection:bg-amber-500/30">
      <StaticArtBackground />

      <div className="relative z-10 container max-w-6xl mx-auto px-4 py-12">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4 mt-10">
          <ProblemSelector
            problems={problems}
            selectedId={selectedProblem}
            onSelect={(id) => loadLeaderboard(id)}
          />
          {!loadingLeaderboard && (
            <div className="flex flex-col items-start md:items-end gap-1.5">
              {leaderboardData.length > 0 && (
                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 uppercase tracking-widest">
                  <Users size={13} />
                  {leaderboardData.length} contender{leaderboardData.length === 1 ? '' : 's'}
                  {leaderboardData.length === 100 && ' (top 100)'}
                </div>
              )}
              <div
                className="flex items-center gap-2 text-[11px] font-mono text-slate-400 uppercase tracking-widest"
                title="Solves made today join the board at the next refresh"
              >
                <RefreshCw size={11} />
                Refreshes daily · 00:00 UTC
              </div>
            </div>
          )}
        </div>

        {/* LOADING STATE */}
        {loadingLeaderboard && (
           <div className="flex flex-col items-center justify-center py-20 opacity-50">
             <Loader2 className="animate-spin w-8 h-8 text-amber-600 mb-4" />
             <p className="text-sm font-mono text-amber-800">CONSULTING ARCHIVES</p>
           </div>
        )}

        {/* THE LIST */}
        {!loadingLeaderboard && (
        <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl overflow-hidden shadow-2xl">

          {/* List Header */}
          <div className="grid grid-cols-12 gap-3 px-4 md:px-6 py-2.5 bg-[#111] border-b border-[#222] text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-7 md:col-span-5">Contender</div>
            <div className="col-span-2 md:col-span-2"><div className="flex items-center gap-1.5"><Globe size={12} /> Region</div></div>
            <div className="hidden md:block md:col-span-3"><div className="flex items-center gap-1.5"><CalendarDays size={12} /> Answered</div></div>
            <div className="col-span-2 md:col-span-1 text-right"><div className="flex items-center justify-end gap-1.5"><Timer size={12} /> Tries</div></div>
          </div>

          <div className="divide-y divide-[#161616]">
            {leaderboardData.map((user) => (
                <div key={user.rank} className="grid grid-cols-12 gap-3 px-4 md:px-6 py-1.5 items-center hover:bg-[#0f0f0f] transition-colors group">

                  {/* Rank */}
                  <div className={`col-span-1 text-center font-bold font-mono text-sm ${rankClass(user.rank)}`}>
                    {user.rank}
                  </div>

                  {/* Contender: badge avatar + name + badge title */}
                  <div className="col-span-7 md:col-span-5 flex items-center gap-3 min-w-0">
                      <div className={`relative w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${
                        user.noBorder
                          ? ""
                          : "bg-[#151515] border border-[#2a2a2a] shadow-inner group-hover:border-slate-600 transition-colors"
                      }`}>
                        {user.badgeId ? (
                          <Image
                            src={user.badgeId}
                            alt={user.title}
                            fill
                            className={user.noBorder ? "object-contain" : "object-fill"}
                          />
                        ) : (
                          <span className="text-[10px] font-medium text-slate-600">
                            {user.username.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col justify-center min-w-0">
                        <span className="font-medium text-slate-300 group-hover:text-amber-400 transition-colors leading-tight text-sm truncate">
                          {user.username}
                        </span>
                        {/* Prestige titles keep their gradient + moving glow here too. */}
                        {(() => {
                          const ps = prestigeTitleStyle(user.titleColorFrom, user.titleColorTo, user.titleTextColor);
                          return (
                            <span
                              className={`text-[9px] tracking-wider font-bold leading-tight truncate uppercase ${
                                ps ? PRESTIGE_TITLE_CLASS : "text-slate-500/90"
                              }`}
                              style={ps ?? undefined}
                            >
                              {user.title}
                            </span>
                          );
                        })()}
                      </div>
                  </div>

                  {/* Region */}
                  <div className="col-span-2 md:col-span-2 flex items-center gap-1.5 min-w-0" title={countryName(user.country)}>
                    {user.country ? (
                      <>
                        <span className="text-base leading-none">{flagEmoji(user.country)}</span>
                        <span className="hidden md:inline font-mono text-xs text-slate-500 truncate">{user.country}</span>
                      </>
                    ) : (
                      <span className="text-slate-700 text-xs">—</span>
                    )}
                  </div>

                  {/* Answered (date · time) */}
                  <div className="hidden md:block md:col-span-3 font-mono text-xs text-slate-500 tabular-nums">
                    {formatSolved(user.solvedAt)}
                  </div>

                  {/* Tries */}
                  <div className={`col-span-2 md:col-span-1 text-right font-mono text-xs tabular-nums ${user.attempts === 1 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {user.attempts}
                  </div>
                </div>
            ))}

            {leaderboardData.length === 0 && (
                <div className="p-20 text-center text-slate-600 text-sm flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-[#111] border border-[#222] flex items-center justify-center mb-4">
                      <Hexagon className="w-8 h-8 text-slate-800" />
                    </div>
                    <p className="text-lg text-slate-500 font-serif">The hall is empty.</p>
                    <p className="text-slate-700 mt-1">
                      {problemTitle ? `No one has cracked “${problemTitle}” yet.` : 'Submit a solution to claim your throne.'}
                    </p>
                </div>
            )}
            </div>
        </div>
        )}

      </div>
    </div>
  );
}
