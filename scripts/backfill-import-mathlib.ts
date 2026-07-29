// One-off backfill: some certified proofs were persisted WITHOUT a standalone
// `import Mathlib` line — they only compiled because Leak IV/XIV silently
// inject the import at verify-time (see server.py's `verify_script`), so the
// stored proof text is not actually self-contained. This script finds every
// such row, prepends `import Mathlib`, re-mints + re-signs the certificate
// (the signature covers the header + proof, so ANY proof edit invalidates it),
// and writes the new proof/certMintedAt/signature/signatureKeyId back.
//
// provedAt is left untouched: the Lean kernel genuinely did check the proof
// (with Mathlib available, just not spelled out in the persisted text) — only
// the persisted certificate artifact was incomplete, not the underlying proof.
//
// Usage:
//   node --env-file=.env node_modules/.bin/tsx scripts/backfill-import-mathlib.ts            # dry run
//   node --env-file=.env node_modules/.bin/tsx scripts/backfill-import-mathlib.ts --live      # actually write

import { sql } from '@vercel/postgres';
import { fullCertificate, certKeyGroup } from '../src/app/lib/certificate';
import { signCertificate } from '../src/app/lib/certificate-sign';

const LIVE = process.argv.includes('--live');

interface TargetRow {
  id: string;
  questionId: number;
  questionTitle: string | null;
  toolchain: string;
  mathlib: string | null;
  enforcer: string | null;
  proof: string;
  provedAt: string | null;
  certMintedAt: string | null;
}

const IMPORT_RE = /(^|\n)\s*import\s/;

async function main() {
  const { rows } = await sql<TargetRow>`
    SELECT qc.id, qc."questionId", q."questionTitle", qc.toolchain, qc.mathlib,
           qc.enforcer, qc.proof, qc."provedAt", qc."certMintedAt"
    FROM question_certificates qc
    JOIN questions q ON q."questionId" = qc."questionId"
    WHERE qc.proof !~ '(^|\n)\s*import\s'
    ORDER BY qc."questionId" ASC
  `;

  console.log(`${LIVE ? 'LIVE run' : 'DRY RUN'} — ${rows.length} certificate(s) missing an import statement.\n`);

  let signed = 0;
  let skippedNoKey = 0;
  let failed = 0;

  for (const r of rows) {
    // Belt-and-suspenders re-check with the exact same pattern the query used,
    // in case a future caller reuses this against a different row set.
    if (IMPORT_RE.test(r.proof)) continue;

    const newProof = `import Mathlib\n\n${r.proof}`;
    const group = certKeyGroup(r.toolchain);
    const mintedAt = new Date().toISOString();
    const provedAtIso = r.provedAt ? new Date(r.provedAt).toISOString() : null;

    const canonical = fullCertificate(newProof, {
      title: r.questionTitle,
      mintedAt,
      provedAt: provedAtIso,
      toolchain: r.toolchain,
      mathlib: r.mathlib,
      enforcer: r.enforcer,
    }).trimEnd();

    const sig = signCertificate(canonical, group);
    if (!sig) {
      skippedNoKey++;
      console.log(`  SKIP  q${r.questionId} (${r.toolchain}) — no signing key configured for group "${group}"`);
      continue;
    }

    console.log(`  ${LIVE ? 'SIGN ' : 'WOULD SIGN'} q${r.questionId} "${r.questionTitle}" (${r.enforcer ?? 'unnamed'}, ${group})`);

    if (LIVE) {
      try {
        await sql`
          UPDATE question_certificates
          SET proof = ${newProof},
              "certMintedAt" = ${mintedAt},
              signature = ${sig.signature},
              "signatureKeyId" = ${sig.keyId}
          WHERE id = ${r.id}
        `;
      } catch (err) {
        failed++;
        console.error(`    FAILED to update ${r.id}:`, err);
        continue;
      }
    }
    signed++;
  }

  console.log(
    `\n${LIVE ? 'Updated' : 'Would update'} ${signed} row(s). ` +
      `${skippedNoKey} skipped (no key). ${failed} failed.` +
      (LIVE ? '' : '\nRe-run with --live to actually write.'),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
