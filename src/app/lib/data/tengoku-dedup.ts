import { unstable_cache } from "next/cache";
import seed from "./tengoku-dedup-seed.json";
import { listData, RAW } from "./tengoku-live-count";
import { collectTrusted, countAlreadyTrusted, TrustedTokens } from "./tengoku-dedup-core";

// Counts, per library, the tentative records of theorems the tree already trusts (tengoku-dedup-core.ts says which, one tentative
// record per trusted theorem), so that the
// page counts a theorem once, as scripts/stats.py does. A library's count depends only on its three files (tentative, trusted,
// manifest), so it is cached by their shas for good; the seed holds the counts at one commit so a cold cache streams only the
// libraries whose files changed since.

export interface AlreadyTrusted {
  total: number;
  byLibrary: Record<string, number>;
  commit: string;
}

const BUDGET_MS = 45_000;

async function* body(url: string): AsyncGenerator<Uint8Array> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`${url} ${res.status}`);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

interface Triple {
  tentative: string;
  trusted: string | null;
  manifest: string | null;
}

function countOne(lib: string, t: Triple, commit: string): Promise<number> {
  const seeded = (seed.libraries as Record<string, Triple & { alreadyTrusted: number }>)[lib];
  if (seeded && seeded.tentative === t.tentative && seeded.trusted === t.trusted && seeded.manifest === t.manifest) return Promise.resolve(seeded.alreadyTrusted);
  return unstable_cache(
    async () => {
      const trusted = new TrustedTokens();
      if (t.trusted) await collectTrusted(trusted, body(`${RAW}/${commit}/data/trusted/${lib}.jsonl`), true);
      if (t.manifest) await collectTrusted(trusted, body(`${RAW}/${commit}/data/intake/${lib}/manifest.jsonl`), false);
      return countAlreadyTrusted(trusted, body(`${RAW}/${commit}/data/tentative/${lib}.jsonl`));
    },
    ["tengoku-already-trusted-v2", t.tentative, t.trusted ?? "-", t.manifest ?? "-"],
    { revalidate: false },
  )();
}

export async function countAlreadyTrustedLive(): Promise<AlreadyTrusted> {
  const work = (async (): Promise<AlreadyTrusted> => {
    const { commit, files } = await listData();
    const sha = new Map(files.map((f) => [f.path, f.sha]));
    const triples: [string, Triple][] = [];
    for (const [path, tentative] of sha) {
      const m = /^data\/tentative\/([^/]+)\.jsonl$/.exec(path);
      if (!m) continue;
      const lib = m[1];
      const trusted = sha.get(`data/trusted/${lib}.jsonl`) ?? null;
      const manifest = sha.get(`data/intake/${lib}/manifest.jsonl`) ?? null;
      if (trusted || manifest) triples.push([lib, { tentative, trusted, manifest }]);
    }
    const byLibrary: Record<string, number> = {};
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, triples.length) }, async () => {
        for (;;) {
          const i = next++;
          if (i >= triples.length) return;
          const [lib, t] = triples[i];
          const n = await countOne(lib, t, commit);
          if (n > 0) byLibrary[lib] = n;
        }
      }),
    );
    return { total: Object.values(byLibrary).reduce((a, b) => a + b, 0), byLibrary, commit };
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`counting the already-trusted records did not finish in ${BUDGET_MS / 1000}s`)), BUDGET_MS);
  });
  try {
    return await Promise.race([work, budget]);
  } finally {
    clearTimeout(timer);
  }
}
