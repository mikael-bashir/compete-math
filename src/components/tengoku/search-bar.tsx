'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { TengokuResultsList } from './results-list';
import type { TengokuEntry } from '@/app/lib/data/tengoku';

const DEBOUNCE_MS = 300;

export function TengokuSearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TengokuEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
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
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search theorem statements…"
          className="w-full rounded-full border border-white/15 bg-white/[0.03] py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-emerald-400/40"
        />
      </div>
      <TengokuResultsList results={results} loading={loading} hasSearched={hasSearched} />
    </div>
  );
}
