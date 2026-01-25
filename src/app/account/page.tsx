'use client'

import React, { useState, useEffect } from 'react';
import { useSession } from "next-auth/react";
import { 
  Loader2, Calendar, Mail, ShieldCheck, Lock
} from 'lucide-react';

// --- NEW BADGE COMPONENT (SIMPLIFIED) ---
const UserBadge = ({ url, name, className }: { url?: string, name: string, className?: string }) => {
  // Logic: Strictly use the URL provided from the DB
  if (!url) return null;

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <img 
        src={url} 
        alt={name}
        title={name}
        className="w-full h-full object-contain drop-shadow-md transition-transform duration-300"
        onError={(e) => {
          // Hide image if URL is broken
          e.currentTarget.style.display = 'none'; 
        }}
      />
    </div>
  );
};

export default function AccountPage() {
  const { data: session, update } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [equipping, setEquipping] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/user/profile');
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    if (session) fetchProfile();
  }, [session]);

  const handleEquip = async (badgeName: string) => {
    // Note: We match against badgeSelected (singular)
    if (equipping || profile.badgeSelected === badgeName) return;

    const targetBadge = profile.badges.find((b: any) => b.badgeName === badgeName);
    const targetUrl = targetBadge?.badgeUrl;
    
    setEquipping(badgeName);
    const previousBadge = profile.badgeSelected;

    setProfile((prev: any) => ({
      ...prev,
      badgeSelected: badgeName, // Updated property name
      badges: prev.badges.map((b: any) => ({
        ...b,
        isSelected: b.badgeName === badgeName 
      }))
    }));

    try {
      const res = await fetch('/api/user/profile/badge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badge: badgeName })
      });

      if (!res.ok) throw new Error("Failed to equip");

      if (targetUrl) {
        await update({ badgeUrl: targetUrl }); 
      }

    } catch (e) {
      console.error("Equip failed", e);
      setProfile((prev: any) => ({
        ...prev,
        badgeSelected: previousBadge,
        badges: prev.badges.map((b: any) => ({
          ...b,
          isSelected: b.badgeName === previousBadge
        }))
      }));
    } finally {
      setEquipping(null);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
    </div>
  );

  if (!profile) return <div className="min-h-screen bg-[#050505]" />;

  // LOGIC: Find active badge object using badgeSelected (singular)
  const activeBadge = profile.badges.find((b: any) => b.badgeName === profile.badgeSelected) 
                   || profile.badges[0];

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans selection:bg-emerald-500/30 mt-10">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,#1a120b_0%,#050505_60%)]" />

      <div className="relative z-10 container max-w-5xl mx-auto px-4 py-16">
        
        {/* --- USER HEADER --- */}
        <div className="flex flex-col md:flex-row items-center gap-8 mb-12">
          <div className="relative group">
            <div className="w-32 h-32 rounded-full bg-[#0a0a0a] border-2 border-[#333] flex items-center justify-center shadow-2xl relative z-10 overflow-hidden p-4">
              <UserBadge 
                url={activeBadge?.badgeUrl} 
                name={activeBadge?.badgeName || 'Badge'} 
                className="w-24 h-24" 
              />
            </div>
            <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl opacity-50 group-hover:opacity-80 transition-opacity" />
          </div>

          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold text-white mb-2">{profile.username}</h1>
            <div className="flex flex-col md:flex-row gap-4 text-sm text-slate-500 font-mono">
              <span className="flex items-center gap-2"><Mail size={14} /> {profile.email || "No email linked"}</span>
              <span className="flex items-center gap-2"><Calendar size={14} /> Joined {new Date(profile.created_at || Date.now()).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="md:ml-auto bg-[#0f0f0f] border border-[#222] rounded-xl px-6 py-4 text-center min-w-[120px]">
            <div className="text-2xl font-bold text-emerald-400 font-mono">{profile.solvedCount || 0}</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">Solves</div>
          </div>
        </div>

        {/* --- DIVIDER --- */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-[#222] to-transparent mb-10" />

        {/* --- ACTIVE BADGE DISPLAY --- */}
        <div className="flex flex-col items-center justify-center text-center mb-12 space-y-4">
            <div className="flex items-center gap-3">
                <h2 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 uppercase tracking-widest">
                    {activeBadge?.badgeName}
                </h2>
                {activeBadge?.numberAvailable && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30 font-mono uppercase">Limited</span>
                )}
            </div>

            <p className="text-slate-400 max-w-xl text-sm leading-relaxed font-light">
                {activeBadge?.description}
            </p>

            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-900/20 border border-emerald-500/20 text-emerald-400 text-xs font-mono uppercase tracking-wider">
                <ShieldCheck size={12} />
                Currently Equipped
            </div>
        </div>

        {/* --- BADGE GRID --- */}
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4 justify-items-center">
          {profile.badges.map((badge: any, index: number) => {
            const isActive = badge.badgeName === profile.badgeSelected; 
            const isLocked = !badge.isUnlocked;

            return (
              <button
                // FIX: Unique key using ID + Index to satisfy React warning
                key={`${badge.badgeName}-${index}`} 
                onClick={() => handleEquip(badge.badgeName)}
                disabled={isActive || isLocked || equipping === badge.badgeName}
                className={`
                  group relative w-full aspect-square rounded-xl border transition-all duration-300 flex items-center justify-center overflow-hidden
                  ${isActive 
                    ? 'bg-emerald-900/10 border-emerald-500/50 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)] scale-105 z-10' 
                    : isLocked 
                      ? 'bg-[#080808] border-[#1a1a1a] opacity-40 grayscale cursor-not-allowed' 
                      : 'bg-[#0a0a0a] border-[#222] hover:border-slate-500 hover:bg-[#111] cursor-pointer hover:scale-105'
                  }
                `}
              >
                <div className={`transition-transform duration-300 w-2/3 h-2/3 flex items-center justify-center`}>
                  <UserBadge 
                    url={badge.badgeUrl}
                    name={badge.badgeName}
                    className={isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"} 
                  />
                </div>

                {isLocked && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                      <Lock className="text-slate-600 w-5 h-5" />
                  </div>
                )}

                {badge.numberAvailable && !isLocked && (
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_5px_rgba(168,85,247,0.8)]" />
                )}

                {equipping === badge.badgeName && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl z-30">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}