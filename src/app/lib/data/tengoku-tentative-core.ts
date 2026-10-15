// Tentative theorems are 2.9 GB of records, too much to read on a page load. Their number is kept exactly instead: a seed holds the
// line count of every data/tentative/*.jsonl file at one commit, and the commits after it that touch tentative data are replayed
// from the line counts GitHub reports for each changed file (additions minus deletions). This file is the replay, with no network.
//
// The definition is scripts/stats.py's: only data/tentative/<library>.jsonl counts (not files in subfolders), one record per line.

export interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  previous_filename?: string;
}

const TENTATIVE = /^data\/tentative\/[^/]+\.jsonl$/;

export function isTentativeFile(path: string): boolean {
  return TENTATIVE.test(path);
}

export function libraryOf(path: string): string {
  return path.split("/")[2].replace(/\.jsonl$/, "");
}

/** GitHub reports no line counts for some files; those have to be read directly (see needsDirectCount). */
export function needsDirectCount(f: CommitFile): boolean {
  return isTentativeFile(f.filename) && ["added", "modified", "changed"].includes(f.status) && f.additions === 0 && f.deletions === 0;
}

/**
 * The state after one commit. `direct` has the line count of every file for which needsDirectCount was true.
 * Throws on a status it does not know, so a surprise can never be counted as zero.
 */
export function applyCommit(state: Readonly<Record<string, number>>, files: CommitFile[], direct: Readonly<Record<string, number>> = {}): Record<string, number> {
  const next = { ...state };
  for (const f of files) {
    const name = f.filename;
    const prev = f.previous_filename;
    if (!["added", "removed", "modified", "renamed", "copied", "changed"].includes(f.status)) throw new Error(`unknown file status ${f.status} for ${name}`);
    if (f.status === "removed") {
      delete next[name];
      continue;
    }
    if (f.status === "renamed") {
      const carried = prev && prev in next ? next[prev] : 0;
      if (prev) delete next[prev];
      if (isTentativeFile(name)) next[name] = carried + f.additions - f.deletions;
      continue;
    }
    if (!isTentativeFile(name)) continue;
    if (needsDirectCount(f)) {
      if (!(name in direct)) throw new Error(`no direct count for ${name}`);
      next[name] = direct[name];
    } else if (f.status === "added" || f.status === "copied") {
      next[name] = (f.status === "copied" && prev && prev in next ? next[prev] : 0) + f.additions;
    } else {
      next[name] = (next[name] ?? 0) + f.additions - f.deletions;
    }
  }
  return next;
}

export function totalOf(state: Readonly<Record<string, number>>): number {
  return Object.values(state).reduce((a, b) => a + b, 0);
}

export function byLibrary(state: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [p, n] of Object.entries(state)) if (n > 0 && isTentativeFile(p)) out[libraryOf(p)] = (out[libraryOf(p)] ?? 0) + n;
  return out;
}
