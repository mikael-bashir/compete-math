// app/api/admin/purge-leaderboard/route.ts
import { revalidateTag } from 'next/cache'

export async function POST(request) {
  // 1. Verify you are the admin (or it's your Cron job)
  // ... check secret key ...

  // 2. BOOM. Refresh the cache globally.
  revalidateTag('leaderboard-data') 

  return Response.json({ now: Date.now(), status: 'Purged' })
}