// The index lives across the "angel" databases already in the environment
// (docs/tengoku-search-plan.md, adapted to twenty 512 MB Neon projects). Each
// declaration's row, full-text vector and embeddings sit on the same data
// shard, chosen by a stable hash of its name, so every channel is a per-shard
// query merged in the app. Small shared tables (symbols, gazetteer, lexicon,
// logs) live on the control shard. Nothing here is a source of truth: the
// whole index is reloaded from the tree's nightly release, so the shard count
// can change on any reload.
import { neon } from "@neondatabase/serverless";

export type Row = Record<string, unknown>;
export type Sql = (text: string, params?: unknown[]) => Promise<Row[]>;
export interface Shard { key: string; sql: Sql }

export const DEFAULT_DATA_SHARDS = ["ANGEL10_DATABASE_URL", "ANGEL11_DATABASE_URL", "ANGEL12_DATABASE_URL", "ANGEL13_DATABASE_URL", "ANGEL14_DATABASE_URL", "ANGEL15_DATABASE_URL", "ANGEL16_DATABASE_URL"];

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function shardEnvNames(): string[] {
  const list = (process.env.TENGOKU_INDEX_SHARDS || DEFAULT_DATA_SHARDS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  return list.filter((k) => !!process.env[k]);
}
export function indexConfigured(): boolean {
  return process.env.TENGOKU_INDEX_DISABLED !== "1" && shardEnvNames().length > 0;
}

const clients = new Map<string, Shard>();
function client(key: string): Shard {
  let c = clients.get(key);
  if (!c) {
    const url = process.env[key];
    if (!url) throw new Error(`[tengoku-index] ${key} is not set`);
    const q = neon(url, { fetchOptions: { cache: "no-store" } });
    c = { key, sql: async (text, params = []) => (await q(text, params as never[])) as Row[] };
    clients.set(key, c);
  }
  return c;
}
export function dataShards(): Shard[] { return shardEnvNames().map(client); }
export function controlShard(): Shard { return client(process.env.TENGOKU_INDEX_CONTROL || shardEnvNames()[0]); }
export function shardIndexFor(name: string, n = shardEnvNames().length): number { return fnv1a(name) % Math.max(1, n); }
export function shardFor(name: string, shards = dataShards()): Shard { return shards[shardIndexFor(name, shards.length)]; }
export const declName = (id: string) => id.slice(id.indexOf("/") + 1);

/** Run one query on every data shard; a failing shard contributes nothing. */
export async function fanout(shards: Shard[], text: string, params: unknown[]): Promise<Row[]> {
  const settled = await Promise.allSettled(shards.map((s) => s.sql(text, params)));
  const out: Row[] = [];
  for (const [i, s] of settled.entries()) {
    if (s.status === "fulfilled") out.push(...s.value);
    else console.error(`[tengoku-index] ${shards[i].key}:`, (s.reason as Error).message);
  }
  return out;
}

export const DECL_COLS = "d.id, d.name, d.kind, d.tier, d.statement, d.module, d.docstring, d.type_hash, d.pagerank, d.deprecated_for, d.permalink";

/** Rows for known ids, in the given order, from whichever shards hold them. */
export async function fetchByIds(ids: string[], shards = dataShards()): Promise<Row[]> {
  const byShard = new Map<Shard, string[]>();
  for (const id of ids) { const s = shardFor(declName(id), shards); byShard.set(s, [...(byShard.get(s) || []), id]); }
  const rows = (await Promise.all([...byShard.entries()].map(([s, list]) => s.sql(`SELECT ${DECL_COLS} FROM decl d WHERE d.id = ANY($1::text[])`, [list]).catch(() => [] as Row[])))).flat();
  const pos = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (pos.get(a.id as string) ?? 0) - (pos.get(b.id as string) ?? 0));
}

/** Which of these declaration names exist in the index. */
export async function findNames(names: string[], shards = dataShards()): Promise<string[]> {
  return (await fanout(shards, `SELECT name FROM decl WHERE name = ANY($1::text[])`, [names])).map((r) => r.name as string);
}
