// Central place for site-wide constants so admin identity, nav routes and
// topic taxonomies stay consistent across pages and API routes.

export const ADMIN_EMAILS = ["bashir.mikael@outlook.com"];

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

export const NAV_LINKS = [
  { label: "Home", href: "/home" },
  { label: "Community", href: "/community" },
  { label: "Practice", href: "/practice" },
  { label: "Leaderboard", href: "/global" },
] as const;

// Theme/topic taxonomy for practice + community problems. Kept broad and close
// to exhaustive across competition and undergraduate mathematics so an admin can
// tag a problem precisely. Ordered by cluster (algebra → number theory → geometry
// → combinatorics → probability → analysis → discrete/CS → advanced) rather than
// alphabetically, so the picker reads sensibly. Existing rows keep whatever value
// they already have; "General" is the implicit fallback for untagged problems.
export const PROBLEM_TOPICS = [
  // Algebra
  "Algebra",
  "Elementary Algebra",
  "Polynomials",
  "Functional Equations",
  "Inequalities",
  "Sequences & Series",
  "Recurrence Relations",
  "Complex Numbers",
  "Roots of Unity",
  "Linear Algebra",
  "Matrices & Determinants",
  "Abstract Algebra",
  "Group Theory",
  "Ring & Field Theory",
  "Galois Theory",
  // Number Theory
  "Number Theory",
  "Divisibility",
  "Modular Arithmetic",
  "Prime Numbers",
  "Diophantine Equations",
  "Quadratic Residues",
  "Multiplicative Functions",
  "p-adic Valuations",
  "Continued Fractions",
  "Algebraic Number Theory",
  "Analytic Number Theory",
  // Geometry
  "Geometry",
  "Euclidean Geometry",
  "Triangle Geometry",
  "Circle Geometry",
  "Coordinate Geometry",
  "Trigonometry",
  "Vectors",
  "Transformational Geometry",
  "Projective Geometry",
  "Solid Geometry",
  "Combinatorial Geometry",
  "Differential Geometry",
  // Combinatorics
  "Combinatorics",
  "Enumerative Combinatorics",
  "Graph Theory",
  "Extremal Combinatorics",
  "Pigeonhole Principle",
  "Bijective Combinatorics",
  "Generating Functions",
  "Combinatorial Game Theory",
  "Ramsey Theory",
  "Order & Lattice Theory",
  // Probability & Statistics
  "Probability",
  "Combinatorial Probability",
  "Expected Value",
  "Random Processes",
  "Markov Chains",
  "Statistics",
  // Analysis & Calculus
  "Analysis",
  "Real Analysis",
  "Calculus",
  "Limits & Continuity",
  "Differential Calculus",
  "Integral Calculus",
  "Multivariable Calculus",
  "Differential Equations",
  "Complex Analysis",
  "Functional Analysis",
  "Measure Theory",
  "Fourier Analysis",
  // Discrete / Logic / CS
  "Logic",
  "Set Theory",
  "Discrete Mathematics",
  "Boolean Algebra",
  "Combinatorial Optimization",
  "Algorithms",
  "Computational Complexity",
  "Cryptography",
  "Information Theory",
  "Game Theory",
  // Topology & advanced
  "Topology",
  "Dynamical Systems",
  "Category Theory",
  "Mathematical Olympiad",
] as const;

export const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard", "Insane"] as const;

// Knowledge is expressed as a 1–5 "level" scale describing the prerequisite
// mathematical maturity, not the difficulty of the puzzle itself.
export const LEVELS = [
  {
    value: "Level 1",
    short: "Foundational",
    blurb:
      "A first-year primary school student would technically have the base knowledge to attempt it.",
  },
  {
    value: "Level 2",
    short: "Early secondary",
    blurb: "Knowledge content up to early high / secondary school.",
  },
  {
    value: "Level 3",
    short: "Sixth form / college",
    blurb: "Knowledge up to the end of sixth form / college.",
  },
  {
    value: "Level 4",
    short: "One advanced concept",
    blurb: "A challenge built around a single advanced, university-level concept.",
  },
  {
    value: "Level 5",
    short: "Multiple advanced concepts",
    blurb: "Several advanced concepts combined together in one problem.",
  },
] as const;

// Plain list of level values for <select> options and filters.
export const KNOWLEDGE_LEVELS = LEVELS.map((l) => l.value);

// Community problems cap each solver at this many answer attempts. Practice
// problems are uncapped.
export const COMMUNITY_MAX_ATTEMPTS = 3;

// Practice: a user must submit at least this many attempts before they may give
// up and reveal the answer + proof certificate. Enforced server-side.
export const PRACTICE_REVEAL_ATTEMPTS = 3;

export const DONATE_URL = "https://buy.stripe.com/eVq6oGethg9na8B7WD0Jq00";
export const GITHUB_URL = "https://github.com/mikael-bashir/compete-math";
export const CONTACT_EMAIL = "bashir.mikael@outlook.com";
