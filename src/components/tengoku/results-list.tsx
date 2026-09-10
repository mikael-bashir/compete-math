'use client';

import { Badge } from '@/components/ui/badge';
import type { TengokuEntry } from '@/app/lib/data/tengoku';

export function TengokuResultsList({
  results,
  loading,
  hasSearched,
}: {
  results: TengokuEntry[];
  loading: boolean;
  hasSearched: boolean;
}) {
  if (loading) {
    return (
      <p className="mt-8 text-center text-sm text-white/40">Searching…</p>
    );
  }

  if (hasSearched && results.length === 0) {
    return (
      <p className="mt-8 text-center text-sm text-white/40">
        No matching theorems found.
      </p>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="mt-8 space-y-3">
      {results.map((entry) => (
        <a
          key={entry.id}
          href={entry.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 no-underline transition-colors hover:border-white/20"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-code text-sm font-semibold text-white!">
              {entry.name}
            </span>
            <Badge variant="outline" className="font-code text-[10px] uppercase tracking-[0.16em]">
              {entry.library}
            </Badge>
            <span className="font-code text-[10px] text-white/30">
              {entry.toolchain}
            </span>
          </div>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words font-code text-xs leading-relaxed text-white/60">
            {entry.statement}
          </pre>
        </a>
      ))}
    </div>
  );
}
