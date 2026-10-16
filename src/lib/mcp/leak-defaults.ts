// The three Leak services every prover run wants: search over Tengoku (I), the proof-state daemon (II) and the compile gate (IV). Their
// endpoints are public and need no key, so signing in can register them for the user with no secret ever reaching the browser.
//
// They are seeded once per browser. Someone who removes one on purpose is not given it back on the next visit; "Restore Leak defaults" does that.

import type { MCPServer } from '@/lib/types/mcp';

export interface LeakDefaultServer {
  /** the name the prover sees: tools then appear as mcp__Leak_I__loogle_search and so on */
  name: string;
  url: string;
  role: string;
}

export const LEAK_DEFAULT_SERVERS: readonly LeakDefaultServer[] = [
  { name: 'Leak_I', url: 'https://barkingtree-leak-i.hf.space/sse', role: 'search over Tengoku (loogle, moogle)' },
  { name: 'Leak_II', url: 'https://barkingtree-leak-ii.hf.space/sse', role: 'proof-state daemon' },
  { name: 'Leak_IV', url: 'https://barkingtree-leak-iv.hf.space/sse', role: 'compile gate' },
];

export const SEEDED_KEY = 'lca.leakDefaultsSeeded';

const same = (a: string, b: string): boolean => a.trim().replace(/\/+$/, '') === b.trim().replace(/\/+$/, '');

export interface SeedDeps {
  signedIn: boolean;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  list: () => MCPServer[];
  add: (input: { name: string; url: string }) => void;
  /** add whatever is missing even if this browser was seeded before (the "restore" button) */
  force?: boolean;
}

/** Registers the Leak servers that are not registered yet. Returns the names it added. */
export function seedLeakDefaults(deps: SeedDeps): string[] {
  if (!deps.signedIn) return [];
  let seeded = false;
  try {
    seeded = deps.storage.getItem(SEEDED_KEY) === '1';
  } catch {
    /* storage unavailable: behave as if never seeded, but do not loop */
  }
  if (seeded && !deps.force) return [];
  const have = deps.list();
  const added: string[] = [];
  for (const s of LEAK_DEFAULT_SERVERS) {
    if (have.some((h) => same(h.url, s.url))) continue;
    deps.add({ name: s.name, url: s.url });
    added.push(s.name);
  }
  try {
    deps.storage.setItem(SEEDED_KEY, '1');
  } catch {
    /* nothing else to do */
  }
  return added;
}

export interface LeakStatus {
  /** names of default servers registered and switched on */
  connected: string[];
  /** names of default servers missing or switched off */
  missing: string[];
}

export function leakStatus(servers: MCPServer[]): LeakStatus {
  const connected: string[] = [];
  const missing: string[] = [];
  for (const s of LEAK_DEFAULT_SERVERS) {
    const hit = servers.find((h) => same(h.url, s.url));
    (hit?.isActive ? connected : missing).push(s.name);
  }
  return { connected, missing };
}
