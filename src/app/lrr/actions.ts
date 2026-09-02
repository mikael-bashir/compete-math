"use server";

import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Helper function to recursively fetch all files, ignoring directories
async function fetchAllFiles(path: string, pat: string): Promise<any[]> {
  const res = await fetch(`https://api.github.com/repos/competemath/LRR/contents/${path}`, {
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `Bearer ${pat}`,
      "X-GitHub-Api-Version": "2022-11-28", 
    },
    cache: 'no-store', 
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch path: ${path}`);
  }

  const items = await res.json();
  let files: any[] = [];

  for (const item of items) {
    if (item.type === 'file') {
      files.push(item);
    } else if (item.type === 'dir') {
      // If it's a folder (like LC-II-Irrationality), fetch what is inside it
      const subFiles = await fetchAllFiles(item.path, pat);
      files = files.concat(subFiles);
    }
  }

  return files;
}

export async function verifyAndFetchBenchmarks(accessCode: string) {
  try {
    // 1. Verify the code exists in Redis
    const isValid = await redis.get(accessCode);
    
    if (!isValid) {
      return { error: "Invalid, expired, or already-used access code." };
    }

    // 2. Burn the code immediately so it can never be used again
    await redis.del(accessCode);

    // 3. Fetch all files from the runs directory (including inside subfolders)
    const pat = process.env.GITHUB_PAT;
    if (!pat) throw new Error("Missing GitHub PAT");
    
    const allFiles = await fetchAllFiles("runs", pat);

    // 4. Generate a 1-hour temporary viewing token
    const sessionToken = crypto.randomUUID();
    await redis.set(`lrr_session_${sessionToken}`, "valid", { ex: 3600 }); // Expires in 1 hour

    // 5. Rewrite the URLs to point to our secure proxy instead of GitHub directly
    const safeFiles = allFiles.map((file: any) => ({
      name: file.path, // Use the full path as the name so they know which folder it came from
      sha: file.sha,
      // Proxy link for viewing in browser (text/plain)
      html_url: `/api/lrr/download?path=${encodeURIComponent(file.path)}&token=${sessionToken}&view=true`,
      // Proxy link for direct download
      download_url: `/api/lrr/download?path=${encodeURIComponent(file.path)}&token=${sessionToken}`
    }));

    return { data: safeFiles, sessionToken };
    
  } catch (error) {
    console.error(error);
    return { error: "An unexpected error occurred while fetching repository data." };
  }
}