// Exports CompeteMath's own certified theorem statements+proofs into the
// same JSONL shape the Python harvester (scripts/tengoku-harvester/)
// produces, for Tengoku's `trusted/` folder — these rows come straight out
// of question_certificates, meaning Leak's own toolchain already compiled
// and certified them. That certification IS the "trusted" stamp; nothing
// else needs to happen before these are trusted, unlike harvested library
// theorems (see harvest.py), which land in `tentative/` until Leak
// re-verifies them itself.
//
// Usage:
//   node --env-file=.env $(which npx) tsx scripts/export-competemath-theorems.ts > /tmp/tengoku-data/trusted/competemath.jsonl

import { sql } from '@vercel/postgres';

interface CertRow {
  questionId: number;
  questionTitle: string | null;
  toolchain: string;
  proof: string;
}

// Bracket-depth scan (same idea as lean_extract.py's Python version) —
// finds the top-level `:=` that starts the proof, ignoring one nested
// inside a default-argument value, purely to split `proof` into a
// `statement` prefix for display. The FULL proof is kept either way.
function findStatementEnd(proof: string): number | null {
  const openers: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const closers = new Set(Object.values(openers));
  let depth = 0;
  for (let i = 0; i < proof.length; i++) {
    const ch = proof[i];
    if (ch in openers) depth++;
    else if (closers.has(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && proof.startsWith(':=', i)) return i;
  }
  return null;
}

function extractName(statement: string): string {
  const match = statement.match(/\b(?:theorem|lemma)\s+([A-Za-z_][A-Za-z0-9_'.]*)/);
  return match?.[1] ?? 'unnamed';
}

async function main() {
  const { rows } = await sql<CertRow>`
    SELECT qc."questionId", q."questionTitle", qc.toolchain, qc.proof
    FROM question_certificates qc
    JOIN questions q ON q."questionId" = qc."questionId"
    WHERE qc.proof IS NOT NULL AND qc.proof <> '';
  `;

  let exported = 0;
  let skipped = 0;
  for (const row of rows) {
    const splitAt = findStatementEnd(row.proof);
    if (splitAt === null) {
      skipped++;
      console.error(`[export-competemath-theorems] could not find ':=' boundary for questionId=${row.questionId}, skipping`);
      continue;
    }
    const statement = row.proof.slice(0, splitAt).trim();
    const proof = row.proof.slice(splitAt).trim();
    const record = {
      name: extractName(statement),
      statement,
      proof,
      status: 'trusted',
      library: 'competemath',
      source_url: `https://competemath.com/practice/problems/${row.questionId}`,
      toolchain: row.toolchain,
    };
    process.stdout.write(JSON.stringify(record) + '\n');
    exported++;
  }
  console.error(`[export-competemath-theorems] exported ${exported}, skipped ${skipped}`);
}

main().catch((err) => {
  console.error('[export-competemath-theorems] failed:', err);
  process.exit(1);
});
