'use client'

import React, { useState, useEffect, use } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { 
  ArrowLeft, Send, CheckCircle2, RotateCcw, Loader2, Lock, LogIn, X 
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// UI Components
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// --- 1. BADGE COMPONENT ---
const UserBadge = ({ url, name, className }: { url: string, name: string, className?: string }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* We only render the img if url exists. 
         This prevents <img src={undefined} /> which causes immediate onError 
      */}
      {url ? (
        <img 
          src={url} 
          alt={name}
          className="w-full h-full object-contain drop-shadow-md"
          onError={(e) => { 
             console.warn(`Failed to load badge image: ${url}`);
             e.currentTarget.style.display = 'none'; 
          }}
        />
      ) : (
        // Optional: Fallback placeholder if URL is missing
        <div className="w-full h-full bg-emerald-900/20 rounded-full flex items-center justify-center border border-emerald-500/30">
          <span className="text-[10px] text-emerald-500">?</span>
        </div>
      )}
    </div>
  );
};

// --- 2. CUSTOM TOAST ---
const showBadgeToast = (badgeName: string, badgeUrl: string) => {
  toast.custom((id) => (
    <div className="relative bg-[#0a0a0a] border border-emerald-500/50 rounded-xl p-5 shadow-[0_0_30px_-10px_rgba(16,185,129,0.3)] flex items-center gap-4 w-full max-w-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      
      {/* Shine Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent -skew-x-12 translate-x-[-100%] animate-[shimmer_2s_infinite]" />
      
      <div className="relative bg-[#111] p-3 rounded-full border border-[#333]">
          <UserBadge url={badgeUrl} name={badgeName} className="w-8 h-8" />
      </div>
      
      <div className="relative flex-1">
        <h4 className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">Badge Unlocked!</h4>
        <p className="text-white font-serif text-lg leading-none">{badgeName}</p>
      </div>

      <button onClick={() => toast.dismiss(id)} className="text-slate-600 hover:text-slate-400">
        <X size={14} />
      </button>
    </div>
  ), {
    duration: 6000,
  });
};

export default function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session, status: authStatus } = useSession();

  const [problem, setProblem] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [isSolved, setIsSolved] = useState(false);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<'idle' | 'submitting' | 'wrong'>('idle');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/problems/${id}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setProblem(data);
        if (data.isSolved) setIsSolved(true);
      } catch (error) { console.error(error); } 
      finally { setLoadingData(false); }
    };
    fetchData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    
    try {
      const res = await fetch(`/api/problems/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempt: answer })
      });
      
      const result = await res.json();

      if (result.correct || (result.success === false && result.message === 'Question was already solved')) {
        setIsSolved(true);
        setStatus('idle');
        
        // --- HANDLE TOASTS ---
        if (result.newBadges && result.newBadges.length > 0) {
          result.newBadges.forEach((badge: { badgeName: string, badgeUrl: string }) => {
            showBadgeToast(badge.badgeName, badge.badgeUrl);
          });
        }
      } else {
        setStatus('wrong');
      }
    } catch (err) {
      console.error(err);
      setStatus('idle');
    }
  };

  if (authStatus === 'loading' || loadingData) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-emerald-600 w-8 h-8" /></div>;

  if (!problem) return <div className="min-h-screen bg-[#050505] text-slate-500 flex items-center justify-center">Problem not found.</div>;

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans selection:bg-emerald-500/30 mt-[15px]">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,#1a120b_0%,#050505_60%)]" />

      <div className="relative z-10 container max-w-4xl mx-auto px-4 py-12">
        <Link href="/archives" className="inline-flex items-center text-emerald-700 hover:text-emerald-500 transition-colors mb-8 group font-medium text-sm">
          <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Archives
        </Link>

        <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-[#111] border-b border-[#222] px-8 py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div>
               <h1 className="text-3xl text-slate-100 font-serif font-bold tracking-tight mb-1">{problem.title}</h1>
               <div className="flex items-center gap-3 text-xs uppercase tracking-widest font-semibold text-emerald-600/80">
                 <span>Problem {problem.id}</span>
                 <span className="w-1 h-1 rounded-full bg-emerald-800" />
                 <span>{problem.subtitle}</span>
               </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full border border-emerald-900/30 bg-emerald-900/10 text-emerald-500 text-xs font-bold uppercase tracking-wider">{problem.difficulty}</span>
              <span className="px-3 py-1 rounded-full border border-amber-900/30 bg-amber-900/10 text-amber-500 text-xs font-bold uppercase tracking-wider">{problem.points} Pts</span>
            </div>
          </div>

          <div className="px-8 py-10 prose prose-invert prose-emerald max-w-none">
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{
                p: ({node, ...props}) => <p className="text-lg leading-relaxed text-slate-300 mb-6" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-xl font-serif text-emerald-100 mt-8 mb-4 border-b border-emerald-900/30 pb-2" {...props} />,
              }}>
              {problem.content}
            </ReactMarkdown>
          </div>

          <div className="bg-[#0f0f0f] border-t border-[#222] p-8 min-h-[140px] flex flex-col justify-center">
             {authStatus === 'unauthenticated' && (
               <div className="flex items-center justify-between bg-[#151515] border border-[#333] rounded-lg p-4">
                 <div className="flex items-center gap-4 text-slate-400">
                    <Lock className="w-5 h-5 text-slate-500" />
                    <span className="text-sm font-medium">Authentication required to submit proofs.</span>
                 </div>
                 <Link href="/api/auth/signin"><Button variant="outline" className="border-[#333] hover:bg-[#222] text-slate-200"><LogIn className="w-4 h-4 mr-2" /> Log In</Button></Link>
               </div>
             )}

             {authStatus === 'authenticated' && isSolved && (
               <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-4 flex items-center gap-4 animate-in fade-in zoom-in-95 duration-300">
                  <div className="p-2 bg-emerald-900/30 rounded-full"><CheckCircle2 className="w-6 h-6 text-emerald-500" /></div>
                  <div><h4 className="text-emerald-400 font-bold text-sm tracking-wide">Problem Solved</h4><p className="text-emerald-600/80 text-xs">Your proof has been verified and recorded.</p></div>
               </div>
             )}

             {authStatus === 'authenticated' && !isSolved && (
               <>
                 <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Submit your Proof</h4>
                 <form onSubmit={handleSubmit} className="relative max-w-xl">
                   <div className="flex gap-3">
                      <div className="relative flex-grow">
                        <Input value={answer} onChange={(e) => { setAnswer(e.target.value); if(status === 'wrong') setStatus('idle'); }} placeholder="Enter exact solution..." className="bg-[#050505] border-[#333] text-slate-200 placeholder:text-slate-700 focus:border-emerald-600 focus:ring-emerald-900/20 font-mono" />
                      </div>
                      <Button type="submit" disabled={status === 'submitting' || !answer} className={`min-w-[120px] font-bold transition-all duration-300 ${status === 'wrong' ? 'bg-red-900/50 text-red-200 hover:bg-red-900/70 border border-red-800' : 'bg-[#cfa86e] hover:bg-[#deb87f] text-black'}`}>
                        {status === 'submitting' ? <span className="animate-pulse">Verifying...</span> : status === 'wrong' ? <span className="flex items-center gap-2"><RotateCcw size={16} /> Retry</span> : <span className="flex items-center gap-2">Submit <Send size={14} /></span>}
                      </Button>
                   </div>
                   {status === 'wrong' && <p className="absolute -bottom-8 left-0 text-sm text-red-500 font-medium animate-in slide-in-from-top-1 fade-in">Incorrect answer. Double check your calculations.</p>}
                 </form>
               </>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}