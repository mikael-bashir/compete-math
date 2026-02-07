'use client'

import React, { useState, useEffect } from 'react';
import { Lock, Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
// Remove the old type import if it conflicts, or update it to match this interface:
interface Problem {
  id: number;
  title: string;
  subtitle: string;
  difficulty: string;
  isSolved: boolean;
  status: 'solved' | 'current' | 'locked';
  symbol: string;
}

// --- SYMBOL GENERATOR ---
// Since we don't store symbols in DB, we map them deterministically by ID
const SYMBOLS = ["φ", "Σ", "∫", "λ", "π", "∞", "∆", "Ω"];
const getSymbol = (id: number) => SYMBOLS[(id - 1) % SYMBOLS.length];

// --- COMPONENT: BRONZE TILE ---
const BronzeTile = ({ problem }: { problem: Problem }) => {
  const isLocked = problem.status === "locked";
  const isSolved = problem.status === "solved";
  
  return (
    <Link 
      href={isLocked ? '#' : `/archives/problems/${problem.id}`}
      className={`
        group relative flex flex-col items-center gap-3 transition-transform duration-200 
        ${isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:-translate-y-2 active:translate-y-0'}
      `}
    >
      
      {/* THE TILE VISUAL */}
      <div 
        className={`
          relative w-24 h-24 rounded-xl shadow-2xl
          flex items-center justify-center
          border border-[#4a3b2a]
          transition-all duration-300
          ${isLocked ? 'grayscale-50' : 'opacity-100'}
        `}
        style={{
          background: `linear-gradient(135deg, #6d5639 0%, #3f2e1d 100%)`,
          boxShadow: `
            inset 1px 1px 0px rgba(255,255,255,0.15),
            inset -2px -2px 4px rgba(0,0,0,0.5),
            0 15px 30px rgba(0,0,0,0.7)
          `
        }}
      >
        {/* Solved Indicator */}
        {isSolved && (
          <div className="absolute -top-2 -right-2 z-20 bg-emerald-900 border border-emerald-500 rounded-full p-1 shadow-lg transform scale-0 group-hover:scale-100 transition-transform">
            <CheckCircle2 size={12} className="text-emerald-400" />
          </div>
        )}

        {/* Inner "Recessed" Area */}
        <div 
            className="absolute inset-2 rounded-lg flex items-center justify-center"
            style={{
                background: 'linear-gradient(135deg, #2a1f14 0%, #3e2d1c 100%)',
                boxShadow: 'inset 2px 2px 6px rgba(0,0,0,0.8), inset -1px -1px 0px rgba(255,255,255,0.1)'
            }}
        >
            <span className={`
                font-serif text-3xl select-none
                ${isLocked ? 'text-neutral-600' : isSolved ? 'text-emerald-500/80' : 'text-[#cfa86e]'}
                drop-shadow-md
                group-hover:text-[#ffe4bc] transition-colors
            `}>
                {isLocked ? <Lock size={20} /> : problem.symbol}
            </span>
        </div>

        {/* Hover Glow */}
        {!isLocked && (
          <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none border border-[#fbbf24]/40 shadow-[0_0_20px_rgba(251,191,36,0.15)]" />
        )}
      </div>

      {/* TEXT LABELS */}
      <div className="flex flex-col items-center text-center max-w-30">
        <span className={`
            text-[10px] uppercase tracking-widest font-bold mb-1 opacity-70
            ${isSolved ? 'text-emerald-600' : 'text-[#8a7250]'}
        `}>
            Problem {problem.id}
        </span>
        <span className={`
            text-xs leading-tight font-serif text-center font-medium line-clamp-2
            ${isLocked ? 'text-neutral-600' : 'text-[#bf9b68]'}
            group-hover:text-amber-100 transition-colors
        `}>
            {problem.subtitle || problem.title} 
        </span>
      </div>
    </Link>
  );
};

export default function SimplifiedArchives() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArchives = async () => {
      try {
        const res = await fetch('/api/problems');
        const data = await res.json();
        
        // Transform the DB data into UI-ready data
        // We assume all problems are 'unlocked' (current) unless solved,
        // or you can implement logic to lock future problems here.
        const formatted = data.map((p: any) => ({
          ...p,
          status: p.isSolved ? 'solved' : 'current', // Logic for 'locked' can be added here
          symbol: getSymbol(p.id)
        }));
        
        setProblems(formatted);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchArchives();
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
       <Loader2 className="animate-spin text-[#cfa86e] w-8 h-8" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 relative overflow-x-hidden">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#1a120b_0%,#050505_60%)]" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-16 sm:py-24">
        
        {/* Header */}
        <div className="mb-16 text-center">
            <h1 className="text-[#cfa86e] font-serif text-3xl sm:text-4xl tracking-widest uppercase mb-2">
                Archives
            </h1>
            <div className="h-px w-24 bg-linear-to-r from-transparent via-[#5a4630] to-transparent mx-auto" />
        </div>

        {/* The Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-y-12 gap-x-8 justify-items-center">
            {problems.map((problem) => (
                <BronzeTile key={problem.id} problem={problem} />
            ))}
        </div>
        
        {problems.length === 0 && (
          <div className="text-center text-slate-600 mt-12">
            The archives are currently empty.
          </div>
        )}
      </div>

    </div>
  );
}