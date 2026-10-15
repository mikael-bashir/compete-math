// The shape of @vercel/postgres's `sql` that the auth, verification and join code needs, so tests can hand it a real in-process
// Postgres (PGlite) instead: tests/helpers/pglite.ts. Production passes `sql` itself.
export type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
