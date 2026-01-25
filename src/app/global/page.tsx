'use client'

import React, { useState, useEffect } from 'react';
import { 
  Trophy, Medal, Crown, Zap, Brain, Hexagon, 
  ChevronDown, Calendar, Timer, Hash, Loader2, Trophy as Star, Flame
} from 'lucide-react';
import Image from 'next/image';
// --- BADGE CONFIGURATION ---
const BADGE_MAP: Record<string, React.ElementType> = {
  crown: Crown,
  zap: Zap,
  brain: Brain,
  star: Star,
  fire: Flame,
  hexagon: Hexagon
};

const UserBadge = ({ type, className }: { type: string, className?: string }) => {
  const cleanType = (type).trim().toLowerCase();
  const IconComponent = BADGE_MAP[cleanType] || Hexagon;

  let colorClass = "text-slate-600";
  if (cleanType === 'crown' || cleanType === 'alpha') colorClass = "text-amber-400";
  if (cleanType === 'zap') colorClass = "text-cyan-400";
  if (cleanType === 'brain') colorClass = "text-pink-400";
  if (cleanType === 'fire') colorClass = "text-orange-500";
  if (cleanType === 'star') colorClass = "text-purple-400";

  return <IconComponent className={`${colorClass} ${className}`} />;
};

export default function LeaderboardPage() {
  const [problems, setProblems] = useState<any[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<number | null>(null);
  
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // --- 1. FETCH PROBLEMS ---
  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const res = await fetch('/api/problems/recent');
        if (!res.ok) throw new Error("Failed to fetch problems");
        const json = await res.json();
        
        setProblems(json);
        if (json.length > 0) {
          setSelectedProblem(json[0].id);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchProblems();
  }, []);

  // --- 2. FETCH LEADERBOARD ---
  useEffect(() => {
    if (!selectedProblem) return;

    const fetchLeaderboard = async () => {
      setLoadingLeaderboard(true);
      try {
        const res = await fetch(`/api/leaderboard/${selectedProblem}`);
        if (!res.ok) throw new Error("Failed to fetch leaderboard");
        const json = await res.json();
        setLeaderboardData(json.leaderboard);
      } catch (e) {
        console.error(e);
        setLeaderboardData([]);
      } finally {
        setLoadingLeaderboard(false);
      }
    };

    fetchLeaderboard();
  }, [selectedProblem]);

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans selection:bg-emerald-500/30">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,#1a120b_0%,#050505_60%)]" />

      <div className="relative z-10 container max-w-5xl mx-auto px-4 py-12">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6 mt-10">
          {/* <div>
            <h1 className="text-4xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 mb-2">
              Hall of Integrals
            </h1>
            <p className="text-slate-500">Honoring those who solved the unsolvable.</p>
          </div> */}

          {/* PROBLEM SELECTOR */}
          <div className="relative z-50">
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              disabled={problems.length === 0}
              className="flex items-center gap-3 bg-[#0a0a0a] border border-[#333] hover:border-emerald-700/50 px-5 py-3 rounded-xl transition-all min-w-[240px] justify-between group disabled:opacity-50"
            >
              <span className="font-medium text-slate-200 truncate max-w-[200px]">
                {problems.find(p => p.id === selectedProblem)?.title || "Loading Problems..."}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {dropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-full bg-[#0a0a0a] border border-[#333] rounded-xl shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto">
                {problems.map((p) => (
                  <div 
                    key={p.id}
                    onClick={() => { setSelectedProblem(p.id); setDropdownOpen(false); }}
                    className="px-5 py-3 hover:bg-[#151515] cursor-pointer text-sm text-slate-400 hover:text-emerald-400 transition-colors border-b border-[#1a1a1a] last:border-0 truncate"
                  >
                    {p.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* LOADING STATE */}
        {loadingLeaderboard && (
           <div className="flex flex-col items-center justify-center py-20 opacity-50">
             <Loader2 className="animate-spin w-8 h-8 text-emerald-600 mb-4" />
             <p className="text-sm font-mono text-emerald-800">CONSULTING ARCHIVES</p>
           </div>
        )}

        {/* THE UNIFIED LIST (No Podium) */}
        {!loadingLeaderboard && (
        <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl overflow-hidden shadow-2xl">
          
          {/* List Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-2 bg-[#111] border-b border-[#222] text-xs font-bold text-slate-500 uppercase tracking-widest">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-5 md:col-span-4">Contender</div>
            <div className="col-span-3 hidden md:block"><div className="flex items-center gap-2"><Calendar size={14} /> Date</div></div>
            <div className="col-span-3 md:col-span-2 text-right"><div className="flex items-center justify-end gap-2"><Timer size={14} /> Time</div></div>
            <div className="col-span-3 md:col-span-2 text-right"><div className="flex items-center justify-end gap-2"><Hash size={14} /> Attempts</div></div>
          </div>

          <div className="divide-y divide-[#1a1a1a]">
            {leaderboardData.map((user) => (
                <div key={user.rank} className="grid grid-cols-12 gap-4 px-6 py-2 items-center hover:bg-[#0f0f0f] transition-colors group">
                  
                  {/* Rank */}
                  <div className={`col-span-1 text-center font-bold text-md ${
                    user.rank === 1 ? 'text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]' :
                    user.rank === 2 ? 'text-slate-300' :
                    user.rank === 3 ? 'text-orange-500' :
                    'text-slate-700'
                  }`}>
                    {user.rank}
                  </div>

                  {/* NAMEPLATE DESIGN */}
                  <div className="col-span-5 md:col-span-4 flex items-center gap-4">
                      {/* Circular Badge Frame */}
                      {/* <div className="relative w-11 h-11 rounded-full bg-[#151515] border border-[#333] flex items-center justify-center shrink-0 shadow-inner group-hover:border-slate-600 transition-colors">

                        <UserBadge type={user.badgeId} className="w-6 h-6" />
                      </div> */}
                      <div className="relative w-11 h-11 rounded-full bg-[#151515] border border-[#333] flex items-center justify-center shrink-0 shadow-inner group-hover:border-slate-600 transition-colors overflow-hidden">
                        
                        <Image 
                          src={user.badgeId} 
                          alt={user.badgeTitle}
                          fill
                          className="object-fill"
                        />
                        
                      </div>
                    
                      <div className="flex flex-col justify-center">
                        {/* Badge Title (Directly from DB) */}
                        <span className="text-[8px] tracking-wider font-bold text-slate-400/80 leading-none mb-[1px] whitespace-pre-wrap">
                          {user.badgeTitle}
                        </span>
                        {/* Username */}
                        <span className="font-medium text-slate-300 group-hover:text-emerald-400 transition-colors leading-none text-base">
                          {user.username}
                        </span>
                      </div>
                  </div>

                  {/* Metadata Columns */}
                  <div className="col-span-3 hidden md:block text-sm text-slate-500">{user.solvedAt}</div>
                  <div className="col-span-3 md:col-span-2 text-right font-mono text-emerald-600 text-sm">{user.timeTaken}</div>
                  <div className="col-span-3 md:col-span-2 text-right text-sm text-slate-500">{user.attempts}</div>
                </div>
            ))}
            
            {leaderboardData.length === 0 && (
                <div className="p-20 text-center text-slate-600 text-sm flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-[#111] border border-[#222] flex items-center justify-center mb-4">
                      <Hexagon className="w-8 h-8 text-slate-800" />
                    </div>
                    <p className="text-lg text-slate-500 font-serif">The hall is empty.</p>
                    <p className="text-slate-700 mt-1">Submit a solution to claim your throne.</p>
                </div>
            )}
            </div>
        </div>
        )}

      </div>
    </div>
  );
}