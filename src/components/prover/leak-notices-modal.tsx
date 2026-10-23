'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, ExternalLink, Eye, EyeOff, Info, XCircle } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { actOnNotice, loadDriverBlock, loadNotices, markAllSeen, savePrefs, type Notice, type NoticesState, type Prefs } from '@/lib/prover/notices-client';

interface Props {
  targetId: string;
  targetTitle: string;
  signedIn: boolean;
  /** called after the account changes anything the driver is told, so a run in progress can pick it up sooner */
  onChange?: () => void;
}

const LEVEL_STYLE: Record<Notice['level'], { icon: typeof Info; tone: string; label: string }> = {
  error: { icon: XCircle, tone: 'text-red-600 dark:text-red-400 border-red-500/40', label: 'Needs attention' },
  warn: { icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400 border-amber-500/40', label: 'Changes needed' },
  info: { icon: Info, tone: 'text-sky-600 dark:text-sky-400 border-sky-500/40', label: 'Progress' },
  success: { icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40', label: 'Accepted' },
};

const when = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fieldClass = 'h-7 w-full min-w-0 rounded-md border bg-background px-2 text-[11px]';

// What became of the theorems this account put forward to Tengoku, per target, and what the driver is told about it. Everything here is the account's own:
// the API filters by the signed-in username. The text a reviewer wrote is shown (escaped) to the account and is never handed to the driver; the driver reads the
// catalogue's sentence for the notice's code (see "What the driver reads").
export function LeakNoticesModal({ targetId, targetTitle, signedIn, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<NoticesState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'target' | 'all'>('target');
  const [showIgnored, setShowIgnored] = useState(false);
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    const r = await loadNotices();
    setLoading(false);
    if (r.ok) {
      setState(r.data);
      setError(null);
    } else setError(r.error);
  }, [signedIn]);

  // counts for the button, once; the list again each time the dialog opens and every minute while it is open
  useEffect(() => {
    void refresh();
  }, [refresh, targetId]);
  useEffect(() => {
    if (!open) return;
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [open, refresh]);
  useEffect(() => {
    setPin(state?.prefs.pins[targetId] ?? '');
    setPreview(null);
  }, [state?.prefs.pins, targetId]);

  const counts = state?.counts[targetId];
  const badge = counts && counts.open > 0 ? (counts.errors > 0 ? 'bg-red-500' : counts.warns > 0 ? 'bg-amber-500' : 'bg-sky-500') : null;
  const otherOpen = state ? Object.entries(state.counts).filter(([t]) => t !== targetId).reduce((n, [, c]) => n + c.open, 0) : 0;

  const prefs: Prefs | null = state?.prefs ?? null;
  const muted = useCallback(
    (n: Notice) => !!prefs?.mutes.some((m) => (m.target === undefined || m.target === n.target) && (m.code === undefined || m.code === n.code) && (m.kind === undefined || m.kind === n.kind)),
    [prefs],
  );

  const visible = useMemo(() => {
    const all = state?.notices ?? [];
    return all.filter((n) => (scope === 'all' || n.target === targetId) && (showIgnored || !n.ignored));
  }, [state, scope, targetId, showIgnored]);
  const ignoredCount = useMemo(() => (state?.notices ?? []).filter((n) => (scope === 'all' || n.target === targetId) && n.ignored).length, [state, scope, targetId]);

  const patchPrefs = async (patch: Record<string, unknown>) => {
    setSaving(true);
    const r = await savePrefs(patch);
    setSaving(false);
    if (r.ok) {
      setState((s) => (s ? { ...s, prefs: r.data.prefs } : s));
      setPreview(null);
      onChange?.();
    } else setError(r.error);
  };

  const ignore = async (n: Notice, on: boolean) => {
    setState((s) => (s ? { ...s, notices: s.notices.map((x) => (x.id === n.id ? { ...x, ignored: on, seen: true } : x)) } : s));
    const r = await actOnNotice(n.id, on ? 'ignore' : 'unignore');
    if (!r.ok) setError(r.error);
    else {
      void refresh();
      onChange?.();
    }
  };

  const showPreview = async () => {
    const r = await loadDriverBlock(targetId);
    setPreview(r.ok ? (r.data.text || 'Nothing: the driver is told nothing for this target right now.') : `Could not read (${r.error})`);
  };

  if (!signedIn) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
          title="What became of the theorems you put forward to Tengoku, and what the driver is told about it"
        >
          <Bell className="size-3" />
          Notices{counts && counts.open ? ` (${counts.open})` : ''}
          {badge && <span className={`absolute -right-0.5 -top-0.5 size-1.5 rounded-full ${badge}`} />}
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-[780px]">
        <DialogHeader>
          <DialogTitle>Notices · {targetTitle}</DialogTitle>
          <DialogDescription>
            What became of the theorems you put forward to Tengoku: pull requests opened, checks that failed, changes a reviewer asked for, theorems the bar sent back, merges. Your driver
            reads the open ones at the start of every attempt, and during a long attempt as soon as they change. Ignore or mute what is not worth its attention; only you see this.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-[11px]">{error}</p>}
        {state && !state.allowed && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]">
            The Tengoku intake is not open to this account yet, so there is nothing to report. The settings below still apply to a standing note for the driver.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <div className="inline-flex overflow-hidden rounded-md border">
            {(['target', 'all'] as const).map((s) => (
              <button key={s} type="button" onClick={() => setScope(s)} className={`px-2 py-1 transition-colors ${scope === s ? 'bg-muted font-medium' : 'hover:bg-muted/60'}`}>
                {s === 'target' ? 'This target' : `All targets${otherOpen ? ` (+${otherOpen})` : ''}`}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowIgnored((v) => !v)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted">
            {showIgnored ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            {showIgnored ? 'Hide ignored' : `Show ignored${ignoredCount ? ` (${ignoredCount})` : ''}`}
          </button>
          {counts && counts.unseen > 0 && (
            <button
              type="button"
              onClick={async () => {
                await markAllSeen(scope === 'target' ? targetId : undefined);
                void refresh();
              }}
              className="rounded-md border px-2 py-1 hover:bg-muted"
            >
              Mark all seen
            </button>
          )}
          {loading && <span className="text-muted-foreground">Loading…</span>}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {state && visible.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              {scope === 'target' ? 'No notices for this target.' : 'No notices.'} They appear once the intake takes theorems you share (see Saved theorems) and reviews them.
            </p>
          )}
          <ul className="list-none space-y-1.5" style={{ margin: 0, padding: 0 }}>
            {visible.map((n) => {
              const L = LEVEL_STYLE[n.level];
              const Icon = L.icon;
              const isMuted = muted(n);
              return (
                <li key={n.id} className={`list-none rounded-md border bg-background/40 ${n.ignored || isMuted ? 'opacity-60' : ''}`} style={{ margin: 0, padding: 0 }}>
                  <div className="flex items-start gap-2 p-2">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${L.tone.split(' ').slice(0, 2).join(' ')}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-medium">{n.title}</span>
                        <span className={`rounded border px-1 text-[9px] ${L.tone}`}>{state?.kinds[n.kind] ?? n.kind}</span>
                        {scope === 'all' && <span className="rounded border px-1 text-[9px] text-muted-foreground">{n.target}</span>}
                        {!n.seen && <span className="rounded bg-sky-500/20 px-1 text-[9px] text-sky-700 dark:text-sky-300">new</span>}
                        {n.round > 0 && <span className="text-[9px] text-muted-foreground">round {n.round + 1}</span>}
                        {n.state === 'resolved' && <span className="text-[9px] text-muted-foreground">answered</span>}
                        {isMuted && <span className="text-[9px] text-muted-foreground">muted</span>}
                        <span className="ml-auto text-[9px] text-muted-foreground">{when(n.updatedAt)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{n.meaning}</p>
                      {n.names.length > 0 && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Theorems: <span className="font-mono">{n.names.slice(0, 6).join(', ')}</span>
                          {n.names.length > 6 ? ` and ${n.names.length - 6} more` : ''}
                        </p>
                      )}
                      {n.action && (
                        <p className="mt-0.5 text-[10px]">
                          <span className="text-muted-foreground">The driver is told: </span>
                          {n.action}
                        </p>
                      )}
                      {openDetail === n.id && n.detail && (
                        <p className="mt-1 whitespace-pre-wrap rounded border bg-muted/40 p-1.5 text-[10px] text-muted-foreground">{n.detail}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                        {n.prUrl && (
                          <a href={n.prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
                            PR #{n.prNumber} <ExternalLink className="size-2.5" />
                          </a>
                        )}
                        {n.detail && (
                          <button type="button" onClick={() => setOpenDetail(openDetail === n.id ? null : n.id)} className="underline underline-offset-2">
                            {openDetail === n.id ? 'Hide the reviewer\'s words' : 'The reviewer\'s words'}
                          </button>
                        )}
                        <button type="button" onClick={() => void ignore(n, !n.ignored)} className="underline underline-offset-2">
                          {n.ignored ? 'Stop ignoring' : 'Ignore'}
                        </button>
                        {!isMuted && (
                          <>
                            <button type="button" onClick={() => void patchPrefs({ mutes: [...(prefs?.mutes ?? []), { target: n.target, code: n.code }] })} className="underline underline-offset-2" title="The driver is no longer told about this kind of notice on this target">
                              Mute here
                            </button>
                            <button type="button" onClick={() => void patchPrefs({ mutes: [...(prefs?.mutes ?? []), { code: n.code }] })} className="underline underline-offset-2" title="The driver is no longer told about this kind of notice on any target">
                              Mute everywhere
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {prefs && (
            <details className="rounded-md border p-2 text-[11px]" open={scope === 'target' && visible.length === 0 ? true : undefined}>
              <summary className="cursor-pointer select-none font-medium">What the driver is told, and what happens to this target</summary>
              <div className="mt-2 space-y-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-3" checked={prefs.driver.enabled} onChange={(e) => void patchPrefs({ driver: { enabled: e.target.checked } })} />
                  <span>Tell the driver about notices (off: it hears nothing, your notes below included)</span>
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-muted-foreground">Least severe notice it hears about</span>
                    <select className={fieldClass} value={prefs.driver.minLevel} onChange={(e) => void patchPrefs({ driver: { minLevel: e.target.value } })}>
                      <option value="info">Everything, progress included</option>
                      <option value="warn">Changes needed and failures</option>
                      <option value="error">Failures and rejections only</option>
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-muted-foreground">When a theorem is returned</span>
                    <select className={fieldClass} value={prefs.driver.revise} onChange={(e) => void patchPrefs({ driver: { revise: e.target.value } })}>
                      <option value="auto">Revise it and save the better version</option>
                      <option value="opportunistic">Revise only when it fits the target&apos;s progress</option>
                      <option value="never">Do not spend effort on it</option>
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-muted-foreground">Most notices per attempt</span>
                    <input type="number" min={1} max={12} className={fieldClass} defaultValue={prefs.driver.maxNotices} key={`mn${prefs.driver.maxNotices}`} onBlur={(e) => void patchPrefs({ driver: { maxNotices: Number(e.target.value) } })} />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-muted-foreground">Most characters per attempt (a long run pays for every one)</span>
                    <input type="number" min={300} max={4000} step={100} className={fieldClass} defaultValue={prefs.driver.maxChars} key={`mc${prefs.driver.maxChars}`} onBlur={(e) => void patchPrefs({ driver: { maxChars: Number(e.target.value) } })} />
                  </label>
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-3" checked={prefs.driver.includeSuccess} onChange={(e) => void patchPrefs({ driver: { includeSuccess: e.target.checked } })} />
                  <span>Tell it what was accepted (for a week), so it builds on it instead of proving it again</span>
                </label>
                <label className="flex items-center gap-2" title="The intake takes none of this target's kept theorems while it is paused; nothing is lost">
                  <input
                    type="checkbox"
                    className="size-3"
                    checked={prefs.pausedTargets.includes(targetId)}
                    onChange={(e) => void patchPrefs({ pausedTargets: e.target.checked ? [...prefs.pausedTargets, targetId] : prefs.pausedTargets.filter((t) => t !== targetId) })}
                  />
                  <span>Pause the intake for {targetTitle} (kept theorems stay kept, nothing is submitted)</span>
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Standing note for the driver on this target, in your words (at most 600 characters; handed over at every attempt)</span>
                  <textarea
                    className="min-h-14 rounded-md border bg-background p-1.5 text-[11px]"
                    maxLength={600}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="e.g. State general lemmas first; prefer ones about the parity of the trajectory."
                  />
                  <div>
                    <button
                      type="button"
                      disabled={saving || pin.trim() === (prefs.pins[targetId] ?? '')}
                      onClick={() => void patchPrefs({ pins: { ...prefs.pins, [targetId]: pin.trim() } })}
                      className="rounded-md border px-2 py-1 text-[10px] hover:bg-muted disabled:opacity-50"
                    >
                      Save the note
                    </button>
                  </div>
                </div>
                {prefs.mutes.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Muted</span>
                    <ul className="mt-1 flex list-none flex-wrap gap-1" style={{ margin: 0, padding: 0 }}>
                      {prefs.mutes.map((m, i) => (
                        <li key={i} className="list-none" style={{ margin: 0, padding: 0 }}>
                          <button
                            type="button"
                            onClick={() => void patchPrefs({ mutes: prefs.mutes.filter((_, j) => j !== i) })}
                            className="rounded-md border px-1.5 py-0.5 text-[10px] hover:bg-muted"
                            title="Stop muting"
                          >
                            {[m.target, m.code, m.kind].filter(Boolean).join(' · ')} ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <button type="button" onClick={() => void showPreview()} className="rounded-md border px-2 py-1 text-[10px] hover:bg-muted">
                    What the driver reads for this target now
                  </button>
                  {preview !== null && <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border bg-muted/40 p-1.5 text-[10px]">{preview}</pre>}
                </div>
              </div>
            </details>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
