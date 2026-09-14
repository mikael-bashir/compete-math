// The search index database (sql/tengoku-index.sql). One pool per process.
import { Pool } from "pg";

export type Row = Record<string, unknown>;
export type Sql = (text: string, params?: unknown[]) => Promise<Row[]>;

let pool: Pool | null = null;
export function indexConfigured(): boolean {
  return !!process.env.TENGOKU_INDEX_DATABASE_URL;
}
export function indexSql(): Sql {
  if (!pool) {
    const url = process.env.TENGOKU_INDEX_DATABASE_URL;
    if (!url) throw new Error("TENGOKU_INDEX_DATABASE_URL is not set");
    pool = new Pool({ connectionString: url, max: 6, statement_timeout: 15_000 });
  }
  return async (text, params = []) => (await pool!.query(text, params)).rows;
}
