import { MetadataRoute } from 'next'
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '@vercel/postgres' // Assuming you use this, or your own db client

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 1. Disable caching so new problems appear instantly
  noStore(); 

  const baseUrl = 'https://competemath.com'
  let problems: any[] = []

  try {
    // 2. Fetch all problems, sorted by newest first
    const { rows } = await sql`
      SELECT "questionId", created_at 
      FROM questions 
      ORDER BY created_at DESC
    `
    problems = rows
  } catch (error) {
    console.error('Sitemap DB Error:', error)
  }

  // 3. DETERMINE THE "HEARTBEAT" DATE
  // If we have problems, the site's "last update" is the newest problem's date.
  // If no problems exist (fresh db), fall back to current time.
  const latestProblemDate = problems.length > 0 
    ? new Date(problems[0].created_at) 
    : new Date();

  // 4. Generate Problem URLs
  const problemUrls = problems.map((problem) => ({
    url: `${baseUrl}/problem/${problem.questionId}`,
    lastModified: new Date(problem.created_at),
    changeFrequency: 'yearly' as const, 
    priority: 0.7,
  }))

  // 5. Define Static Routes using the Heartbeat Date
  const staticRoutes = [
    {
      url: baseUrl,
      lastModified: latestProblemDate, // <--- SYNCED WITH DB
      changeFrequency: 'monthly' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/home`,
      lastModified: latestProblemDate, // <--- SYNCED WITH DB
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/archives`,
      lastModified: latestProblemDate, // <--- SYNCED WITH DB
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/global`,
      lastModified: new Date(), 
      changeFrequency: 'daily' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/auth/login`,
      lastModified: new Date(), 
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    },
  ]

  return [...staticRoutes, ...problemUrls]
}