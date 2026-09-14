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
  monotone: ["mono", "monotone"], continuous: ["continuous"], differentiable: ["differentiable"], derivative: ["deriv"], integral: ["integral"], limit: ["tendsto", "lim"],
  supremum: ["sup"], infimum: ["inf"], absolute: ["abs"], natural: ["nat"], naturals: ["nat"], integer: ["int"], integers: ["int"], rational: ["rat"], real: ["real"], reals: ["real"], complex: ["complex"],
  finite: ["finite", "fin"], cardinality: ["card"], length: ["length"], member: ["mem"], membership: ["mem"], complement: ["compl"], divides: ["dvd"], divisor: ["dvd"], divisible: ["dvd"],
  gcd: ["gcd"], lcm: ["lcm"], coprime: ["coprime"], modulo: ["mod", "emod"], remainder: ["mod", "emod"], cancellation: ["cancel"], cancel: ["cancel"], zero: ["zero"], one: ["one"], two: ["two"],
  successor: ["succ"], predecessor: ["pred"], identity: ["id"], composition: ["comp"], compose: ["comp"], composed: ["comp"], union: ["union"], intersection: ["inter"], subset: ["subset"],
  empty: ["empty"], range: ["range"], image: ["image"], preimage: ["preimage"], reverse: ["reverse"], append: ["append"], concatenate: ["append"], concatenation: ["append"], map: ["map"],
  prime: ["prime"], primes: ["prime"], even: ["even"], odd: ["odd"], factorial: ["factorial"], choose: ["choose"], binomial: ["choose", "add_pow"], exponential: ["exp"], logarithm: ["log"], log: ["log"],
  sine: ["sin"], cosine: ["cos"], tangent: ["tan"], pi: ["pi"], irrational: ["irrational"], determinant: ["det"], matrix: ["matrix"], unique: ["unique"], uniqueness: ["unique"], antisymmetric: ["antisymm"],
  reflexive: ["refl"], transitive: ["trans"], symmetric: ["symm"], irreflexive: ["irrefl"], compact: ["compact"], minimum: ["min", "isminon"], maximum: ["max", "ismaxon"], bound: ["bound", "le"],
  bounded: ["bounded"], equal: ["eq"], equals: ["eq"], less: ["lt", "le"], greater: ["gt", "ge"], "at most": ["le"], "at least": ["ge"], iff: ["iff"], implies: ["imp"], "if and only if": ["iff"],
  list: ["list"], lists: ["list"], set: ["set"], sets: ["set"], function: ["function"], polynomial: ["polynomial"], degree: ["degree"], ideal: ["ideal"], group: ["group"], ring: ["ring"], field: ["field"],
  measure: ["measure"], measurable: ["measurable"], probability: ["probability"], expectation: ["integral"], totient: ["totient"], infinitely: ["exists_infinite", "infinite"], infinite: ["infinite"],
};
/** english phrase or symbol → constants for the symbol channel. */
export const WORD_TO_CONSTANTS: Record<string, string[]> = {
  "+": ["HAdd.hAdd"], "-": ["HSub.hSub", "Neg.neg"], "*": ["HMul.hMul"], "/": ["HDiv.hDiv"], "^": ["HPow.hPow"], "=": ["Eq"], "≠": ["Ne"], "≤": ["LE.le"], "<": ["LT.lt"], "≥": ["GE.ge"], ">": ["GT.gt"],
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
const STOP = new Set(["the", "a", "an", "of", "is", "are", "for", "to", "in", "on", "with", "and", "or", "that", "this", "its", "any", "all", "every", "each", "by", "from", "as", "be", "than", "then", "there", "which", "what", "when", "does", "do", "if", "it", "number", "numbers", "theorem", "lemma", "definition", "def"]);

export interface Expansion {
  words: string[];          // content words of the query
  tokens: string[];         // Lean name tokens to look for
  constants: string[];      // constants for the symbol channel
  phrases: string[];        // multi-word lexicon hits used
}

export function expandQuery(q: string): Expansion {
  const lower = q.toLowerCase();
  const phrases: string[] = [];
  const tokens = new Set<string>();
  const constants = new Set<string>();
  for (const m of q.match(/[A-Za-z_][\w']*(\.[A-Za-z_][\w']*)+/g) || []) constants.add(m); // dotted Lean names, case kept
  for (const key of Object.keys(WORD_TO_CONSTANTS)) if (key.includes(" ") && lower.includes(key)) { phrases.push(key); for (const c of WORD_TO_CONSTANTS[key]) constants.add(c); }
  for (const key of Object.keys(WORD_TO_TOKENS)) if (key.includes(" ") && lower.includes(key)) { phrases.push(key); for (const t of WORD_TO_TOKENS[key]) tokens.add(t); }
  const words = lower.replace(/[^\p{L}\p{N}\s.'_+*/^=<>≤≥≠→↔∀∃∑∏∫∘∣√π|!ℕℤℚℝℂ¬∧∨∈⊆∪∩-]/gu, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
  for (const w of words) {
    const base = w.replace(/'s$/, "");
    for (const t of WORD_TO_TOKENS[base] || []) tokens.add(t);
    for (const c of WORD_TO_CONSTANTS[base] || []) constants.add(c);
    for (const ch of base) if (WORD_TO_CONSTANTS[ch] && !/[a-z0-9]/.test(ch)) for (const c of WORD_TO_CONSTANTS[ch]) constants.add(c);
    if (/^[a-z]{3,}$/.test(base) && !WORD_TO_TOKENS[base]) tokens.add(base); // unknown word: try it as a token as-is
    for (const t of nameTokens(w)) if (t.length > 2) tokens.add(t);
  }
  return { words, tokens: [...tokens], constants: [...constants], phrases };
}
