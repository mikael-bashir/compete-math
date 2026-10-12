// Counts the trusted records of competemath/tengoku live, from the tree itself (see tengoku-live-count-core.ts for what counts).
//
// How it stays cheap: the directory listing (a few KB from the GitHub API) is cached for five minutes; a file's line count is cached
// by the file's git blob sha, which changes only when the file does, so a revalidation re-reads only the files that changed and a
// cold start streams the roughly 280 MB of trusted, staging and intake files once. The result is cached by the callers (ISR).
import { unstable_cache } from "next/cache";
import { countNewlines, selectCounted, type TreeFile } from "./tengoku-live-count-core";

const REPO = "competemath/tengoku";
const REF = process.env.TENGOKU_REF || "main";
const API = `https://api.github.com/repos/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${REPO}`;
const LISTING_REVALIDATE_SECONDS = 300;
const CONCURRENCY = 8;
const BUDGET_MS = 45_000;

export interface LiveCount {
  trusted: number;
  trustedRecords: number;
  trustedIntake: number;
  staging: number;
  commit: string;
  countedAt: string;
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "competemath-tengoku-count" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// A token lifts the 60-requests-an-hour limit that Vercel's shared addresses hit. The repo is public, so a token that GitHub refuses
// (expired, restricted to other repos) must not break the count: the same call is retried without it.
const TOKEN = process.env.TENGOKU_COUNT_TOKEN || process.env.GITHUB_TOKEN || "";

async function gh<T>(path: string): Promise<T> {
  const call = (token?: string) => fetch(`${API}${path}`, { headers: headers(token), next: { revalidate: LISTING_REVALIDATE_SECONDS } });
  let res = await call(TOKEN || undefined);
  if (TOKEN && (res.status === 401 || res.status === 403)) res = await call();
  if (!res.ok) {
    const why = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? "";
    throw new Error(`GitHub ${path} ${res.status} ${why}`.trim());
  }
  return (await res.json()) as T;
}

async function listData(): Promise<{ commit: string; files: TreeFile[] }> {
  const head = await gh<{ sha: string; commit: { tree: { sha: string } } }>(`/commits/${REF}`);
  const root = await gh<{ tree: { path: string; type: string; sha: string }[] }>(`/git/trees/${head.commit.tree.sha}`);
  const data = root.tree.find((e) => e.path === "data" && e.type === "tree");
  if (!data) throw new Error("the tree has no data/ directory");
  const sub = await gh<{ truncated?: boolean; tree: { path: string; type: string; sha: string }[] }>(`/git/trees/${data.sha}?recursive=1`);
  if (sub.truncated) throw new Error("the data/ listing was truncated");
  const files = sub.tree.filter((e) => e.type === "blob").map((e) => ({ path: `data/${e.path}`, sha: e.sha }));
  return { commit: head.sha, files };
}

async function streamCount(url: string): Promise<number> {
  const res = await fetch(url, { cache: "no-store" }); // a 50 MB body does not fit Next's fetch cache; the count is what gets cached
  if (!res.ok || !res.body) throw new Error(`${url} ${res.status}`);
  const reader = res.body.getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += countNewlines([value]);
  }
  return n;
}

function linesOf(file: TreeFile, commit: string): Promise<number> {
  return unstable_cache(() => streamCount(`${RAW}/${commit}/${file.path}`), ["tengoku-lines-v1", file.sha], { revalidate: false })();
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function countLiveTrusted(): Promise<LiveCount> {
  const work = (async (): Promise<LiveCount> => {
    const { commit, files } = await listData();
    const sel = selectCounted(files);
    const all = [...sel.trusted, ...sel.intake, ...sel.staging];
    const lines = await pool(all, CONCURRENCY, (f) => linesOf(f, commit));
    const sum = (part: TreeFile[]) => part.reduce((acc, f) => acc + lines[all.indexOf(f)], 0);
    const trustedRecords = sum(sel.trusted);
    const trustedIntake = sum(sel.intake);
    return { trusted: trustedRecords + trustedIntake, trustedRecords, trustedIntake, staging: sum(sel.staging), commit, countedAt: new Date().toISOString() };
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`the live count did not finish in ${BUDGET_MS / 1000}s`)), BUDGET_MS);
  });
  try {
    return await Promise.race([work, budget]);
  } finally {
    clearTimeout(timer);
  }
}
