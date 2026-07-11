'use client'

import React, { useState, useEffect, use } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft, Send, CheckCircle2, RotateCcw, Loader2, Lock, LogIn, X,
  ShieldCheck, Copy, Check, Flag, ScrollText
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// UI Components
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  isAdminEmail,
  PROBLEM_TOPICS,
  DIFFICULTY_LEVELS,
  KNOWLEDGE_LEVELS,
  PRACTICE_REVEAL_ATTEMPTS,
} from "@/app/lib/constants/site"
import { CERTIFICATE, fmtCertDate } from "@/app/lib/certificate"
import { CertifiedInfo } from "@/app/lib/components/certified-info"

// --- CERTIFICATE ---
// Shown once a problem is complete (solved, or given up after the attempt gate).
// Presents the machine-checked Lean proof as a verification certificate: the
// answer, provenance (minted/enforced dates + toolchain), a support contact,
// and the full proof script (copyable).
interface CertPayload {
  proof: string;
  full: string;
  mintedAt?: string | null;
  provedAt?: string | null;
  title?: string | null;
}
// Rendered inline beneath the problem card (not a modal). Compact, small type.
function CertificatePanel({
  open, onClose, answer, cert,
}: {
  open: boolean;
  onClose: () => void;
  answer: React.ReactNode;
  cert: CertPayload | null;
}) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-[#0b0e12] animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Header — clean, no seal glow */}
      <div className="relative flex items-center gap-2.5 border-b border-white/[0.07] px-4 py-3">
        <div className="grid place-items-center rounded-md border border-white/10 bg-white/[0.03] h-7 w-7 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-300" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-slate-100 leading-tight">Proof Certificate</h3>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500 truncate">{CERTIFICATE.issuer} · machine-checked formal proof</p>
        </div>
        <button onClick={onClose} aria-label="Close certificate" className="ml-auto shrink-0 text-slate-600 hover:text-slate-300"><X size={14} /></button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Statement of verification */}
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500 shrink-0">Answer</p>
          <p className="font-mono text-sm text-emerald-300">{answer}</p>
        </div>

        {/* Provenance — formal definition table */}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
          <div className="p-3 bg-[#0b0e12]">
            <dt className="font-mono uppercase tracking-[0.12em] text-slate-500 text-[9px] mb-0.5">Minted</dt>
            <dd className="text-slate-300 font-mono text-[11px]">{fmtCertDate(cert?.mintedAt)}</dd>
          </div>
          <div className="p-3 bg-[#0b0e12]">
            <dt className="font-mono uppercase tracking-[0.12em] text-slate-500 text-[9px] mb-0.5">Enforced · machine-checked</dt>
            <dd className="text-slate-300 font-mono text-[11px]">{fmtCertDate(cert?.provedAt)}</dd>
          </div>
          <div className="p-3 bg-[#0b0e12]">
            <dt className="font-mono uppercase tracking-[0.12em] text-slate-500 text-[9px] mb-0.5">Toolchain</dt>
            <dd className="text-slate-300 font-mono text-[11px]">{CERTIFICATE.toolchain} · {CERTIFICATE.mathlib}</dd>
          </div>
          <div className="p-3 bg-[#0b0e12]">
            <dt className="font-mono uppercase tracking-[0.12em] text-slate-500 text-[9px] mb-0.5">Support</dt>
            <dd><a href={`mailto:${CERTIFICATE.supportEmail}`} className="text-slate-300 hover:text-white underline underline-offset-2 decoration-white/20 font-mono text-[11px] break-all">{CERTIFICATE.supportEmail}</a></dd>
          </div>
        </dl>

        {/* Proof script */}
        {cert?.proof ? (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500 flex items-center gap-1.5">
                <ScrollText className="w-3 h-3" /> Proof script · Lean 4
              </p>
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(cert.full); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
                }}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200 transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy certificate'}
              </button>
            </div>
            <pre className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-[#07090c] p-3 font-mono text-[10px] leading-relaxed text-slate-300 whitespace-pre">
              {cert.proof}
            </pre>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 italic">No proof certificate is attached to this problem.</p>
        )}

        <p className="text-[10px] leading-relaxed text-slate-500 border-t border-white/[0.06] pt-3">
          This certificate attests that the stated answer follows from a formal proof
          that compiles and type-checks under the toolchain above. The proof is
          reproducible: compiling the script yields no errors or unproven goals.
        </p>
      </div>
    </div>
  );
}

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
      <div className="absolute inset-0 bg-linear-to-r from-transparent via-emerald-500/10 to-transparent -skew-x-12 translate-x-full animate-[shimmer_2s_infinite]" />
      
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
  const isAdmin = isAdminEmail(session?.user?.email);

  const [problem, setProblem] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [isSolved, setIsSolved] = useState(false);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<'idle' | 'submitting' | 'wrong'>('idle');

  // Attempt gate + certificate reveal. `attemptCount` drives "attempt N of 3
  // before you can give up"; `canReveal` unlocks the answer + certificate (after
  // solving, or PRACTICE_REVEAL_ATTEMPTS tries). `cert`/`certAnswer` hold the
  // revealed payload once fetched from the gated /api/proofs endpoint.
  const [attemptCount, setAttemptCount] = useState(0);
  const [canReveal, setCanReveal] = useState(false);
  const [cert, setCert] = useState<CertPayload | null>(null);
  const [certAnswer, setCertAnswer] = useState<string | null>(null);
  const [certOpen, setCertOpen] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  // Admin taxonomy editor (theme / difficulty / level), prefilled from the problem.
  const [editTopic, setEditTopic] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("");
  const [editKnowledge, setEditKnowledge] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/problems/${id}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setProblem(data);
        setEditTopic(data.topic || "");
        setEditDifficulty(data.difficulty || "");
        setEditKnowledge(data.knowledge && data.knowledge !== "None" ? data.knowledge : "");
        if (data.isSolved) setIsSolved(true);
        // Restore the attempt gate from the server so it survives refresh / nav.
        if (typeof data.attemptCount === "number") setAttemptCount(data.attemptCount);
        if (data.canReveal) setCanReveal(true);
      } catch (error) { console.error(error); }
      finally { setLoadingData(false); }
    };
    fetchData();
  }, [id]);

  // On load (signed in): read the gate state from the certificate endpoint —
  // how many attempts the user has used, and whether the reveal is already
  // unlocked (solved earlier / hit the attempt cap). Does NOT auto-show anything.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/proofs/${id}`);
        const d = await res.json();
        if (cancelled) return;
        if (typeof d.attemptsUsed === 'number') setAttemptCount(d.attemptsUsed);
        if (d.unlocked) {
          setCanReveal(true);
          setCertAnswer(d.answer != null ? String(d.answer) : null);
          if (d.certificate) setCert(d.certificate);
        }
      } catch { /* leave locked */ }
    })();
    return () => { cancelled = true; };
  }, [id, authStatus]);

  // The "give up" action: reveal the plain answer once the attempt gate is
  // cleared. Deliberately does NOT open or mention the certificate — it just
  // surfaces the answer. The server re-checks the gate, so this can't leak early.
  const revealAnswer = async () => {
    if (canReveal && certAnswer != null) { setGaveUp(true); return; }
    setRevealing(true);
    try {
      const res = await fetch(`/api/proofs/${id}`);
      const d = await res.json();
      if (d.unlocked) {
        setCanReveal(true);
        setCertAnswer(d.answer != null ? String(d.answer) : null);
        if (d.certificate) setCert(d.certificate);
        setGaveUp(true);
      } else {
        if (typeof d.attemptsUsed === 'number') setAttemptCount(d.attemptsUsed);
        toast.error(`${d.attemptsLeft ?? PRACTICE_REVEAL_ATTEMPTS} more attempt(s) before you can reveal the answer.`);
      }
    } catch {
      toast.error('Could not load the answer.');
    } finally {
      setRevealing(false);
    }
  };

  // Open the full proof certificate (fetching it on demand if not already loaded).
  // A separate, opt-in action — the certificate is never pushed on the user.
  const viewCertificate = async () => {
    if (cert || certAnswer != null) { setCertOpen(true); return; }
    setRevealing(true);
    try {
      const res = await fetch(`/api/proofs/${id}`);
      const d = await res.json();
      if (d.unlocked) {
        setCanReveal(true);
        setCertAnswer(d.answer != null ? String(d.answer) : null);
        if (d.certificate) setCert(d.certificate);
        setCertOpen(true);
      } else {
        toast.error('The certificate is not available yet.');
      }
    } catch {
      toast.error('Could not load the certificate.');
    } finally {
      setRevealing(false);
    }
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/problems/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: editTopic || null,
          difficulty: editDifficulty || null,
          knowledge: editKnowledge || null,
        }),
      });
      const out = await res.json();
      if (!res.ok) { toast.error(out.error || 'Save failed'); return; }
      setProblem((p: any) => ({ ...p, topic: out.topic, difficulty: out.difficulty, knowledge: out.knowledge }));
      toast.success('Problem updated');
    } catch {
      toast.error('Save failed');
    } finally {
      setSavingMeta(false);
    }
  };

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

      // Track the running attempt total + whether the reveal is now unlocked.
      if (typeof result.attemptCount === 'number') setAttemptCount(result.attemptCount);
      if (result.canReveal) setCanReveal(true);

      if (result.correct || (result.success === false && result.message === 'Problem already solved')) {
        setIsSolved(true);
        setCanReveal(true);
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
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans selection:bg-emerald-500/30 mt-3.75 placeholder-violet-100 pt-10">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,#0f141a_0%,#050505_60%)]" />
      <div className="relative z-10 container max-w-4xl mx-auto px-4 py-12">
        <Link href="/practice" className="inline-flex items-center text-emerald-700 hover:text-emerald-500 transition-colors mb-8 group font-medium text-sm">
          <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Archives
        </Link>

        {isAdmin && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-widest font-semibold text-amber-400/80 mb-3">
              Admin · edit taxonomy
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-slate-400">
                Theme
                <select
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                  className="bg-[#050505] border border-[#333] rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
                >
                  <option value="">General</option>
                  {PROBLEM_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-slate-400">
                Difficulty
                <select
                  value={editDifficulty}
                  onChange={(e) => setEditDifficulty(e.target.value)}
                  className="bg-[#050505] border border-[#333] rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
                >
                  <option value="">—</option>
                  {DIFFICULTY_LEVELS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-slate-400">
                Level
                <select
                  value={editKnowledge}
                  onChange={(e) => setEditKnowledge(e.target.value)}
                  className="bg-[#050505] border border-[#333] rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
                >
                  <option value="">None</option>
                  {KNOWLEDGE_LEVELS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <Button
                onClick={saveMeta}
                disabled={savingMeta}
                variant="outline"
                className="border-amber-400/25 bg-amber-400/[0.06] text-amber-200 hover:bg-amber-400/10 font-medium"
              >
                {savingMeta ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-[#111] border-b border-[#222] px-8 py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div>
               <h1 className="text-3xl text-slate-100 font-serif font-bold tracking-tight mb-1">{problem.title}</h1>
               <div className="flex items-center gap-3 text-xs uppercase tracking-widest font-semibold text-emerald-600/80">
                 <span>Problem {problem.id}</span>
                 {/* {problem.difficulty || problem.points &&
                  <span className="w-1 h-1 rounded-full bg-emerald-800" />
                 } */}
                 <span>{problem.subtitle}</span>
               </div>
            </div>
            <div className="flex items-center gap-3">
              {problem.hasProof && <CertifiedInfo />}
              {problem.difficulty &&
                <span className="px-3 py-1 rounded-full border border-emerald-900/30 bg-emerald-900/10 text-emerald-500 text-xs font-bold uppercase tracking-wider">{problem.difficulty}</span>
              }
              {problem.points &&
                <span className="px-3 py-1 rounded-full border border-amber-900/30 bg-amber-900/10 text-amber-500 text-xs font-bold uppercase tracking-wider">{problem.points} Pts</span>
              }
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

          <div className="bg-[#0f0f0f] border-t border-[#222] p-8 min-h-35 flex flex-col justify-center">
             {authStatus === 'unauthenticated' && (
               <div className="flex items-center justify-between bg-[#151515] border border-[#333] rounded-lg p-4">
                 <div className="flex items-center gap-4 text-slate-400">
                    <Lock className="w-5 h-5 text-slate-500" />
                    <span className="text-sm font-medium">Authentication required to submit answers.</span>
                 </div>
                 <Link href="/api/auth/signin"><Button variant="outline" className="border-[#333] hover:bg-[#222] text-slate-200"><LogIn className="w-4 h-4 mr-2" /> Log In</Button></Link>
               </div>
             )}

             {authStatus === 'authenticated' && isSolved && (
               <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-4 flex items-center gap-4 animate-in fade-in zoom-in-95 duration-300">
                  <div className="p-2 bg-emerald-900/30 rounded-full"><CheckCircle2 className="w-6 h-6 text-emerald-500" /></div>
                  <div className="flex-1"><h4 className="text-emerald-400 font-bold text-sm tracking-wide">Problem Solved</h4><p className="text-emerald-600/80 text-xs">Nicely done — your answer is correct.</p></div>
                  {problem.hasProof && (
                    <Button onClick={viewCertificate} disabled={revealing} variant="outline" className="shrink-0 border-white/15 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] hover:text-white font-medium">
                      {revealing ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="flex items-center gap-2"><ScrollText size={15} /> View certificate</span>}
                    </Button>
                  )}
               </div>
             )}

             {authStatus === 'authenticated' && !isSolved && gaveUp && (
               <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex items-center gap-4 animate-in fade-in zoom-in-95 duration-300">
                  <div className="p-2 bg-white/[0.04] rounded-full border border-white/10 shrink-0"><Flag className="w-5 h-5 text-slate-400" /></div>
                  <div className="flex-1">
                    <h4 className="text-slate-200 font-semibold text-sm tracking-wide">Answer revealed</h4>
                    <p className="text-xs text-slate-500">The correct answer is <span className="font-mono text-emerald-300">{certAnswer ?? '—'}</span>.</p>
                  </div>
                  {problem.hasProof && (
                    <button onClick={viewCertificate} disabled={revealing} className="shrink-0 text-xs text-slate-400 hover:text-slate-100 underline underline-offset-4 decoration-white/20 hover:decoration-white/40 transition-colors disabled:opacity-50">
                      View certificate
                    </button>
                  )}
               </div>
             )}

             {authStatus === 'authenticated' && !isSolved && !gaveUp && (
               <>
                 <form onSubmit={handleSubmit} className="relative max-w-xl">
                   <div className="flex gap-3">
                      <div className="relative grow">
                        <Input value={answer} onChange={(e) => { setAnswer(e.target.value); if(status === 'wrong') setStatus('idle'); }} placeholder="Enter answer here..." className="bg-[#050505] border-[#333] text-slate-200 placeholder:text-slate-700 focus:border-emerald-600 focus:ring-emerald-900/20 font-mono" />
                      </div>
                      <Button type="submit" disabled={status === 'submitting' || !answer} className={`min-w-30 font-medium transition-colors duration-200 border ${status === 'wrong' ? 'bg-red-500/10 text-red-300 hover:bg-red-500/15 border-red-500/30' : 'bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15 border-emerald-400/25'}`}>
                        {status === 'submitting' ? <span className="animate-pulse">Verifying...</span> : status === 'wrong' ? <span className="flex items-center gap-2"><RotateCcw size={16} /> Retry</span> : <span className="flex items-center gap-2">Submit <Send size={14} /></span>}
                      </Button>
                   </div>
                   {status === 'wrong' && <p className="absolute -bottom-8 left-0 text-sm text-red-500 font-medium animate-in slide-in-from-top-1 fade-in">Incorrect answer. Double check your calculations.</p>}
                 </form>

                 {/* Attempt gate: must genuinely try PRACTICE_REVEAL_ATTEMPTS times
                     before the answer + certificate can be revealed. */}
                 <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                   <span className="font-mono text-slate-500">
                     Attempt <span className="text-slate-300">{attemptCount}</span> / {PRACTICE_REVEAL_ATTEMPTS}
                   </span>
                   {canReveal ? (
                     <button onClick={revealAnswer} disabled={revealing} className="inline-flex items-center gap-1.5 font-medium text-slate-400 hover:text-slate-100 transition-colors disabled:opacity-50">
                       {revealing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
                       Reveal answer
                     </button>
                   ) : (
                     <span className="text-slate-600">
                       {Math.max(0, PRACTICE_REVEAL_ATTEMPTS - attemptCount)} more attempt(s) before you can give up and see the answer.
                     </span>
                   )}
                 </div>
               </>
             )}
          </div>
        </div>

        {/* Certificate — revealed inline beneath the problem, not as a modal. */}
        <CertificatePanel
          open={certOpen}
          onClose={() => setCertOpen(false)}
          answer={certAnswer ?? '—'}
          cert={cert}
        />
      </div>
    </div>
  );
}