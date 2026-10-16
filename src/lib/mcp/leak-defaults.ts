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
  /** what the server really exposes (read from each server's tools/list). The prover needs it to know which server verifies. */
  tools: { name: string; args: string[] }[];
}

export const LEAK_DEFAULT_SERVERS: readonly LeakDefaultServer[] = [
  {
    name: 'Leak_I',
    url: 'https://barkingtree-leak-i.hf.space/sse',
    role: 'search over Tengoku (loogle, moogle)',
    tools: [{ name: 'loogle_search', args: ['query'] }, { name: 'moogle_search', args: ['concept'] }, { name: 'tengoku_sync', args: [] }],
  },
  {
    name: 'Leak_II',
    url: 'https://barkingtree-leak-ii.hf.space/sse',
    role: 'proof-state daemon',
    tools: ['init_proof', 'apply_tactic', 'get_current_proof_state', 'snapshot_state', 'branch_tactics', 'cleanup_memory', 'tengoku_sync'].map((name) => ({ name, args: [] })),
  },
  {
    name: 'Leak_IV',
    url: 'https://barkingtree-leak-iv.hf.space/sse',
    role: 'compile gate',
    tools: [{ name: 'verify_full_script', args: ['script'] }, { name: 'tengoku_sync', args: [] }],
  },
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

export interface ProverServerLike {
  name: string;
  url: string;
  tools?: { name: string; args: string[] }[];
}

const exposesVerify = (s: ProverServerLike): boolean => !!s.tools?.some((t) => /verify.*full.*script/i.test(t.name));

/**
 * The servers as the prover should receive them. Known Leak servers carry their real tool lists, and a server that exposes
 * verify_full_script comes first. The prover treats "the server with the verifier" (and, if it cannot tell, the first server) as the
 * one that re-checks a finished proof; handing it Leak I (search only) there makes every proof fail that check and the run never ends.
 */
export function orderForProver<T extends ProverServerLike>(servers: T[]): T[] {
  const known = servers.map((s) => {
    const d = LEAK_DEFAULT_SERVERS.find((x) => same(x.url, s.url));
    return d && !s.tools ? { ...s, tools: d.tools } : s;
  });
  return known.map((s, i) => ({ s, i })).sort((a, b) => Number(exposesVerify(b.s)) - Number(exposesVerify(a.s)) || a.i - b.i).map((x) => x.s);
}
