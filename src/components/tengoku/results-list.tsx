'use client';

import { Badge } from '@/components/ui/badge';
import type { TengokuEntry } from '@/app/lib/data/tengoku';

function StatusBadge({ status }: { status: TengokuEntry['status'] }) {
  if (status === 'trusted') {
    return (
      <Badge className="border-emerald-400/30 bg-emerald-500/10 font-code text-[10px] uppercase tracking-[0.16em] text-emerald-300">
        Leak-trusted
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-400/30 font-code text-[10px] uppercase tracking-[0.16em] text-white"
    >
      Tentative
    </Badge>
  );
}

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
        <div
          key={`${entry.library}:${entry.name}`}
          className="rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/20"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="w-full break-all font-code text-sm font-semibold text-white!">
              {entry.name}
            </span>
            <StatusBadge status={entry.status} />
            <Badge
              variant="outline"
              className="border-white/15 font-code text-[10px] uppercase tracking-[0.16em] text-white/60"
            >
              {entry.library}
            </Badge>
            <span className="font-code text-[10px] text-white/30">
              {entry.toolchain}
            </span>
            {entry.compatibleToolchains.length > 0 && (
              <span
                className="font-code text-[10px] text-white/25"
                title={`Also verified under: ${entry.compatibleToolchains.join(', ')}`}
              >
                + {entry.compatibleToolchains.length} more toolchain
                {entry.compatibleToolchains.length === 1 ? '' : 's'}
              </span>
            )}
            <a
              href={entry.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto font-code text-[10px] text-emerald-300/80 no-underline hover:text-emerald-300"
            >
              source &rarr;
            </a>
          </div>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words font-code text-xs leading-relaxed text-white/60">
            {entry.statement}
          </pre>
          <details className="mt-1.5 group">
            <summary className="cursor-pointer font-code text-[10px] uppercase tracking-[0.12em] text-white/30 hover:text-white/50">
              proof
            </summary>
            <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 font-code text-xs leading-relaxed text-white/50">
              {entry.proof}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}
