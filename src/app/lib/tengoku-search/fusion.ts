// Reciprocal rank fusion with per-intent channel weights, a light prior
// rerank, and collapse-by-type-hash. The learned reranker (plan §6) replaces
// `prior()` later; the interface stays.
import type { Intent } from "./intent";

export interface Hit {
  id: string; name: string; kind: string; tier: string; statement: string; module: string; docstring: string | null;
  type_hash: string | null; pagerank: number; deprecated_for: string | null; permalink?: string;
  /** From the name channel: the name (or its last component) is exactly what was asked. Survives fusion. */
  exact?: boolean;
}
export interface ChannelResult { channel: string; hits: Hit[] }
export interface Ranked extends Hit { score: number; channels: string[]; variants: number }

export const CHANNEL_WEIGHTS: Record<Intent, Record<string, number>> = {
  name:     { name: 3, fts: 1, symbol: 0.5, semantic: 0.5, gazetteer: 2, pattern: 1, click: 1 },
  pattern:  { name: 2.5, fts: 0.5, symbol: 1.5, semantic: 0.5, gazetteer: 1, pattern: 2, click: 1 },
  notation: { name: 3, fts: 0.7, symbol: 1.5, semantic: 1, gazetteer: 1, pattern: 1.5, click: 1 },
  named:    { name: 1.5, fts: 1, symbol: 0.5, semantic: 1.5, gazetteer: 4, pattern: 0.5, click: 1.5 },
  module:   { name: 2, fts: 2, symbol: 0.2, semantic: 0.2, gazetteer: 0.5, pattern: 0.2, click: 0.5 },
  nl:       { name: 2, fts: 1.5, symbol: 1, semantic: 2.5, gazetteer: 2.5, pattern: 0.5, click: 1.5 },
};
const KIND_PRIOR: Record<Intent, Record<string, number>> = {
  name: {}, pattern: { theorem: 0.05 }, notation: { theorem: 0.05 }, named: { theorem: 0.05 }, module: {}, nl: { theorem: 0.04, def: 0.02, structure: 0.02, inductive: 0.02 },
};

export function rrf(results: ChannelResult[], intent: Intent, k = 60): Ranked[] {
  const by = new Map<string, Ranked>();
  const w = CHANNEL_WEIGHTS[intent];
  for (const { channel, hits } of results) {
    const weight = w[channel] ?? 1;
    hits.forEach((h, i) => {
      const cur = by.get(h.id) ?? { ...h, score: 0, channels: [], variants: 1 };
      cur.score += weight / (k + i + 1);
      if (h.exact) cur.exact = true;
      if (!cur.channels.includes(channel)) cur.channels.push(channel);
      by.set(h.id, cur);
    });
  }
  return [...by.values()].sort((a, b) => b.score - a.score);
}

/** Cheap priors until the learned reranker exists: tier, kind, importance, deprecation. */
export function prior(h: Ranked, intent: Intent): number {
  let s = h.score;
  if (h.tier === "trusted") s *= 1.1; else if (h.tier === "tentative") s *= 0.9;
  s += KIND_PRIOR[intent][h.kind] ?? 0;
  s += Math.min(0.03, Math.log10(1 + h.pagerank * 1e5) * 0.01);
  if (h.deprecated_for) s *= 0.6;
  // Reciprocal ranks flatten the gap between an exact name and a near miss; an exact name is what the person asked for.
  if (h.exact) s += intent === "name" ? 0.05 : 0.03;
  // Between otherwise equal names, prefer the general statement to a namespaced copy (mul_add over Int.mul_add).
  s -= 0.006 * (h.name.split(".").length - 1);
  if (h.channels.length > 1) s *= 1 + 0.08 * (h.channels.length - 1); // agreement between channels
  return s;
}

/** Collapse the Nat/Int/Real versions of one statement into a representative. */
export function collapseVariants(ranked: Ranked[]): Ranked[] {
  const seen = new Map<string, Ranked>();
  const out: Ranked[] = [];
  for (const h of ranked) {
    const key = h.type_hash || h.id;
    const rep = seen.get(key);
    if (rep) { rep.variants += 1; continue; }
    seen.set(key, h); out.push(h);
  }
  return out;
}

/** Namespaces whose copy of a general lemma (Int8.two_mul, Nat.sub_self) is a variant of the root one, not a different result. */
export const NUMERIC_NAMESPACES = new Set(["Nat", "Int", "Int8", "Int16", "Int32", "Int64", "ISize", "UInt8", "UInt16", "UInt32", "UInt64", "USize", "Fin", "BitVec", "Rat", "Real", "Complex", "NNReal", "ENNReal", "EReal", "ENat", "PNat", "ZMod", "Ordinal", "Cardinal", "NNRat", "Nat.Cast", "Int.Cast"]);

/** Fold numeric-type copies into the general lemma when it is present; the family's best evidence lifts the root. */
export function collapseFamilies(ranked: Ranked[], intent: Intent = "nl"): Ranked[] {
  const roots = new Map(ranked.filter((h) => !h.name.includes(".")).map((h) => [h.name, h]));
  const out: Ranked[] = [];
  for (const h of ranked) {
    const dot = h.name.lastIndexOf(".");
    const ns = dot > 0 ? h.name.slice(0, dot) : "";
    const root = ns && NUMERIC_NAMESPACES.has(ns) ? roots.get(h.name.slice(dot + 1)) : undefined;
    // Never fold what was asked for by name: `Nat.add_comm` typed verbatim is the answer, not a variant of add_comm.
    if (root && root !== h && root.kind === h.kind && !(intent === "name" && h.exact)) { root.variants += 1; root.score = Math.max(root.score, h.score); continue; }
    out.push(h);
  }
  return out.sort((a, b) => b.score - a.score);
}

export function rank(results: ChannelResult[], intent: Intent, limit = 30): Ranked[] {
  const fused = rrf(results, intent).map((h) => ({ ...h, score: prior(h, intent) })).sort((a, b) => b.score - a.score);
  return collapseFamilies(collapseVariants(fused), intent).slice(0, limit);
}
