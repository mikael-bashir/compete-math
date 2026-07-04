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
  { label: "Archives", href: "/archives" },
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

export const KNOWLEDGE_LEVELS = [
  "None",
  "High School",
  "Olympiad",
  "Undergraduate",
] as const;

export const DONATE_URL = "https://buy.stripe.com/eVq6oGethg9na8B7WD0Jq00";
export const GITHUB_URL = "https://github.com/mikael-bashir/compete-math";
export const CONTACT_EMAIL = "bashir.mikael@outlook.com";
