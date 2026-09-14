// The search: normalise → classify → expand → channels in parallel → fuse.
import { indexSql, type Sql } from "./db";
import { normalizeQuery } from "./normalize";
import { classifyIntent, gazetteerKey, type Intent } from "./intent";
import { expandQuery } from "./expand";
import { rank, type ChannelResult, type Ranked } from "./fusion";
import { clickChannel, ftsChannel, gazetteerChannel, nameChannel, patternChannel, semanticChannel, symbolChannel, type Ctx } from "./channels";

export interface SearchOptions { limit?: number; perChannel?: number; semantic?: boolean; sql?: Sql; embed?: (q: string) => Promise<number[]> }
export interface SearchResult { query: string; normalised: string; intent: Intent; results: Ranked[]; channels: Record<string, number>; tookMs: number }

export async function searchIndex(raw: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const t0 = Date.now();
  const sql = opts.sql ?? indexSql();
  const normalised = normalizeQuery(raw);
  const intent = classifyIntent(normalised);
  const ctx: Ctx = { q: normalised, intent, expansion: expandQuery(normalised), gazetteerKey: gazetteerKey(normalised), limit: opts.perChannel ?? 200 };
  const runs: Promise<ChannelResult>[] = [nameChannel(sql, ctx), ftsChannel(sql, ctx), symbolChannel(sql, ctx), gazetteerChannel(sql, ctx), patternChannel(sql, ctx), clickChannel(sql, ctx)];
  if (opts.semantic && opts.embed) runs.push(semanticChannel(sql, ctx, opts.embed));
  const settled = await Promise.allSettled(runs);
  const results: ChannelResult[] = [];
  const channels: Record<string, number> = {};
  for (const s of settled) {
    if (s.status === "fulfilled") { results.push(s.value); channels[s.value.channel] = s.value.hits.length; }
    else console.error("[tengoku-search] channel failed:", (s.reason as Error).message);
  }
  return { query: raw, normalised, intent, results: rank(results, intent, opts.limit ?? 30), channels, tookMs: Date.now() - t0 };
}
