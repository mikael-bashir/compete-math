// Sanity check: re-verify every certificate's stored signature against its
// stored proof, independent of the backfill script itself.
import crypto from 'node:crypto';
import { sql } from '@vercel/postgres';
import { fullCertificate, certKeyGroup, publicKeyForKeyId } from '../src/app/lib/certificate';

async function main() {
  const { rows } = await sql<any>`
    SELECT qc.id, qc."questionId", q."questionTitle", qc.toolchain, qc.mathlib, qc.enforcer,
           qc.proof, qc."provedAt", qc."certMintedAt", qc.signature, qc."signatureKeyId"
    FROM question_certificates qc
    JOIN questions q ON q."questionId" = qc."questionId"
    WHERE qc.signature IS NOT NULL
  `;

  let ok = 0;
  let bad = 0;
  for (const r of rows) {
    const canonical = fullCertificate(r.proof, {
      title: r.questionTitle,
      mintedAt: r.certMintedAt ? new Date(r.certMintedAt).toISOString() : null,
      provedAt: r.provedAt ? new Date(r.provedAt).toISOString() : null,
      toolchain: r.toolchain,
      mathlib: r.mathlib,
      enforcer: r.enforcer,
    }).trimEnd();
    const keyInfo = publicKeyForKeyId(r.signatureKeyId);
    const pem = Buffer.from(keyInfo.publicKey, 'base64').toString('utf8');
    const valid = crypto.verify(
      null,
      Buffer.from(canonical, 'utf8'),
      crypto.createPublicKey({ key: pem, format: 'pem', type: 'spki' }),
      Buffer.from(r.signature, 'base64'),
    );
    if (valid) ok++;
    else {
      bad++;
      console.log(`INVALID q${r.questionId} (${r.id}) group=${certKeyGroup(r.toolchain)}`);
    }
  }
  console.log(`\n${ok} valid, ${bad} invalid, out of ${rows.length} signed rows.`);
}

main().finally(() => process.exit());
