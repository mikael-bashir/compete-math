import { PGlite } from "@electric-sql/pglite";
import type { SqlTag } from "../../src/app/lib/db/sql-tag";

/** A real Postgres in the test process, wearing the same tagged-template shape as @vercel/postgres's `sql`. */
export function asSqlTag(db: PGlite): SqlTag {
  return async (strings, ...values) => {
    let query = "";
    strings.forEach((part, i) => {
      query += part + (i < values.length ? `$${i + 1}` : "");
    });
    const result = await db.query<Record<string, unknown>>(query, values as unknown[]);
    return { rows: result.rows };
  };
}

/** A database with the `users` table the app already has (just the columns these flows touch). */
export async function newDatabase(): Promise<{ raw: PGlite; db: SqlTag; addUser: (username: string, email: string, passwordHash?: string) => Promise<string> }> {
  const raw = new PGlite();
  await raw.exec(`CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text UNIQUE NOT NULL,
    email text UNIQUE,
    password_hash text
  )`);
  return {
    raw,
    db: asSqlTag(raw),
    async addUser(username, email, passwordHash = "old-hash") {
      const r = await raw.query<{ id: string }>("INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id", [username, email, passwordHash]);
      return r.rows[0].id;
    },
  };
}
