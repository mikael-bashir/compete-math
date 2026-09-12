'use client';

import { useState, type FormEvent } from 'react';
import { Search, Send } from 'lucide-react';
import { TengokuResultsList } from './results-list';
import type { TengokuEntry } from '@/app/lib/data/tengoku';

export function TengokuSearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TengokuEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Search only fires on submit (Enter, or the send button) — not on every
  // keystroke. A hybrid keyword+semantic query does real work server-side
  // (an embedding pass plus several shard round trips), so firing it once
  // per submitted query instead of once per character is both faster to use
  // and meaningfully cheaper to run.
  async function runSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/tengoku/search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <form
        onSubmit={runSearch}
        className="relative flex items-center rounded-full border border-white/15 bg-white/[0.03] pl-11 pr-1.5 transition-colors focus-within:border-emerald-400/40"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search theorem statements…"
          className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/30"
        />
        <div aria-hidden="true" className="mx-1.5 h-6 w-px shrink-0 bg-white/15" />
        <button
          type="submit"
          aria-label="Search"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/50 outline-none transition-colors hover:text-emerald-300 focus-visible:text-emerald-300"
        >
          <Send className="size-4" />
        </button>
      </form>
      <TengokuResultsList results={results} loading={loading} hasSearched={hasSearched} />
    </div>
  );
}
