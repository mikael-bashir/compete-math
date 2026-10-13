import { unstable_cache } from "next/cache";
import seed from "./tengoku-tentative-seed.json";
import { gh, RAW, REF, streamCount } from "./tengoku-live-count";
import { applyCommit, byLibrary, isTentativeFile, needsDirectCount, totalOf, type CommitFile } from "./tengoku-tentative-core";

export interface TentativeCount {
  total: number;
  byLibrary: Record<string, number>;
  /** commits after the seed that were replayed */
  replayed: number;
}

interface CommitView {
  files: CommitFile[];
  direct: Record<string, number>;
}

const MAX_REPLAY = 100; // one page of the commit list; the seed is refreshed long before tentative data changes this often

// The tentative-relevant part of one commit (a commit never changes, so it is cached for good by its sha).
function readCommit(sha: string): Promise<CommitView> {
  return unstable_cache(
    async () => {
      const files: CommitFile[] = [];
      for (let page = 1; ; page++) {
        const c = await gh<{ files?: CommitFile[] }>(`/commits/${sha}?page=${page}`);
        const fs = c.files ?? [];
        files.push(...fs);
        if (fs.length < 300) break;
      }
      const relevant = files
        .filter((f) => isTentativeFile(f.filename) || (f.previous_filename && isTentativeFile(f.previous_filename)))
        .map(({ filename, status, additions, deletions, previous_filename }) => ({ filename, status, additions, deletions, previous_filename }));
      const direct: Record<string, number> = {};
      for (const f of relevant) if (needsDirectCount(f)) direct[f.filename] = await streamCount(`${RAW}/${sha}/${f.filename}`);
      return { files: relevant, direct };
    },
    ["tengoku-tentative-commit-v1", sha],
    { revalidate: false },
  )();
}

/** The number of tentative records now: the seed's counts plus every later commit that touched data/tentative. */
export async function countTentative(): Promise<TentativeCount> {
  const list = await gh<{ sha: string }[]>(`/commits?sha=${REF}&path=data/tentative&per_page=${MAX_REPLAY}`);
  const at = list.findIndex((c) => c.sha === seed.commit);
  if (at === -1) throw new Error(`the tentative seed commit ${seed.commit.slice(0, 8)} is not among the last ${MAX_REPLAY} commits that touched data/tentative`);
  const after = list.slice(0, at).reverse(); // oldest first
  let state: Record<string, number> = { ...seed.files };
  for (const c of after) {
    const v = await readCommit(c.sha);
    state = applyCommit(state, v.files, v.direct);
  }
  return { total: totalOf(state), byLibrary: byLibrary(state), replayed: after.length };
}
