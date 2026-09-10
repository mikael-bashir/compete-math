// Exports CompeteMath's own certified theorem statements into the same
// JSONL shape the Python harvester (scripts/tengoku-harvester/) produces, so
// Tengoku's importer can load both without a special case. Reads from
// question_certificates (one row per proven problem per toolchain) — the
// PROOF text already starts with a full `theorem ... :=` declaration (every
// certified proof is a self-contained Lean script), so this just needs to
// find the same top-level `:=` boundary the harvester finds, then discards
// the proof body.
//
// Usage:
//   node --env-file=.env node_modules/.bin/tsx scripts/export-competemath-theorems.ts > /tmp/tengoku-data/competemath.jsonl

import { sql } from '@vercel/postgres';

interface CertRow {
  questionId: number;
  questionTitle: string | null;
  toolchain: string;
  proof: string;
}

// Same bracket-depth scan as lean_extract.py's Python version — finds the
// top-level `:=` that starts the proof, ignoring one nested inside a
// default-argument value. Kept deliberately simple: CompeteMath's own proofs
// are already well-formed (the Lean kernel checked them), so this doesn't
// need the harvester's defensive "give up rather than guess" fallbacks.
function extractStatement(proof: string): string | null {
  const openers: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const closers = new Set(Object.values(openers));
  let depth = 0;
  for (let i = 0; i < proof.length; i++) {
    const ch = proof[i];
    if (ch in openers) depth++;
    else if (closers.has(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && proof.startsWith(':=', i)) {
      return proof.slice(0, i).trim();
    }
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
    const statement = extractStatement(row.proof);
    if (!statement) {
      skipped++;
      console.error(`[export-competemath-theorems] could not find ':=' boundary for questionId=${row.questionId}, skipping`);
      continue;
    }
    const record = {
      name: extractName(statement),
      statement,
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
