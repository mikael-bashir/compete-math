// Query normalisation: every spelling of a symbol becomes one form, so the
// channels and the index agree. LaTeX, ASCII and unicode all map here.
const LATEX: [RegExp, string][] = [
  [/\\forall(?![A-Za-z])/g, "∀"], [/\\exists(?![A-Za-z])/g, "∃"], [/\\to(?![A-Za-z])|\\rightarrow(?![A-Za-z])|\\implies(?![A-Za-z])/g, "→"], [/\\iff(?![A-Za-z])|\\leftrightarrow(?![A-Za-z])/g, "↔"],
  [/\\le(?![A-Za-z])|\\leq(?![A-Za-z])/g, "≤"], [/\\ge(?![A-Za-z])|\\geq(?![A-Za-z])/g, "≥"], [/\\ne(?![A-Za-z])|\\neq(?![A-Za-z])/g, "≠"], [/\\neg(?![A-Za-z])|\\lnot(?![A-Za-z])/g, "¬"], [/\\wedge(?![A-Za-z])|\\land(?![A-Za-z])/g, "∧"],
  [/\\vee(?![A-Za-z])|\\lor(?![A-Za-z])/g, "∨"], [/\\sum(?![A-Za-z])/g, "∑"], [/\\prod(?![A-Za-z])/g, "∏"], [/\\int(?![A-Za-z])/g, "∫"], [/\\sqrt(?![A-Za-z])/g, "√"], [/\\pi(?![A-Za-z])/g, "π"],
  [/\\infty(?![A-Za-z])/g, "∞"], [/\\in(?![A-Za-z])/g, "∈"], [/\\notin(?![A-Za-z])/g, "∉"], [/\\subseteq(?![A-Za-z])|\\subset(?![A-Za-z])/g, "⊆"], [/\\cup(?![A-Za-z])/g, "∪"], [/\\cap(?![A-Za-z])/g, "∩"],
  [/\\circ(?![A-Za-z])/g, "∘"], [/\\mid(?![A-Za-z])/g, "∣"], [/\\cdot(?![A-Za-z])|\\times(?![A-Za-z])/g, "*"], [/\\mathbb\{N\}|\\N(?![A-Za-z])/g, "ℕ"], [/\\mathbb\{Z\}|\\Z(?![A-Za-z])/g, "ℤ"],
  [/\\mathbb\{Q\}|\\Q(?![A-Za-z])/g, "ℚ"], [/\\mathbb\{R\}|\\R(?![A-Za-z])/g, "ℝ"], [/\\mathbb\{C\}|\\C(?![A-Za-z])/g, "ℂ"], [/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1) / ($2)"],
  [/\\left|\\right/g, ""], [/\$/g, ""],
];
const ASCII: [RegExp, string][] = [
  [/<->|<=>/g, "↔"], [/->|=>/g, "→"], [/<=/g, "≤"], [/>=/g, "≥"], [/!=|\/=/g, "≠"], [/\bforall\b/g, "∀"], [/\bexists\b/g, "∃"],
  [/\band\b(?=\s*[^a-z])/g, "∧"], [/\|\|/g, "∨"], [/\bsqrt\(/g, "√("], [/\bpi\b(?=\s*[<>=≤≥])/g, "π"], [/\bNat\b/g, "ℕ"], [/\bInt\b/g, "ℤ"],
  [/\bReal\b(?=\s*[,)]|\s*$)/g, "ℝ"],
];

export function normalizeQuery(raw: string): string {
  let q = raw.normalize("NFC").trim().replace(/^["'`]+|["'`]+$/g, "");
  for (const [re, to] of LATEX) q = q.replace(re, to);
  // ASCII operators only apply outside Lean identifiers (keep `Nat.add_comm` intact).
  if (!/^[A-Za-z_][\w'.]*$/.test(q)) for (const [re, to] of ASCII) q = q.replace(re, to);
  return q.replace(/\s+/g, " ").trim();
}

export const CAMEL = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;
/** Lean identifier → lowercase tokens, the same split as scripts/derive.py. */
export function nameTokens(name: string): string[] {
  const out: string[] = [];
  for (const part of name.replace(/[«»'!?]/g, "").replace(/#/g, "_").split(".")) for (const piece of part.split("_")) for (const t of piece.split(CAMEL)) {
    const tok = t.trim().toLowerCase();
    if (tok) out.push(tok);
  }
  return out;
}
