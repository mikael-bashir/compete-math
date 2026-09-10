import "server-only";

import { sql } from "@vercel/postgres";

export interface TengokuEntry {
  id: number;
  name: string;
  statement: string;
  library: string;
  sourceUrl: string;
  toolchain: string;
}

// websearch_to_tsquery parses natural query syntax (quotes, "OR", bare
// negation with "-") instead of requiring Postgres's tsquery operators —
// the right choice for a Google-style search box.
export async function searchTengokuEntries(
  query: string,
  limit = 30,
): Promise<TengokuEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const { rows } = await sql`
      SELECT id, name, statement, library, source_url, toolchain
      FROM tengoku_entries
      WHERE search_vector @@ websearch_to_tsquery('english', ${trimmed})
      ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', ${trimmed})) DESC
      LIMIT ${limit};
    `;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      statement: r.statement,
      library: r.library,
      sourceUrl: r.source_url,
      toolchain: r.toolchain,
    }));
  } catch (error) {
    console.error("[tengoku] search failed:", error);
    return [];
  }
}
