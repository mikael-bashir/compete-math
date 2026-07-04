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

export const PROBLEM_TOPICS = [
  "Algebra",
  "Number Theory",
  "Geometry",
  "Combinatorics",
  "Probability",
  "Analysis",
  "Logic",
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

export const DONATE_URL = "https://buy.stripe.com/eVq6oGethg9na8B7WD0Jq00";
export const GITHUB_URL = "https://github.com/mikael-bashir/compete-math";
export const CONTACT_EMAIL = "bashir.mikael@outlook.com";
