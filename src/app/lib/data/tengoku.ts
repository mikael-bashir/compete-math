import "server-only";

import { sql } from "@vercel/postgres";

export type TengokuStatus = "tentative" | "trusted";

export interface TengokuEntry {
  id: number;
  name: string;
  statement: string;
  proof: string;
  status: TengokuStatus;
  library: string;
  sourceUrl: string;
  toolchain: string;
}

export interface TengokuStats {
  total: number;
  tentative: number;
  trusted: number;
  libraryCount: number;
}

export async function getTengokuStats(): Promise<TengokuStats> {
  try {
    const { rows } = await sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'trusted')::int AS trusted,
        count(DISTINCT library)::int AS library_count
      FROM tengoku_entries;
    `;
    const r = rows[0];
    return {
      total: r?.total ?? 0,
      trusted: r?.trusted ?? 0,
      tentative: (r?.total ?? 0) - (r?.trusted ?? 0),
      libraryCount: r?.library_count ?? 0,
    };
  } catch (error) {
    console.error("[tengoku] stats failed:", error);
    return { total: 0, tentative: 0, trusted: 0, libraryCount: 0 };
  }
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
      SELECT id, name, statement, proof, status, library, source_url, toolchain
      FROM tengoku_entries
      WHERE search_vector @@ websearch_to_tsquery('english', ${trimmed})
      ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', ${trimmed})) DESC
      LIMIT ${limit};
    `;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      statement: r.statement,
      proof: r.proof,
      status: r.status === "trusted" ? "trusted" : "tentative",
      library: r.library,
      sourceUrl: r.source_url,
      toolchain: r.toolchain,
    }));
  } catch (error) {
    console.error("[tengoku] search failed:", error);
    return [];
  }
}
