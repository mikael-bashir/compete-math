'use client'

import React, { useState, useEffect } from 'react';
import { useSession } from "next-auth/react";
import {
  Loader2, Calendar, Mail, ShieldCheck, Lock, Globe, Sparkles
} from 'lucide-react';
import { COUNTRY_REGIONS, flagEmoji, countryName } from '../lib/data/countries';

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
  const [equippingTitle, setEquippingTitle] = useState<string | null>(null);
  const [savingCountry, setSavingCountry] = useState(false);
  // Which badge's name/description/requirements are shown in the detail
  // panel - defaults to the equipped one, but any badge (locked or not) can
  // be selected to preview it. Equipping is a separate, explicit action.
  const [viewedBadgeName, setViewedBadgeName] = useState<string | null>(null);
  // Same preview/equip split as badges, but for the separate titles entity.
  const [viewedTitleName, setViewedTitleName] = useState<string | null>(null);

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

  const handleEquipTitle = async (titleName: string) => {
    if (equippingTitle || profile.titleSelected === titleName) return;

    setEquippingTitle(titleName);
    const previousTitle = profile.titleSelected;

    setProfile((prev: any) => ({
      ...prev,
      titleSelected: titleName,
      titles: prev.titles.map((t: any) => ({
        ...t,
        isSelected: t.titleName === titleName
      }))
    }));

    try {
      const res = await fetch('/api/user/profile/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleName })
      });

      if (!res.ok) throw new Error("Failed to equip title");

    } catch (e) {
      console.error("Equip title failed", e);
      setProfile((prev: any) => ({
        ...prev,
        titleSelected: previousTitle,
        titles: prev.titles.map((t: any) => ({
          ...t,
          isSelected: t.titleName === previousTitle
        }))
      }));
    } finally {
      setEquippingTitle(null);
    }
  };

  // Region shown next to the user's name on leaderboards. Defaulted from IP on
  // first solve; whatever is chosen here wins permanently.
  const handleCountryChange = async (code: string) => {
    if (savingCountry) return;
    const next = code || null;
    const previous = profile.country;

    setSavingCountry(true);
    setProfile((prev: any) => ({ ...prev, country: next }));
    try {
      const res = await fetch('/api/user/profile/country', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: next })
      });
      if (!res.ok) throw new Error('Failed to save country');
    } catch (e) {
      console.error('Country update failed', e);
      setProfile((prev: any) => ({ ...prev, country: previous }));
    } finally {
      setSavingCountry(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
    </div>
  );

  if (!profile) return <div className="min-h-screen bg-[#050505]" />;

  // LOGIC: Find active (equipped) badge object using badgeSelected (singular)
  const activeBadge = profile.badges.find((b: any) => b.badgeName === profile.badgeSelected)
                   || profile.badges[0];

  // The badge currently shown in the detail panel - any badge can be
  // selected to preview it (locked ones included), defaulting to whatever
  // is actually equipped until the user picks something else to look at.
  const viewedBadge = (viewedBadgeName && profile.badges.find((b: any) => b.badgeName === viewedBadgeName))
                    || activeBadge;
  const viewedIsActive = viewedBadge?.badgeName === profile.badgeSelected;
  const viewedIsLocked = !viewedBadge?.isUnlocked;

  // Same pattern for titles: independent entity, own selection + preview state.
  const activeTitle = profile.titles.find((t: any) => t.titleName === profile.titleSelected)
                   || profile.titles[0];

  const viewedTitle = (viewedTitleName && profile.titles.find((t: any) => t.titleName === viewedTitleName))
                    || activeTitle;
  const viewedTitleIsActive = viewedTitle?.titleName === profile.titleSelected;
  const viewedTitleIsLocked = !viewedTitle?.isUnlocked;

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans selection:bg-emerald-500/30 mt-10">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,#1a120b_0%,#050505_60%)]" />

      <div className="relative z-10 container max-w-5xl mx-auto px-4 py-16">
        
        {/* --- USER HEADER --- */}
        <div className="flex flex-col md:flex-row items-center gap-8 mb-12">
          <div className="relative group">
            <div className={`w-32 h-32 rounded-full flex items-center justify-center relative z-10 overflow-hidden p-4 ${
              activeBadge?.noBorder
                ? ''
                : 'bg-[#0a0a0a] border-2 border-[#333] shadow-2xl'
            }`}>
              <UserBadge
                url={activeBadge?.badgeUrl}
                name={activeBadge?.badgeName || 'Badge'}
                className="w-24 h-24"
              />
            </div>
            {!activeBadge?.noBorder && (
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl opacity-50 group-hover:opacity-80 transition-opacity" />
            )}
          </div>

          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold text-white mb-1">{profile.username}</h1>
            {activeTitle && (
              activeTitle.colorFrom ? (
                <p
                  className="text-xs uppercase tracking-widest font-mono mb-2 inline-block bg-clip-text text-transparent"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${activeTitle.colorFrom}, ${activeTitle.colorTo})`,
                    filter: `drop-shadow(0 0 4px ${activeTitle.colorFrom}80) drop-shadow(0 0 8px ${activeTitle.colorTo}80)`
                  }}
                >
                  {activeTitle.titleName}
                </p>
              ) : (
                <p className="text-xs uppercase tracking-widest text-amber-400/70 font-mono mb-2">
                  {activeTitle.titleName}
                </p>
              )
            )}
            <div className="flex flex-col md:flex-row gap-4 text-sm text-slate-500 font-mono">
              <span className="flex items-center gap-2"><Mail size={14} /> {profile.email || "No email linked"}</span>
              <span className="flex items-center gap-2"><Calendar size={14} /> Joined {new Date(profile.created_at || Date.now()).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center justify-center md:justify-start gap-2 mt-3 text-sm text-slate-500 font-mono">
              <span className="flex items-center gap-2 shrink-0">
                {profile.country
                  ? <span className="text-base leading-none">{flagEmoji(profile.country)}</span>
                  : <Globe size={14} />}
              </span>
              <select
                value={profile.country || ''}
                onChange={(e) => handleCountryChange(e.target.value)}
                disabled={savingCountry}
                className="bg-[#0a0a0a] border border-[#222] hover:border-[#444] rounded-lg px-2 py-1.5 text-sm text-slate-300 outline-none focus:border-emerald-700/50 transition-colors max-w-60 disabled:opacity-50 cursor-pointer"
                title="Region shown next to your name on leaderboards"
              >
                <option value="">No region set</option>
                {Object.entries(COUNTRY_REGIONS).map(([region, codes]) => (
                  <optgroup key={region} label={region}>
                    {codes.map((code) => (
                      <option key={code} value={code}>
                        {flagEmoji(code)} {countryName(code)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {savingCountry && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />}
            </div>
          </div>

          <div className="md:ml-auto bg-[#0f0f0f] border border-[#222] rounded-xl px-6 py-4 text-center min-w-30">
            <div className="text-2xl font-bold text-emerald-400 font-mono">{profile.solvedCount || 0}</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">Solves</div>
          </div>
        </div>

        {/* --- DIVIDER --- */}
        <div className="w-full h-px bg-linear-to-r from-transparent via-[#222] to-transparent mb-10" />

        {/* --- BADGE DETAIL PANEL --- shows whichever badge is currently
             selected below (any badge, locked or not - defaults to the
             equipped one), with its name/description/unlock requirement
             (the same `description` field doubles as both) and a separate
             Equip action, disabled for badges not yet unlocked. */}
        <div className="flex flex-col items-center justify-center text-center mb-12">
            <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-600 mb-1">Badge</span>
            <div className="flex flex-col items-center gap-px">
                <h2 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-linear-to-br from-white to-slate-400 uppercase tracking-widest">
                    {viewedBadge?.badgeName}
                </h2>
                {viewedBadge?.isLimited && (
                    <span className="px-2 py-0.5 rounded-sm text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30 font-mono uppercase mb-2">
                      Limited to {parseInt(viewedBadge.numberAvailable) + parseInt(viewedBadge.numberOwned)}
                    </span>
                )}
            </div>

            <p className="text-slate-400 max-w-xl text-sm leading-relaxed font-light">
                {viewedBadge?.description}
            </p>

            {viewedIsActive ? (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-900/20 border border-emerald-500/20 text-emerald-400 text-xs font-mono uppercase tracking-wider mt-2">
                  <ShieldCheck size={12} />
                  Currently Equipped
              </div>
            ) : (
              <button
                onClick={() => handleEquip(viewedBadge.badgeName)}
                disabled={viewedIsLocked || equipping === viewedBadge?.badgeName}
                className={`
                  flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider mt-2 transition-colors
                  ${viewedIsLocked
                    ? 'bg-[#0a0a0a] border border-[#222] text-slate-600 cursor-not-allowed'
                    : 'bg-slate-800/40 border border-slate-500/30 text-slate-200 hover:bg-slate-700/50 hover:border-slate-400/50 cursor-pointer'}
                `}
              >
                {equipping === viewedBadge?.badgeName ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : viewedIsLocked ? (
                  <Lock size={12} />
                ) : (
                  <Sparkles size={12} />
                )}
                {viewedIsLocked ? 'Locked' : 'Equip'}
              </button>
            )}
        </div>

        {/* --- BADGE GRID --- every tile (locked included) selects itself
             into the detail panel above to preview it; equipping only
             happens through that panel's explicit Equip button. */}
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4 justify-items-center">
          {profile.badges.map((badge: any, index: number) => {
            const isActive = badge.badgeName === profile.badgeSelected;
            const isLocked = !badge.isUnlocked;
            const isViewed = badge.badgeName === viewedBadge?.badgeName;

            return (
              <button
                // FIX: Unique key using ID + Index to satisfy React warning
                key={`${badge.badgeName}-${index}`}
                onClick={() => setViewedBadgeName(badge.badgeName)}
                disabled={equipping === badge.badgeName}
                title={isLocked ? `${badge.badgeName} (locked)` : badge.badgeName}
                className={`
                  group relative w-full aspect-square rounded-xl transition-all duration-300 flex items-center justify-center overflow-hidden cursor-pointer
                  ${badge.noBorder
                    ? isActive
                      ? 'border border-transparent shadow-[0_0_20px_-4px_rgba(191,140,255,0.6)] scale-105 z-10'
                      : isViewed
                        ? 'border border-transparent shadow-[0_0_20px_-4px_rgba(191,140,255,0.35)] scale-105 z-10'
                        : isLocked
                          ? 'border border-[#1a1a1a] bg-[#080808] opacity-40 grayscale hover:opacity-60 hover:grayscale-0'
                          : 'border border-transparent hover:scale-105'
                    : isActive
                      ? 'border bg-emerald-900/10 border-emerald-500/50 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)] scale-105 z-10'
                      : isViewed
                        ? 'border bg-slate-800/20 border-slate-400/50 shadow-[0_0_15px_-5px_rgba(148,163,184,0.3)] scale-105 z-10'
                        : isLocked
                          ? 'border bg-[#080808] border-[#1a1a1a] opacity-40 grayscale hover:opacity-60 hover:grayscale-0'
                          : 'border bg-[#0a0a0a] border-[#222] hover:border-slate-500 hover:bg-[#111] hover:scale-105'
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

        {/* --- DIVIDER --- */}
        <div className="w-full h-px bg-linear-to-r from-transparent via-[#222] to-transparent my-10" />

        {/* --- TITLE DETAIL PANEL --- same preview/equip split as badges,
             but titles are plain text (no icon), so the grid below is a row
             of pills instead of an icon grid. */}
        <div className="flex flex-col items-center justify-center text-center mb-12">
            <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-600 mb-1">Title</span>
            <div className="flex flex-col items-center gap-px">
                <h2
                  className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text uppercase tracking-widest"
                  style={viewedTitle?.colorFrom ? {
                    backgroundImage: `linear-gradient(135deg, ${viewedTitle.colorFrom}, ${viewedTitle.colorTo})`,
                    filter: `drop-shadow(0 0 6px ${viewedTitle.colorFrom}80) drop-shadow(0 0 14px ${viewedTitle.colorTo}80)`
                  } : {
                    backgroundImage: 'linear-gradient(to bottom right, white, #94a3b8)'
                  }}
                >
                    {viewedTitle?.titleName}
                </h2>
                {viewedTitle?.isLimited && (
                    <span className="px-2 py-0.5 rounded-sm text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30 font-mono uppercase mb-2">
                      Limited to {parseInt(viewedTitle.numberAvailable) + parseInt(viewedTitle.numberOwned)}
                    </span>
                )}
            </div>

            <p className="text-slate-400 max-w-xl text-sm leading-relaxed font-light">
                {viewedTitle?.description}
            </p>

            {viewedTitleIsActive ? (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-900/20 border border-emerald-500/20 text-emerald-400 text-xs font-mono uppercase tracking-wider mt-2">
                  <ShieldCheck size={12} />
                  Currently Equipped
              </div>
            ) : (
              <button
                onClick={() => handleEquipTitle(viewedTitle.titleName)}
                disabled={viewedTitleIsLocked || equippingTitle === viewedTitle?.titleName}
                className={`
                  flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider mt-2 transition-colors
                  ${viewedTitleIsLocked
                    ? 'bg-[#0a0a0a] border border-[#222] text-slate-600 cursor-not-allowed'
                    : 'bg-slate-800/40 border border-slate-500/30 text-slate-200 hover:bg-slate-700/50 hover:border-slate-400/50 cursor-pointer'}
                `}
              >
                {equippingTitle === viewedTitle?.titleName ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : viewedTitleIsLocked ? (
                  <Lock size={12} />
                ) : (
                  <Sparkles size={12} />
                )}
                {viewedTitleIsLocked ? 'Locked' : 'Equip'}
              </button>
            )}
        </div>

        {/* --- TITLE ROW --- every pill (locked included) selects itself into
             the detail panel above; equipping only happens through that
             panel's explicit Equip button, same as the badge grid. */}
        <div className="flex flex-wrap gap-3 justify-center">
          {profile.titles.map((title: any, index: number) => {
            const isActive = title.titleName === profile.titleSelected;
            const isLocked = !title.isUnlocked;
            const isViewed = title.titleName === viewedTitle?.titleName;

            return (
              <button
                key={`${title.titleName}-${index}`}
                onClick={() => setViewedTitleName(title.titleName)}
                disabled={equippingTitle === title.titleName}
                title={isLocked ? `${title.titleName} (locked)` : title.titleName}
                className={`
                  relative flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-mono uppercase tracking-wider transition-all duration-300 cursor-pointer
                  ${isActive
                    ? 'bg-emerald-900/10 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]'
                    : isViewed
                      ? 'bg-slate-800/20 border-slate-400/50 text-slate-200 shadow-[0_0_15px_-5px_rgba(148,163,184,0.3)]'
                      : isLocked
                        ? 'bg-[#080808] border-[#1a1a1a] text-slate-600 opacity-50 hover:opacity-75'
                        : title.colorFrom
                          ? 'bg-[#0a0a0a] hover:opacity-90'
                          : 'bg-[#0a0a0a] border-[#222] text-slate-400 hover:border-slate-500 hover:text-slate-200'
                  }
                `}
                style={!isActive && !isViewed && !isLocked && title.colorFrom ? {
                  borderColor: `${title.colorFrom}80`,
                  color: title.colorFrom
                } : undefined}
              >
                {isLocked && <Lock size={11} className="text-slate-600" />}
                {title.titleName}

                {equippingTitle === title.titleName && (
                  <Loader2 size={11} className="animate-spin" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}