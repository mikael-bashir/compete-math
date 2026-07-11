// Proof certificates ---------------------------------------------------------
// Every practice problem sourced from the Leak prover ships a machine-checked
// Lean proof. We present that proof as a CERTIFICATE: the proof script plus the
// provenance a reader needs to trust it — when it was minted, when it was
// enforced (machine-checked), the exact toolchain it was enforced against, and
// a support contact. Toolchain/Mathlib/email are hardcoded for now.

export const CERTIFICATE = {
  issuer: "CompeteMath",
  // The Lean toolchain + Mathlib revision every current proof is enforced against.
  toolchain: "Lean 4.29.1",
  mathlib: "Mathlib v4.29.1",
  // Public support contact printed on every certificate.
  supportEmail: "bashir.mikael@outlook.com",
} as const;

// Human-readable UTC date, e.g. "5 Jul 2026, 15:19 UTC". Falsy input → "—".
export function fmtCertDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

export interface CertificateMeta {
  title?: string | null;
  mintedAt?: string | null;
  provedAt?: string | null;
}

// A Lean block-comment header stamped onto the proof for the copy/download form.
// Being a comment, it never affects compilation — the script still verifies.
export function certificateHeader(meta: CertificateMeta): string {
  const line = "═".repeat(58);
  return [
    "/-",
    `  ${line}`,
    `  ${CERTIFICATE.issuer} — Proof Certificate`,
    `  ${line}`,
    `  Problem   : ${meta.title ?? "—"}`,
    `  Minted    : ${fmtCertDate(meta.mintedAt)}`,
    `  Enforced  : ${fmtCertDate(meta.provedAt)}  (machine-checked)`,
    `  Toolchain : ${CERTIFICATE.toolchain} · ${CERTIFICATE.mathlib}`,
    `  Support   : ${CERTIFICATE.supportEmail}`,
    `  ${line}`,
    "-/",
    "",
  ].join("\n");
}

// The full downloadable/copyable certificate: header comment + the proof script.
export function fullCertificate(proof: string, meta: CertificateMeta): string {
  return certificateHeader(meta) + (proof ?? "").trimEnd() + "\n";
}
