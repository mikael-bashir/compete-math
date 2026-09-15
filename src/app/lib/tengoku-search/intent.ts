// What kind of question is this? Rules first; a classifier can replace them
// later without changing the callers.
export type Intent = "name" | "pattern" | "notation" | "named" | "module" | "nl";

const OPERATORS = /[=≤≥<>→↔∀∃∑∏∫∘∣√^+*\/|¬∧∨∈∉⊆∪∩-]/;
const HOLE = /\?[A-Za-z_]\w*|(^|[\s(])_(?=[\s)]|$)/;
const LEAN_IDENT = /^[A-Za-z_][\w']*(\.[A-Za-z_][\w']*)*$/;
export const NAMED_THEOREMS: [RegExp, string][] = [
  [/pigeon\s*-?\s*hole/i, "pigeonhole"], [/cauchy[\s–-]*schwarz/i, "cauchy schwarz"], [/fermat.{0,12}little/i, "fermat little"],
  [/euler.{0,12}(totient|theorem)/i, "euler totient"], [/euclid|infinitely many primes|infinitude of (the )?primes|primes (is|are) infinite|set of primes is infinite|infinite.{0,12}primes/i, "infinitely many primes"],
  [/intermediate value/i, "intermediate value"], [/pythagor|sin.{0,6}squared.{0,12}cos|sin\s*\^\s*2.{0,8}cos\s*\^\s*2/i, "pythagorean identity"],
  [/bolzano|weierstrass/i, "bolzano weierstrass"], [/rouch[eé]/i, "rouche"], [/zorn/i, "zorn"], [/chinese remainder/i, "chinese remainder"],
  [/wilson/i, "wilson"], [/b[eé]zout/i, "bezout"], [/binomial theorem/i, "binomial theorem"], [/irrational.{0,20}(sqrt|root).{0,6}(2|two)|sqrt.{0,6}(2|two).{0,20}irrational/i, "irrational sqrt two"],
  [/mean value theorem/i, "mean value"], [/fundamental theorem of (calculus|arithmetic|algebra)/i, "fundamental theorem"], [/lagrange.{0,10}theorem/i, "lagrange"],
  [/triangle inequality/i, "triangle inequality"], [/am[\s-]*gm|arithmetic.{0,10}geometric mean/i, "am gm"],
];

export function gazetteerKey(q: string): string | null {
  for (const [re, key] of NAMED_THEOREMS) if (re.test(q)) return key;
  return null;
}

export function classifyIntent(q: string): Intent {
  const s = q.trim();
  if (!s) return "nl";
  if (/^(Tengoku|Mathlib)(\.[A-Z]\w*)+$/.test(s)) return "module";
  if (LEAN_IDENT.test(s) && (s.includes(".") || s.includes("_") || /[a-z][A-Z]/.test(s)) && !/\s/.test(s)) return "name";
  if (gazetteerKey(s)) return "named";
  const words = s.split(/\s+/);
  const englishWords = words.filter((w) => /^[a-z]{3,}$/i.test(w) && !/[A-Z].*[A-Z]|_|\./.test(w)).length;
  if (HOLE.test(s)) return "pattern";
  if (OPERATORS.test(s) && englishWords <= Math.max(1, words.length / 3)) return words.some((w) => /[A-Za-z]\w*\.[A-Za-z]/.test(w)) ? "pattern" : "notation";
  return "nl";
}
