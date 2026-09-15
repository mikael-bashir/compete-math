// Load an extracted + derived index directory into the angel shards.
//   pnpm tengoku:load <index dir> [--commit <tree sha>] [--keep]
// Reads decls.jsonl, derived.jsonl, symbols.jsonl (tree: lake exe
// tengoku-extract, then scripts/derive.py). Routes each declaration to its
// shard by name hash, truncates first (the index is derived; a reload is the
// unit of change), and seeds the gazetteer from docstrings that name their
// theorem. Never prints a connection string.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createHash } from "node:crypto";
import { loadEnv } from "./tengoku-index/env";
import { controlShard, dataShards, findNames, shardIndexFor, type Shard } from "../src/app/lib/tengoku-search/shards";
import { NAMED_THEOREMS } from "../src/app/lib/tengoku-search/intent";
loadEnv();

const args = process.argv.slice(2);
const dir: string = args.find((a) => !a.startsWith("--")) ?? "";
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
if (!dir) { console.error("usage: tengoku:load <index dir> [--commit sha] [--keep]"); process.exit(2); }
const treeCommit = opt("--commit") || "unknown";
const keep = args.includes("--keep");
const BATCH = 150;
// Named results Mathlib docstrings do not always spell out (plan §2, gazetteer: curated + docstrings, later clicks).
const CURATED_GAZETTEER: Record<string, string[]> = {
  "pigeonhole": ["Finset.exists_ne_map_eq_of_card_lt_of_maps_to", "Fintype.exists_ne_map_eq_of_card_lt", "Finset.exists_lt_card_fiber_of_mul_lt_card_of_maps_to"],
  "cauchy schwarz": ["inner_mul_le_norm_mul_norm", "real_inner_mul_inner_self_le", "abs_inner_le_norm", "Finset.inner_mul_le_norm_mul_norm", "Finset.sum_mul_sq_le_sq_mul_sq"],
  "fermat little": ["ZMod.pow_card_sub_one_eq_one", "Int.ModEq.pow_card_sub_one_eq_one", "ZMod.pow_card"],
  "euler totient": ["Nat.ModEq.pow_totient", "ZMod.pow_totient"],
  "infinitely many primes": ["Nat.exists_infinite_primes", "Nat.infinite_setOf_prime"],
  "intermediate value": ["intermediate_value_Icc", "intermediate_value_Icc'", "intermediate_value_univ"],
  "pythagorean identity": ["Real.sin_sq_add_cos_sq", "Real.cos_sq_add_sin_sq", "Complex.sin_sq_add_cos_sq"],
  "bolzano weierstrass": ["tendsto_subseq_of_bounded", "tendsto_subseq_of_frequently_bounded"],
  "zorn": ["zorn_le", "zorn_preorder", "zorn_subset"],
  "chinese remainder": ["Nat.chineseRemainder", "Ideal.quotientInfRingEquivPiQuotient", "ZMod.chineseRemainder"],
  "wilson": ["ZMod.wilsons_lemma", "Nat.prime_iff_fac_equiv_neg_one"],
  "bezout": ["Nat.gcd_eq_gcd_ab", "Int.gcd_eq_gcd_ab", "Nat.exists_mul_emod_eq_gcd"],
  "binomial theorem": ["add_pow", "Commute.add_pow", "Nat.add_pow"],
  "irrational sqrt two": ["irrational_sqrt_two"],
  "mean value": ["exists_deriv_eq_slope", "exists_ratio_deriv_eq_ratio_slope", "exists_hasDerivAt_eq_slope"],
  "fundamental theorem": ["intervalIntegral.integral_eq_sub_of_hasDerivAt", "Complex.exists_root", "Nat.primeFactorsList_unique"],
  "lagrange": ["Subgroup.card_subgroup_dvd_card", "Subgroup.card_dvd_of_le", "exists_deriv_eq_slope"],
  "triangle inequality": ["abs_add", "norm_add_le", "dist_triangle", "abs_sub_le"],
  "am gm": ["Real.geom_mean_le_arith_mean2_weighted", "Real.geom_mean_le_arith_mean_weighted", "Real.inner_le_nnorm_mul_nnorm"],
};

async function* lines(file: string) {
  if (!fs.existsSync(file)) return;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) yield JSON.parse(l);
}
function libraryOf(module: string): string {
  const parts = module.split(".");
  return parts[1] && /^[A-Z][a-z]+[A-Z]/.test(parts[1]) ? parts[1].replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase() : "mathlib";
}
const DECL_COLS = ["id","name","namespace","name_tokens","kind","library","module","line","permalink","statement","type_hash","binders","arity","universe_params","conclusion_head","hypothesis_heads","constants_used","notation_used","docstring","is_simp","is_instance","deprecated_for","proof_depth","value_consts","content_hash","pagerank","in_degree","out_degree","index_commit"];

class ShardWriter {
  decl: unknown[][] = []; text: unknown[][] = []; n = 0;
  constructor(public shard: Shard) {}
  async flush() {
    if (this.decl.length) {
      const vals = this.decl.flat();
      const rows = this.decl.map((r, i) => `(${r.map((_, j) => `$${i * DECL_COLS.length + j + 1}`).join(",")})`).join(",");
      await this.shard.sql(`INSERT INTO decl (${DECL_COLS.join(",")}) VALUES ${rows} ON CONFLICT (id) DO UPDATE SET ${DECL_COLS.filter((c) => c !== "id").map((c) => `${c} = EXCLUDED.${c}`).join(", ")}`, vals);
      this.n += this.decl.length; this.decl = [];
    }
    if (this.text.length) {
      const W = 7;
      const rows = this.text.map((_, i) => `($${i * W + 1}, $${i * W + 2}, $${i * W + 3}, $${i * W + 4}::text[], setweight(to_tsvector('english', $${i * W + 5}), 'A') || setweight(to_tsvector('english', $${i * W + 6}), 'B') || setweight(to_tsvector('english', $${i * W + 3} || ' ' || array_to_string($${i * W + 4}::text[], ' ')), 'C') || setweight(to_tsvector('simple', $${i * W + 7}), 'D'))`).join(",");
      await this.shard.sql(`INSERT INTO decl_text (id, name_gloss, statement_gloss, topic_labels, search_text) VALUES ${rows} ON CONFLICT (id) DO UPDATE SET name_gloss = EXCLUDED.name_gloss, statement_gloss = EXCLUDED.statement_gloss, topic_labels = EXCLUDED.topic_labels, search_text = EXCLUDED.search_text`, this.text.flat());
      this.text = [];
    }
  }
}

async function main() {
  const shards = dataShards();
  const control = controlShard();
  if (!shards.length) { console.error("no index shards configured (ANGEL10..16 or TENGOKU_INDEX_SHARDS)"); process.exit(2); }
  console.log(`${shards.length} data shards: ${shards.map((s) => s.key.replace("_DATABASE_URL", "")).join(", ")}; control ${control.key.replace("_DATABASE_URL", "")}`);
  const dataSql = fs.readFileSync(path.join("sql", "tengoku-index-data.sql"), "utf8");
  const controlSql = fs.readFileSync(path.join("sql", "tengoku-index-control.sql"), "utf8");
  const stmts = (text: string) => text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").split(";").map((x) => x.trim()).filter(Boolean);
  for (const s of shards) for (const stmt of stmts(dataSql)) await s.sql(stmt);
  for (const stmt of stmts(controlSql)) await control.sql(stmt);
  if (!keep) {
    await Promise.all(shards.map((s) => s.sql(`TRUNCATE decl_text, decl_embedding, decl`)));
    await control.sql(`TRUNCATE symbol, gazetteer, name_token`);
    console.log("truncated");
  }
  const derived = new Map<string, Record<string, unknown>>();
  for await (const d of lines(path.join(dir, "derived.jsonl"))) derived.set(d.name as string, d);
  console.log(`derived rows: ${derived.size}`);

  const writers = shards.map((s) => new ShardWriter(s));
  const gaz = new Map<string, { id: string; weight: number }[]>();
  const ids = new Map<string, string>();
  let n = 0;
  const t0 = Date.now();
  for await (const d of lines(path.join(dir, "decls.jsonl"))) {
    const x = derived.get(d.name) || {};
    const library = libraryOf(d.module || "");
    const id = `${library}/${d.name}`;
    ids.set(d.name, id);
    const w = writers[shardIndexFor(d.name, shards.length)];
    const contentHash = createHash("sha1").update(JSON.stringify([d.statement, d.docstring, d.kind, d.module])).digest("hex").slice(0, 16);
    const permalink = `https://github.com/competemath/tengoku/blob/${treeCommit}/${(d.module || "").replace(/\./g, "/")}.lean${d.line ? `#L${d.line}` : ""}`;
    w.decl.push([id, d.name, d.name.includes(".") ? d.name.slice(0, d.name.lastIndexOf(".")) : "", x.name_tokens || [], d.kind, library, d.module || "", d.line ?? null, permalink,
      d.statement || "", x.type_hash || null, JSON.stringify(d.binders || []), (d.binders || []).length, d.universe_params || [], d.conclusion_head || null,
      d.hypothesis_heads || [], d.constants_type || [], x.notation_used || [], d.docstring || null, !!d.is_simp, !!d.is_instance, d.deprecated_for || null,
      d.proof_depth ?? null, d.value_consts ?? null, contentHash, x.pagerank || 0, x.in_degree || 0, x.out_degree || 0, treeCommit]);
    w.text.push([id, x.name_gloss || "", x.statement_gloss || "", x.topics || [], `${d.name} ${((x.name_tokens as string[]) || []).join(" ")} ${x.name_gloss || ""}`, d.docstring || "", (d.module || "").replace(/\./g, " ")]);
    if (d.docstring) for (const [re, key] of NAMED_THEOREMS) if (re.test(d.docstring)) gaz.set(key, [...(gaz.get(key) || []), { id, weight: 1 + Number(x.pagerank || 0) * 1e4 }]);
    if (w.decl.length >= BATCH) await w.flush();
    if (++n % 20000 === 0) console.log(`  ${n} declarations (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  await Promise.all(writers.map((w) => w.flush()));
  console.log(`decl + decl_text: ${n} rows in ${((Date.now() - t0) / 1000).toFixed(0)}s; per shard: ${writers.map((w) => w.n).join("/")}`);

  let s = 0;
  let batch: unknown[][] = [];
  const flushSym = async () => {
    if (!batch.length) return;
    await control.sql(`INSERT INTO symbol (name, symbol, gloss, df) VALUES ${batch.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(",")} ON CONFLICT (name) DO UPDATE SET symbol = EXCLUDED.symbol, gloss = EXCLUDED.gloss, df = EXCLUDED.df`, batch.flat());
    s += batch.length; batch = [];
  };
  for await (const sym of lines(path.join(dir, "symbols.jsonl"))) { batch.push([sym.name, sym.symbol, sym.gloss || "", sym.df || 0]); if (batch.length >= 300) await flushSym(); }
  await flushSym();
  console.log(`symbol: ${s} rows`);
  let tk = 0;
  let tbatch: unknown[][] = [];
  const flushTok = async () => {
    if (!tbatch.length) return;
    await control.sql(`INSERT INTO name_token (token, df) VALUES ${tbatch.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(",")} ON CONFLICT (token) DO UPDATE SET df = EXCLUDED.df`, tbatch.flat());
    tk += tbatch.length; tbatch = [];
  };
  for await (const row of lines(path.join(dir, "tokens.jsonl"))) { tbatch.push([row.token, row.df || 0]); if (tbatch.length >= 500) await flushTok(); }
  await flushTok();
  console.log(`name_token: ${tk} rows`);

  let g = 0;
  for (const [key, list] of gaz) {
    const top = list.sort((a, b) => b.weight - a.weight).slice(0, 25);
    await control.sql(`INSERT INTO gazetteer (key, decl_id, weight, source) VALUES ${top.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, 'docstring')`).join(",")} ON CONFLICT (key, decl_id) DO UPDATE SET weight = EXCLUDED.weight`, top.flatMap((e) => [key, e.id, e.weight]));
    g += top.length;
  }
  console.log(`gazetteer: ${g} rows from docstrings across ${gaz.size} keys`);
  let cur = 0;
  for (const [key, names] of Object.entries(CURATED_GAZETTEER)) {
    const present = await findNames(names, shards);
    const rows = names.filter((nm) => present.includes(nm));
    if (!rows.length) continue;
    // A curated entry outranks a docstring mention; earlier names in the list rank higher.
    await control.sql(`INSERT INTO gazetteer (key, decl_id, weight, source) VALUES ${rows.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, 'curated')`).join(",")} ON CONFLICT (key, decl_id) DO UPDATE SET weight = EXCLUDED.weight, source = 'curated'`,
      rows.flatMap((nm, i) => [key, `${ids.get(nm)}`, 1000 - i]));
    cur += rows.length;
  }
  console.log(`gazetteer: ${cur} curated rows`);

  await Promise.all(writers.map((w, i) => w.shard.sql(`INSERT INTO index_version (id, tree_commit, decl_count, shard_index, shard_count) VALUES (1, $1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET tree_commit = EXCLUDED.tree_commit, decl_count = EXCLUDED.decl_count, shard_index = EXCLUDED.shard_index, shard_count = EXCLUDED.shard_count, loaded_at = now()`, [treeCommit, w.n, i, shards.length])));
  await control.sql(`INSERT INTO index_control (id, tree_commit, decl_count, shard_count, extractor) VALUES (1, $1, $2, $3, 'tengoku-extract') ON CONFLICT (id) DO UPDATE SET tree_commit = EXCLUDED.tree_commit, decl_count = EXCLUDED.decl_count, shard_count = EXCLUDED.shard_count, loaded_at = now()`, [treeCommit, n, shards.length]);
  const sizes = await Promise.all(shards.map(async (sh) => `${sh.key.replace("_DATABASE_URL", "")}=${(Number((await sh.sql(`SELECT pg_database_size(current_database())::bigint AS b`))[0].b) / 1048576).toFixed(0)}MB`));
  console.log(`index at ${treeCommit}: ${n} declarations over ${shards.length} shards; sizes ${sizes.join(" ")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
