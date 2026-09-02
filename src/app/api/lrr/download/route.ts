import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const type = searchParams.get('type'); // 'zip' or null
  const path = searchParams.get('path');
  const view = searchParams.get('view');

  if (!token) return new NextResponse('Missing token', { status: 400 });

  // 1. Verify the 1-hour session token
  const isValid = await redis.get(`lrr_session_${token}`);
  if (!isValid) return new NextResponse('Session expired.', { status: 403 });

  // 2. Handle FULL REPOSITORY ZIP download
  if (type === 'zip') {
    const zipUrl = `https://api.github.com/repos/competemath/LRR/zipball/main`;
    const res = await fetch(zipUrl, {
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_PAT}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: 'no-store'
    });
    
    if (!res.ok) return new NextResponse('Failed to fetch zip', { status: res.status });
    
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="Leak-Research-Repo.zip"'
      }
    });
  }

  // 3. Handle INDIVIDUAL FILE download/view (your existing code)
  if (!path) return new NextResponse('Missing path', { status: 400 });

  const githubUrl = `https://api.github.com/repos/competemath/LRR/contents/${path}`;
  const res = await fetch(githubUrl, {
    headers: {
      "Accept": "application/vnd.github.v3.raw",
      "Authorization": `Bearer ${process.env.GITHUB_PAT}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: 'no-store'
  });

  if (!res.ok) return new NextResponse('Failed to fetch file', { status: res.status });

  const content = await res.text();
  const headers = new Headers();
  const filename = path.split('/').pop() || 'download.txt';

  if (view) {
    headers.set('Content-Type', 'text/plain');
  } else {
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
  }

  return new NextResponse(content, { headers });
}