"use server";

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export async function verifyAndFetchBenchmarks(accessCode: string) {
  try {
    // 1. Verify the code exists in Redis
    const isValid = await redis.get(accessCode);
    
    if (!isValid) {
      return { error: "Invalid, expired, or already-used access code." };
    }

    // 2. Burn the code immediately so it can never be used again
    await redis.del(accessCode);

    // 3. Fetch the secure data from GitHub
    const res = await fetch("https://api.github.com/repos/competemath/LRR/contents/runs", {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `Bearer ${process.env.GITHUB_PAT}`,
        "X-GitHub-Api-Version": "2022-11-28", 
      },
      // Crucial: do not cache this fetch, otherwise the burnt code won't matter
      cache: 'no-store', 
    });

    if (!res.ok) {
      return { error: "Failed to fetch repository data. Please contact support." };
    }

    const files = await res.json();
    return { data: files };
    
  } catch (error) {
    console.error(error);
    return { error: "An unexpected error occurred." };
  }
}