"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, Flame, Trophy, PenLine, MessageSquare, ArrowBigUp, CalendarDays,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DazzleBadgeEffect } from "@/app/lib/components/art/badges/effects";

interface PublicProfile {
  username: string;
  email: string;
  joinedAt: string;
  badgeUrl: string | null;
  badges: string[];
  solvedCount: number;
  streak: number;
  problems: {
    id: number; title: string; topic: string; difficulty: string;
    created_at: string; answer_count: number;
  }[];
  answers: {
    id: number; body: string; created_at: string; problem_id: number;
    problem_title: string; votes: number;
  }[];
}

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"problems" | "answers">("problems");

  useEffect(() => {
    fetch(`/api/users/${encodeURIComponent(username)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-white/40">
        <Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading profile…
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0a0f14] flex flex-col items-center justify-center gap-4 text-white/50">
        <p className="font-code">User not found.</p>
        <Link href="/community" className="font-code text-emerald-300 text-sm hover:text-emerald-200">
          ← Back to the Forge
        </Link>
      </div>
    );
  }

  const display = profile.username || profile.email;
  const joined = new Date(profile.joinedAt).toLocaleDateString("en-GB", {
    year: "numeric", month: "long",
  });

  const stats = [
    { icon: Trophy, label: "Problems solved", value: profile.solvedCount, color: "text-amber-300" },
    { icon: Flame, label: "Day streak", value: profile.streak, color: "text-orange-400" },
    { icon: PenLine, label: "Problems forged", value: profile.problems.length, color: "text-emerald-300" },
    { icon: MessageSquare, label: "Answers posted", value: profile.answers.length, color: "text-sky-300" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0f14] pt-24 pb-24">
      <div className="max-w-4xl mx-auto px-6">

        {/* Identity header */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <DazzleBadgeEffect size="110px" color="#10b981">
              <Avatar className="h-24 w-24 border-2 border-white/20">
                <AvatarImage src={profile.badgeUrl || undefined} alt={display} />
                <AvatarFallback className="bg-emerald-900/60 text-emerald-200 text-3xl font-code">
                  {display.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </DazzleBadgeEffect>

            <div className="text-center sm:text-left flex-1">
              <h1 className="font-display text-3xl font-bold text-white! mb-1">{display}</h1>
              <p className="font-code inline-flex items-center gap-1.5 text-xs text-white/40">
                <CalendarDays className="w-3.5 h-3.5" /> joined {joined}
              </p>
              {profile.badges.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
                  {profile.badges.slice(0, 8).map((b) => (
                    <span key={b} className="font-code text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-amber-400/30 bg-amber-400/10 text-amber-200">
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stat blocks */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-2 ${s.color}`} />
                <p className="font-code text-2xl font-bold text-white!">{s.value}</p>
                <p className="font-code text-[10px] uppercase tracking-wider text-white/40 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Contributions */}
        <div className="flex gap-2 mb-6">
          {([
            { id: "problems", label: `Forged Problems (${profile.problems.length})` },
            { id: "answers", label: `Answers (${profile.answers.length})` },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`font-code px-4 py-2 rounded-md text-sm transition-colors border ${
                tab === t.id
                  ? "bg-white/10 text-white border-white/20"
                  : "text-white/50 hover:text-white border-transparent hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "problems" && (
          <div className="space-y-3">
            {profile.problems.length === 0 && (
              <p className="font-code text-white/35 text-sm text-center py-10 border border-dashed border-white/10 rounded-xl">
                No approved problems yet.
              </p>
            )}
            {profile.problems.map((p) => (
              <Link
                key={p.id}
                href={`/community/${p.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4 hover:border-emerald-400/30 transition-colors no-underline group"
              >
                <div className="min-w-0">
                  <p className="font-code text-sm text-white group-hover:text-emerald-200 transition-colors truncate">{p.title}</p>
                  <p className="font-code text-[11px] text-white/35 mt-1">
                    {p.topic} · {p.difficulty} · {new Date(p.created_at).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <span className="font-code shrink-0 inline-flex items-center gap-1.5 text-xs text-white/40">
                  <MessageSquare className="w-3.5 h-3.5" /> {p.answer_count}
                </span>
              </Link>
            ))}
          </div>
        )}

        {tab === "answers" && (
          <div className="space-y-3">
            {profile.answers.length === 0 && (
              <p className="font-code text-white/35 text-sm text-center py-10 border border-dashed border-white/10 rounded-xl">
                No answers yet.
              </p>
            )}
            {profile.answers.map((a) => (
              <Link
                key={a.id}
                href={`/community/${a.problem_id}`}
                className="block rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4 hover:border-emerald-400/30 transition-colors no-underline group"
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="font-code text-xs text-emerald-300/70 truncate">↳ {a.problem_title}</p>
                  <span className="font-code shrink-0 inline-flex items-center gap-1 text-xs text-white/40">
                    <ArrowBigUp className="w-3.5 h-3.5" /> {a.votes}
                  </span>
                </div>
                <p className="text-white/70 text-sm line-clamp-2">{a.body}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
