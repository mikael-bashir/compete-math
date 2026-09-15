// Query expansion: English words → Lean name tokens and constants, symbols →
// constants. Curated seed; the translation table learned from docstrings
// (plan §2, `translation`) will extend this from the database.
import { nameTokens } from "./normalize";

/** english phrase → Lean name tokens (the reverse of scripts/derive.py ABBREV, plus common phrasing). */
export const WORD_TO_TOKENS: Record<string, string[]> = {
  commutative: ["comm"], commutativity: ["comm"], commutes: ["comm"], associative: ["assoc"], associativity: ["assoc"], distributive: ["distrib", "mul_add"],
  addition: ["add"], add: ["add"], adding: ["add"], plus: ["add"], sum: ["add", "sum"], subtraction: ["sub"], minus: ["sub"], multiplication: ["mul"], times: ["mul"], product: ["mul", "prod"],
  division: ["div"], divided: ["div"], negation: ["neg"], negative: ["neg"], inverse: ["inv"], power: ["pow"], square: ["sq", "pow_two"], squared: ["sq"], root: ["sqrt"],
  nonnegative: ["nonneg"], positive: ["pos"], negativity: ["neg"], injective: ["injective", "inj"], surjective: ["surjective", "surj"], bijective: ["bijective"],
  monotone: ["mono", "monotone"], itself: ["self"], attains: ["exists"], attain: ["exists"], achieves: ["exists"], "one more": ["succ"], "plus one": ["succ"], next: ["succ"], twice: ["two", "mul"], double: ["two", "mul"], half: ["two", "div"],
  unit: ["one"], nothing: ["zero"], vanishes: ["zero"], smaller: ["lt", "le"], bigger: ["gt", "ge"], nonzero: ["ne", "zero"], "square root": ["sqrt"], "absolute value": ["abs"], "finite set": ["finset"], "less than or equal": ["le"], "greater than or equal": ["ge"], "less than": ["lt"], "greater than": ["gt"], "not equal": ["ne"], continuous: ["continuous"], differentiable: ["differentiable"], derivative: ["deriv"], integral: ["integral"], limit: ["tendsto", "lim"],
  supremum: ["sup"], infimum: ["inf"], absolute: ["abs"], natural: ["nat"], naturals: ["nat"], integer: ["int"], integers: ["int"], rational: ["rat"], real: ["real"], reals: ["real"], complex: ["complex"],
  finite: ["finite", "fin"], cardinality: ["card"], length: ["length"], member: ["mem"], membership: ["mem"], complement: ["compl"], divides: ["dvd"], divisor: ["dvd"], divisible: ["dvd"],
  gcd: ["gcd"], lcm: ["lcm"], coprime: ["coprime"], modulo: ["mod", "emod"], remainder: ["mod", "emod"], cancellation: ["cancel"], cancel: ["cancel"], zero: ["zero"], one: ["one"], two: ["two"],
  successor: ["succ"], predecessor: ["pred"], identity: ["id"], composition: ["comp"], compose: ["comp"], composed: ["comp"], union: ["union"], intersection: ["inter"], subset: ["subset"],
  empty: ["empty"], range: ["range"], image: ["image"], preimage: ["preimage"], reverse: ["reverse"], append: ["append"], concatenate: ["append"], concatenation: ["append"], map: ["map"],
  prime: ["prime"], primes: ["prime"], even: ["even"], odd: ["odd"], factorial: ["factorial"], choose: ["choose"], binomial: ["choose", "add_pow"], exponential: ["exp"], logarithm: ["log"], log: ["log"],
  sine: ["sin"], cosine: ["cos"], tangent: ["tan"], pi: ["pi"], irrational: ["irrational"], determinant: ["det"], matrix: ["matrix"], unique: ["unique"], uniqueness: ["unique"], antisymmetric: ["antisymm"],
  reflexive: ["refl"], transitive: ["trans"], symmetric: ["symm"], irreflexive: ["irrefl"], compact: ["compact"], minimum: ["min"], maximum: ["max"], bound: ["bound", "le"],
  bounded: ["bounded"], subtracting: ["sub"], subtract: ["sub"], equal: ["eq"], equals: ["eq"], less: ["lt", "le"], greater: ["gt", "ge"], "at most": ["le"], "at least": ["ge"], iff: ["iff"], implies: ["imp"], "if and only if": ["iff"],
  list: ["list"], lists: ["list"], set: ["set"], sets: ["set"], function: [], functions: [], polynomial: ["polynomial"], degree: ["degree"], ideal: ["ideal"], group: ["group"], ring: ["ring"], field: ["field"],
  measure: ["measure"], measurable: ["measurable"], probability: ["probability"], expectation: ["integral"], totient: ["totient"], infinitely: ["exists_infinite", "infinite"], infinite: ["infinite"],
};
/** english phrase or symbol → constants for the symbol channel. */
export const WORD_TO_CONSTANTS: Record<string, string[]> = {
  "+": ["HAdd.hAdd"], "-": [], "*": ["HMul.hMul"], "/": ["HDiv.hDiv"], "^": ["HPow.hPow"], "=": ["Eq"], "≠": ["Ne"], "≤": ["LE.le"], "<": ["LT.lt"], "≥": ["GE.ge"], ">": ["GT.gt"],
  "∧": ["And"], "∨": ["Or"], "¬": ["Not"], "↔": ["Iff"], "∃": ["Exists"], "∈": ["Membership.mem"], "⊆": ["HasSubset.Subset"], "∪": ["Union.union"], "∩": ["Inter.inter"], "∑": ["Finset.sum"],
  "∏": ["Finset.prod"], "∘": ["Function.comp"], "∣": ["Dvd.dvd"], "√": ["Real.sqrt"], "π": ["Real.pi"], "ℕ": ["Nat"], "ℤ": ["Int"], "ℚ": ["Rat"], "ℝ": ["Real"], "ℂ": ["Complex"], "|": ["abs"], "!": ["Nat.factorial"],
  "square root": ["Real.sqrt"], sqrt: ["Real.sqrt"], "absolute value": ["abs"], sum: ["Finset.sum"], product: ["Finset.prod"], prime: ["Nat.Prime"], primes: ["Nat.Prime"], gcd: ["Nat.gcd"], lcm: ["Nat.lcm"],
  pi: ["Real.pi"], exponential: ["Real.exp"], exp: ["Real.exp"], logarithm: ["Real.log"], log: ["Real.log"], sine: ["Real.sin"], sin: ["Real.sin"], cosine: ["Real.cos"], cos: ["Real.cos"],
  derivative: ["deriv", "HasDerivAt"], integral: ["MeasureTheory.integral", "intervalIntegral"], continuous: ["Continuous"], differentiable: ["Differentiable"], injective: ["Function.Injective"],
  surjective: ["Function.Surjective"], bijective: ["Function.Bijective"], list: ["List"], lists: ["List"], "finite set": ["Finset"], finset: ["Finset"], union: ["Union.union"], intersection: ["Inter.inter"],
  subset: ["HasSubset.Subset"], divides: ["Dvd.dvd"], irrational: ["Irrational"], compact: ["IsCompact"], limit: ["Filter.Tendsto"], determinant: ["Matrix.det"], matrix: ["Matrix"], modulo: ["HMod.hMod"],
  remainder: ["HMod.hMod"], factorial: ["Nat.factorial"], choose: ["Nat.choose"], even: ["Even"], odd: ["Odd"], natural: ["Nat"], naturals: ["Nat"], integer: ["Int"], integers: ["Int"], real: ["Real"], reals: ["Real"],
  polynomial: ["Polynomial"], degree: ["Polynomial.degree"], measure: ["MeasureTheory.Measure"], totient: ["Nat.totient"], "power": ["HPow.hPow"], squared: ["HPow.hPow"], square: ["HPow.hPow"],
};
/** Notation in the query → the name tokens Mathlib uses for it. Order matters: the first matching alternative wins per position. */
export const NOTATION_TO_TOKENS: [RegExp, string[]][] = [
  [/\be\s*\^/g, ["exp"]], [/\^\s*2\b/g, ["sq"]], [/\^\s*3\b/g, ["cube"]], [/\^/g, ["pow"]], [/√/g, ["sqrt"]], [/\|[^|]+\|/g, ["abs"]], [/(≥\s*0\b|\b0\s*≤)/g, ["nonneg"]], [/(>\s*0\b|\b0\s*<)/g, ["pos"]],
  [/(≤\s*0\b|\b0\s*≥)/g, ["nonpos"]], [/(<\s*0\b|\b0\s*>)/g, ["neg"]], [/π/g, ["pi"]], [/\bsin\b/g, ["sin"]], [/\bcos\b/g, ["cos"]], [/\btan\b/g, ["tan"]],
  [/\blog\b/g, ["log"]], [/\bexp\b/g, ["exp"]], [/!/g, ["factorial"]], [/\b2\s*\*/g, ["two", "mul"]], [/\b0\b/g, ["zero"]], [/\b1\b/g, ["one"]], [/\b2\b/g, ["two"]], [/\b3\b/g, ["three"]], [/\b4\b/g, ["four"]], [/∑/g, ["sum"]], [/∏/g, ["prod"]], [/∘/g, ["comp"]], [/∣/g, ["dvd"]], [/⁻¹/g, ["inv"]],
  [/\+\+/g, ["append"]], [/\+/g, ["add"]], [/\*/g, ["mul"]], [/\//g, ["div"]], [/↔/g, ["iff"]], [/≠/g, ["ne"]], [/≤/g, ["le"]], [/</g, ["lt"]], [/≥/g, ["ge"]], [/>/g, ["gt"]], [/∪/g, ["union"]], [/∩/g, ["inter"]], [/⊆/g, ["subset"]],
];
const UNARY_MINUS = /(^|[(=<>≤≥,+*/])\s*-\s*[(?\w√|]/;
const BINARY_MINUS = /[\w)|]\s*-\s*[(?\w√|]/;
// x ∘ y = y ∘ x for any operator: the statement is a commutativity.
const SWAPPED = /(\?\w+|\b[a-z]\b)\s*([-+*∘∪∩])\s*(\?\w+|\b[a-z]\b)\s*=\s*\3\s*\2\s*\1(?![\w])/;
const SAME_OPERAND = /(\?\w+|\b[a-z]\b)\s*[-+*/]\s*\1(?![\w])/;
const STOP = new Set(["the", "a", "an", "of", "is", "are", "for", "to", "in", "on", "with", "and", "or", "that", "this", "its", "any", "all", "every", "each", "by", "from", "as", "be", "than", "then", "there", "which", "what", "when", "does", "do", "if", "it", "number", "numbers", "theorem", "lemma", "definition", "def"]);

export interface Expansion {
  words: string[];          // content words of the query
  tokens: string[];         // Lean name tokens to look for (flat)
  tokenGroups: string[][];  // the same tokens grouped by the query word or notation that produced them: alternatives share credit
  constants: string[];      // constants for the symbol channel
  phrases: string[];        // multi-word lexicon hits used
}

export function expandQuery(q: string): Expansion {
  const lower = q.toLowerCase();
  const phrases: string[] = [];
  const tokens = new Set<string>();
  const constants = new Set<string>();
  const groups: string[][] = [];
  const group = (toks: Iterable<string>) => { const g = [...new Set(toks)].filter((x) => x && !tokens.has(x)); for (const x of g) tokens.add(x); if (g.length) groups.push(g); };
  for (const m of q.match(/[A-Za-z_][\w']*(\.[A-Za-z_][\w']*)+/g) || []) constants.add(m); // dotted Lean names, case kept
  // Longest phrase first, and a matched phrase is consumed, so "less than or equal" does not also mean "less than".
  let rest = lower;
  const phraseKeys = [...new Set([...Object.keys(WORD_TO_CONSTANTS), ...Object.keys(WORD_TO_TOKENS)].filter((k) => k.includes(" ")))].sort((a, b) => b.length - a.length);
  for (const key of phraseKeys) if (rest.includes(key)) {
    phrases.push(key); rest = rest.split(key).join(" ");
    for (const c of WORD_TO_CONSTANTS[key] || []) constants.add(c);
    if (WORD_TO_TOKENS[key]) group(WORD_TO_TOKENS[key]);
  }
  // Every notation character names a constant for the symbol channel.
  if (lower.includes("++")) constants.add("HAppend.hAppend");
  for (const ch of lower.replace(/\+\+/g, " ")) if (!/[a-z0-9\s]/.test(ch) && WORD_TO_CONSTANTS[ch]) for (const c of WORD_TO_CONSTANTS[ch]) constants.add(c);
  // Notation says which Mathlib name pieces to look for: a^2 + b^2 → sq, add.
  let stripped = lower;
  for (const [re, toks] of NOTATION_TO_TOKENS) if (re.test(stripped)) { group(toks); stripped = stripped.replace(re, " "); }
  if (UNARY_MINUS.test(lower)) { group(["neg"]); constants.add("Neg.neg"); }
  if (BINARY_MINUS.test(lower)) { group(["sub"]); constants.add("HSub.hSub"); }
  if (SAME_OPERAND.test(lower)) group(["self"]);
  if (SWAPPED.test(lower)) group(["comm"]);
  // A phrase that matched ("square root") consumes its words, so "square" alone does not also mean sq.
  for (const ph of phrases) stripped = stripped.replace(ph, " ");
  const words = stripped.replace(/[^\p{L}\p{N}\s.'_+*/^=<>≤≥≠→↔∀∃∑∏∫∘∣√π|!ℕℤℚℝℂ¬∧∨∈⊆∪∩-]/gu, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
  for (const w of words) {
    const raw = w.replace(/'s$/, "");
    // English inflections: limits → limit, subtracting → subtraction/sub, attains → attain.
    const base = [raw, raw.replace(/s$/, ""), raw.replace(/ing$/, ""), raw.replace(/ing$/, "e"), raw.replace(/ed$/, ""), raw.replace(/es$/, "")].find((c) => WORD_TO_TOKENS[c] || WORD_TO_CONSTANTS[c]) ?? raw;
    const g: string[] = [...(WORD_TO_TOKENS[base] || [])];
    for (const c of WORD_TO_CONSTANTS[base] || []) constants.add(c);
    if (/^[a-z]{3,}$/.test(base) && !WORD_TO_TOKENS[base]) g.push(base); // unknown word: try it as a token as-is
    for (const t of nameTokens(w)) if (t.length > 2) g.push(t);
    group(g);
  }
  return { words, tokens: [...tokens], tokenGroups: groups, constants: [...constants], phrases };
}
