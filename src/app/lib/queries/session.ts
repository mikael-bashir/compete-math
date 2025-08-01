
export async function fetchSession() {
    const res = await fetch("/api/auth/session");
    if (!res.ok) throw new Error("Failed to fetch session");
    return res.json() as Promise<{
        user: { username: string; image?: string; iat?: number };
        expires: string;
    }>;
}
