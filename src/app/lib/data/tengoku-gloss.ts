// Turns a Lean declaration's name into an English-ish gloss so a sentence
// embedding model has real signal to match against natural-language and
// notation-heavy queries alike (e.g. "2 + 4 = 6" -> "addition", "rouche's
// theorem" -> whatever winding/complex-analysis vocabulary appears nearby).
// Lean identifiers are usually dot- and underscore-separated and already
// fairly descriptive (`Nat.add_comm`, `Complex.abs_add`) — this just expands
// the common abbreviations Mathlib actually uses so the embedding model sees
// "commutative"/"associative"/"derivative" instead of "comm"/"assoc"/"deriv".

const ABBREVIATIONS: Record<string, string> = {
  add: "addition",
  sub: "subtraction",
  mul: "multiplication",
  div: "division",
  neg: "negation",
  inv: "inverse",
  pow: "power",
  sq: "square",
  sqrt: "square root",
  comm: "commutative",
  assoc: "associative",
  distrib: "distributive",
  cancel: "cancellation",
  inj: "injective",
  surj: "surjective",
  bij: "bijective",
  cont: "continuous",
  deriv: "derivative",
  diff: "differentiable",
  integ: "integral",
  meas: "measurable",
  homeo: "homeomorphism",
  iso: "isomorphism",
  hom: "homomorphism",
  eq: "equal",
  ne: "not equal",
  le: "less than or equal",
  lt: "less than",
  ge: "greater than or equal",
  gt: "greater than",
  nonneg: "nonnegative",
  pos: "positive",
  neg2: "negative",
  nat: "natural number",
  int: "integer",
  rat: "rational number",
  real: "real number",
  complex: "complex number",
  fin: "finite",
  card: "cardinality",
  fun: "function",
  def: "definition",
  iff: "if and only if",
  imp: "implies",
  disj: "disjoint",
  conj: "conjunction",
  compl: "complement",
  inter: "intersection",
  union: "union",
  subset: "subset",
  mem: "membership",
  prod: "product",
  sum: "sum",
  lim: "limit",
  seq: "sequence",
  cont2: "continuity",
  poly: "polynomial",
  deg: "degree",
  coeff: "coefficient",
  irrat: "irrational",
  prime: "prime number",
  gcd: "greatest common divisor",
  lcm: "least common multiple",
  mod: "modular arithmetic",
  dvd: "divides",
  factorial: "factorial",
  choose: "binomial coefficient",
  perm: "permutation",
  comb: "combination",
  deg2: "angle",
  triv: "trivial",
  refl: "reflexive",
  symm: "symmetric",
  trans: "transitive",
  monotone: "monotone",
  antitone: "antitone",
  conv: "convex",
  bound: "bounded",
  compact: "compact",
  cont3: "connected",
  open2: "open set",
  closed: "closed set",
  cts: "continuous",
};

// Splits `add_comm`, `addComm`, `Add.comm` style tokens into word lists.
function splitIdentifier(token: string): string[] {
  return token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function expandWord(word: string): string {
  const lower = word.toLowerCase();
  return ABBREVIATIONS[lower] ?? word;
}

/**
 * Builds the text that actually gets embedded: the decoded/expanded name,
 * the library, and the raw statement (which already carries real
 * mathematical notation an embedding model picks up on directly — numbers,
 * operators, type names). Deterministic and dependency-free so it can run
 * over hundreds of thousands of rows without any external API calls.
 */
export function buildConceptGloss(entry: { name: string; statement: string; library: string }): string {
  const nameWords = splitIdentifier(entry.name).map(expandWord);
  const nameGloss = nameWords.join(" ");
  // Statements can be long (some run into the tens of KB for heavily
  // Mathlib-generated content) — cap what we feed the embedder so a handful
  // of outlier rows don't dominate batch latency or exceed the model's
  // context window silently.
  const statementExcerpt = entry.statement.slice(0, 2000);
  return `${nameGloss}\n${entry.library}\n${statementExcerpt}`;
}
