// The search: normalise → classify → expand → channels over the shards → fuse.
import { controlShard, dataShards, type Shard } from "./shards";
import { normalizeQuery } from "./normalize";
import { classifyIntent, gazetteerKey, type Intent } from "./intent";
import { expandQuery } from "./expand";
import { rank, type ChannelResult, type Ranked } from "./fusion";
import { clickChannel, ftsChannel, gazetteerChannel, nameChannel, patternChannel, semanticChannel, symbolChannel, type Ctx } from "./channels";

export interface SearchOptions { limit?: number; perChannel?: number; embed?: (q: string) => Promise<number[]>; shards?: Shard[]; control?: Shard; channels?: string[] }
export interface SearchResult { query: string; normalised: string; intent: Intent; results: Ranked[]; channels: Record<string, number>; tookMs: number }

export async function searchIndex(raw: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const t0 = Date.now();
  const normalised = normalizeQuery(raw);
  const intent = classifyIntent(normalised);
  const ctx: Ctx = { q: normalised, intent, expansion: expandQuery(normalised), gazetteerKey: gazetteerKey(normalised), limit: opts.perChannel ?? 100, shards: opts.shards ?? dataShards(), control: opts.control ?? controlShard() };
  const all: Record<string, () => Promise<ChannelResult>> = {
    name: () => nameChannel(ctx), fts: () => ftsChannel(ctx), symbol: () => symbolChannel(ctx), gazetteer: () => gazetteerChannel(ctx),
    pattern: () => patternChannel(ctx), click: () => clickChannel(ctx),
  };
  if (opts.embed) all.semantic = () => semanticChannel(ctx, opts.embed!);
  const wanted = opts.channels ?? Object.keys(all);
  const settled = await Promise.allSettled(wanted.filter((k) => all[k]).map((k) => all[k]()));
  const results: ChannelResult[] = [];
  const channels: Record<string, number> = {};
  for (const s of settled) {
    if (s.status === "fulfilled") { results.push(s.value); channels[s.value.channel] = s.value.hits.length; }
    else console.error("[tengoku-search] channel failed:", (s.reason as Error).message);
  }
  return { query: raw, normalised, intent, results: rank(results, intent, opts.limit ?? 30), channels, tookMs: Date.now() - t0 };
}
