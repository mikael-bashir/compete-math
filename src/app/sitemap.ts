import { MetadataRoute } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "@vercel/postgres";

// Served at /sitemap.xml by the App Router (this file is the whole sitemap).
// robots.ts points crawlers at it. Only public, indexable pages belong here:
// no /api, /account, /dev-login, /component-test, /auth/verify.
const BASE = "https://competemath.com";

type Entry = MetadataRoute.Sitemap[number];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  noStore(); // always current: new problems appear on the next crawl

  let problems: { questionId: string; created_at: string }[] = [];
  let community: { id: number; created_at: string }[] = [];
  try {
    const { rows } = await sql`SELECT "questionId", created_at FROM questions ORDER BY created_at DESC`;
    problems = rows as typeof problems;
  } catch (error) {
    console.error("sitemap: questions", error);
  }
  try {
    const { rows } = await sql`SELECT id, created_at FROM community_problems WHERE status = 'approved' ORDER BY created_at DESC`;
    community = rows as typeof community;
  } catch (error) {
    console.error("sitemap: community_problems", error);
  }

  const newest = (rows: { created_at: string }[]) => (rows.length ? new Date(rows[0].created_at) : new Date());
  const latestProblem = newest(problems);
  const latestCommunity = newest(community);
  const now = new Date();

  const page = (path: string, lastModified: Date, changeFrequency: Entry["changeFrequency"], priority: number): Entry => ({
    url: path ? `${BASE}${path}` : BASE,
    lastModified,
    changeFrequency,
    priority,
  });

  const staticPages: Entry[] = [
    page("", latestProblem, "weekly", 1),
    page("/home", latestProblem, "daily", 0.9),
    page("/practice", latestProblem, "weekly", 0.9),
    page("/community", latestCommunity, "daily", 0.8),
    page("/global", now, "daily", 0.7),
    // Research
    page("/leak", now, "weekly", 0.9),
    page("/about/leak", now, "monthly", 0.9),
    page("/about/tengoku", now, "monthly", 0.9),
    page("/tengoku", now, "daily", 0.9),
    page("/lrr", now, "monthly", 0.7),
    page("/lrr/policy", now, "yearly", 0.4),
    page("/blog", now, "weekly", 0.6),
    // About / help
    page("/about", now, "monthly", 0.8),
    page("/contribute", now, "monthly", 0.6),
    page("/faq", now, "monthly", 0.6),
    // Legal
    page("/privacy", now, "yearly", 0.3),
    page("/terms", now, "yearly", 0.3),
    page("/cookies", now, "yearly", 0.3),
    // Auth entry points (public)
    page("/auth/login", now, "yearly", 0.4),
    page("/auth/register", now, "yearly", 0.5),
  ];

  const problemPages: Entry[] = problems.map((p) => page(`/practice/problems/${p.questionId}`, new Date(p.created_at), "yearly", 0.7));
  const communityPages: Entry[] = community.map((c) => page(`/community/${c.id}`, new Date(c.created_at), "monthly", 0.5));

  return [...staticPages, ...problemPages, ...communityPages];
}
