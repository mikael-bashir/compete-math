'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { TengokuEntry } from '@/app/lib/data/tengoku';
import { SquircleLoader } from './squircle-loader';

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

interface SourceInfo {
  proof: string;
  script: string;
  declaration: string;
  generatedFrom: string | null;
}

// The index keeps no proofs: the dropdown reads the declaration from the tree, at the commit the result came from, the first time it is opened.
function ProofPanel({ entry }: { entry: TengokuEntry }) {
  const [info, setInfo] = useState<SourceInfo | null>(
    entry.proof ? { proof: entry.proof, script: '', declaration: '', generatedFrom: null } : null,
  );
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [copied, setCopied] = useState(false);

  async function load() {
    if (info || state === 'loading' || !entry.sourceUrl) return;
    setState('loading');
    try {
      const qs = new URLSearchParams({
        url: entry.sourceUrl,
        name: entry.name,
        statement: entry.statement,
        library: entry.library,
        tier: entry.status,
      });
      const res = await fetch(`/api/tengoku/source?${qs.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      setInfo((await res.json()) as SourceInfo);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  async function copy() {
    if (!info?.script) return;
    try {
      await navigator.clipboard.writeText(info.script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <details className="mt-1.5 group" onToggle={(e) => e.currentTarget.open && void load()}>
      <summary className="cursor-pointer font-code text-[10px] uppercase tracking-[0.12em] text-white/30 hover:text-white/50">
        proof
      </summary>
      {state === 'loading' && <p className="mt-1.5 font-code text-xs text-white/40">Reading the proof from the tree…</p>}
      {state === 'error' && (
        <p className="mt-1.5 font-code text-xs text-white/40">
          Could not read the proof here.{' '}
          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-300/80 no-underline hover:text-emerald-300">
            Open the source &rarr;
          </a>
        </p>
      )}
      {info && (
        <>
          {info.generatedFrom && (
            <p className="mt-1.5 font-code text-[11px] text-white/40">
              Generated from <span className="text-white/60">{info.generatedFrom}</span> by an attribute (<code>to_additive</code>): this is the proof of that declaration.
            </p>
          )}
          <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 font-code text-xs leading-relaxed text-white/50">
            {info.proof || '(no proof term: a definition, structure or class)'}
          </pre>
          {info.script && (
            <div className="mt-2">
              <div className="flex items-center gap-3">
                <span className="font-code text-[10px] uppercase tracking-[0.12em] text-white/30">run it in a Tengoku checkout</span>
                <button
                  type="button"
                  onClick={copy}
                  className="ml-auto cursor-pointer rounded border border-white/15 px-2 py-0.5 font-code text-[10px] uppercase tracking-[0.12em] text-white/60 hover:border-white/30 hover:text-white"
                >
                  {copied ? 'copied' : 'copy script'}
                </button>
              </div>
              <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre rounded bg-black/30 p-2 font-code text-xs leading-relaxed text-white/50">
                {info.script}
              </pre>
            </div>
          )}
        </>
      )}
    </details>
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
      <div className="mt-8 flex justify-center">
        <SquircleLoader label="Searching" />
      </div>
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
          <ProofPanel entry={entry} />
        </div>
      ))}
    </div>
  );
}
