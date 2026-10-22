'use client';

import { useState } from 'react';
import { BookMarked, ChevronRight, Copy, Download, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { MemoryEntry } from '@/lib/prover/memory-client';
import { qualityOf, rankedAt, ratedSummary } from '@/lib/prover/entry-quality';
import { StarRating } from './star-rating';

interface Props {
  targetId: string;
  targetTitle: string;
  entries: MemoryEntry[];
  signedIn: boolean;
  loading: boolean;
  stats: Record<string, number> | null;
  maxNominated: number;
  minNominated: number;
  onNominate: (id: string, on: boolean) => void;
  onDelete: (id: string) => void;
}

const when = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Every theorem the signed-in account's runs saved for the selected target, with the nomination that decides what the
// Tengoku audit will look at. The list is the account's own: the API filters by username.
export function LeakMemoryModal({ targetId, targetTitle, entries, signedIn, loading, stats, maxNominated, minNominated, onNominate, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bestFirst, setBestFirst] = useState(true);
  const nominated = entries.filter((e) => e.nominated).length;
  const visible = entries.filter((e) => !e.subsumedBy || e.nominated);
  // best first puts the highest-rated theorems on top (unrated ones last); otherwise the order the account saved them in
  const shown = bestFirst ? [...visible].sort((a, b) => (qualityOf(targetId, b.id)?.s ?? 0) - (qualityOf(targetId, a.id)?.s ?? 0)) : visible;
  const rated = ratedSummary(targetId, shown.map((e) => e.id));
  const ratedOn = rankedAt(targetId);
  const merged = entries.length - visible.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
          title="The verified theorems your runs saved for this target"
        >
          <BookMarked className="size-3" />
          Saved theorems{shown.length ? ` (${shown.length})` : ''}
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Saved theorems · {targetTitle}</DialogTitle>
          <DialogDescription>
            Verified on Leak IV during your runs. Only your account can see these.{' '}
            {ratedOn
              ? `Stars say how much each one adds (${rated.rated} of ${rated.total} rated, ranked ${ratedOn}); hover one to see what it means. `
              : ''}
            {nominated >= minNominated
              ? `${nominated} nominated, enough for a Tengoku audit.`
              : `Nominate ${minNominated}–${maxNominated} to put them forward for the Tengoku audit (${nominated} so far).`}
          </DialogDescription>
        </DialogHeader>

        {stats && (
          <p className="text-[11px] text-muted-foreground">
            This session: {stats.saves ?? 0} saved, {stats.updates ?? 0} improved, {stats.recalls ?? 0} recalls ({stats.recallHits ?? 0} with a hit)
            {stats.injected ? `, ${stats.injected} injected into search` : ''}
            {stats.sleeps ? `, ${stats.sleeps} sleep pass(es) merged ${stats.abstracted ?? 0}` : ''}
            {stats.nudges ? `, ${stats.nudges} reminder(s) after the agent stopped early` : ''}.
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          {ratedOn && (
            <button
              type="button"
              onClick={() => setBestFirst((v) => !v)}
              className="inline-flex h-6 items-center rounded-md border px-2 text-[10px] transition-colors hover:bg-muted"
              title="Switch between the highest-rated first and the order the theorems were saved in"
            >
              {bestFirst ? 'Best first' : 'In saved order'}
            </button>
          )}
          {signedIn && nominated >= minNominated && (
            <a
              href={`/api/leak/memory/bundle?target=${encodeURIComponent(targetId)}`}
              download
              className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] transition-colors hover:bg-muted [&_svg]:size-3"
              title="Download the nominated theorems as the bundle the Tengoku intake takes. Nothing is sent anywhere."
            >
              <Download /> Export nominated ({nominated})
            </a>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {!signedIn && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              Sign in to keep these between sessions. Until then they live in this tab only.
            </p>
          )}
          {loading && <p className="p-3 text-xs text-muted-foreground">Loading…</p>}
          {!loading && shown.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">Nothing saved yet. Run a Control II memory variant on this target and every non-trivial theorem it proves is kept here.</p>
          )}
          {/* inline: the page's prose styles set list padding with more weight than a utility class */}
          <ul className="list-none space-y-1.5" style={{ margin: 0, padding: 0 }}>
            {shown.map((e) => {
              const expanded = openId === e.id;
              return (
                <li key={e.id} className="list-none rounded-md border bg-background/40" style={{ margin: 0, padding: 0 }}>
                  <div className="flex items-start gap-2 p-2">
                    <button
                      type="button"
                      onClick={() => setOpenId(expanded ? null : e.id)}
                      className="mt-0.5 text-muted-foreground"
                      aria-label={expanded ? 'Hide proof' : 'Show proof'}
                      aria-expanded={expanded}
                    >
                      <ChevronRight className={`size-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(() => {
                          const q = qualityOf(targetId, e.id);
                          return q ? (
                            <StarRating stars={q.s} quality={q} />
                          ) : ratedOn ? (
                            <span className="text-[10px] text-muted-foreground" title="Saved since this target was last ranked, so it has no rating yet">
                              unrated
                            </span>
                          ) : null;
                        })()}
                        <span className="truncate font-mono text-xs font-medium">{e.name}</span>
                        {e.isTarget && <span className="rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-600 dark:text-emerald-400">target</span>}
                        {e.origin !== 'verified' && <span className="rounded bg-violet-500/15 px-1 text-[10px] text-violet-600 dark:text-violet-400">{e.origin}</span>}
                        <span className="text-[10px] text-muted-foreground">
                          {when(e.savedAt)}
                          {e.hits ? ` · recalled ${e.hits}×` : ''}
                          {e.subsumes.length ? ` · merges ${e.subsumes.length}` : ''}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 break-words font-mono text-[11px] text-muted-foreground">{e.statement}</p>
                    </div>
                    <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground" title={`Nominate for the Tengoku audit (${minNominated}–${maxNominated} per target)`}>
                      <input
                        type="checkbox"
                        checked={e.nominated}
                        disabled={!signedIn || (!e.nominated && nominated >= maxNominated)}
                        onChange={(ev) => onNominate(e.id, ev.target.checked)}
                        className="size-3"
                      />
                      Nominate
                    </label>
                    <button
                      type="button"
                      onClick={() => onDelete(e.id)}
                      className="mt-0.5 text-muted-foreground hover:text-rose-500"
                      aria-label={`Delete ${e.name}`}
                      title="Delete from your memory"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  {expanded && (
                    <div className="border-t p-2">
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono text-[11px]">{e.closure}</pre>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1.5 h-6 gap-1 px-2 text-[10px] [&_svg]:size-3"
                        onClick={() => void navigator.clipboard?.writeText(e.closure).catch(() => {})}
                      >
                        <Copy /> Copy
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {merged > 0 && <p className="mt-2 text-[10px] text-muted-foreground">{merged} more were merged into the general lemmas above and are hidden.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
