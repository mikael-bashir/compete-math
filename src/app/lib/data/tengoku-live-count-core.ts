// The pure part of the live Tengoku count: which files of the tree's data/ directory hold records, and how to count them.
// No Next, no network, so it is tested on its own (tests/tengoku-search/live-count.test.ts).
//
// What counts, exactly as scripts/stats.py in competemath/tengoku defines it (one record is one line):
//   trusted  = every line of data/trusted/*.jsonl  +  every line of data/intake/<library>/manifest.jsonl
//              (a factory bundle has no records: its manifest lists the theorems the merge queue built, trusted by the tree's rule)
//   staging  = every line of data/staging/*.jsonl
// Tentative is not counted here: its files are 3 GB, so it stays whatever the tree's stats.json says.

export interface TreeFile {
  path: string;
  sha: string;
}

const TRUSTED = /^data\/trusted\/[^/]+\.jsonl$/;
const STAGING = /^data\/staging\/[^/]+\.jsonl$/;
const INTAKE = /^data\/intake\/[^/]+\/manifest\.jsonl$/;

export function selectCounted(files: TreeFile[]): { trusted: TreeFile[]; staging: TreeFile[]; intake: TreeFile[] } {
  return {
    trusted: files.filter((f) => TRUSTED.test(f.path)),
    staging: files.filter((f) => STAGING.test(f.path)),
    intake: files.filter((f) => INTAKE.test(f.path)),
  };
}

/** The number of newline bytes across the chunks of one file (a record is a line; stats.py counts newlines the same way). */
export function countNewlines(chunks: Iterable<Uint8Array>): number {
  let n = 0;
  for (const chunk of chunks) {
    let i = chunk.indexOf(10);
    while (i !== -1) {
      n++;
      i = chunk.indexOf(10, i + 1);
    }
  }
  return n;
}
