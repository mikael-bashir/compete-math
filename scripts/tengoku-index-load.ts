// Load an extracted + derived index directory into the search database.
//   TENGOKU_INDEX_DATABASE_URL=postgres://… pnpm tengoku:load <index dir> [--commit <tree sha>] [--library <name>]
// Reads decls.jsonl, deps.jsonl, derived.jsonl, symbols.jsonl (tengoku:
// lake exe tengoku-extract, then scripts/derive.py). Upserts by id, batched.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createHash } from "node:crypto";
import { Pool } from "pg";

const args = process.argv.slice(2);
const dir: string = args.find((a) => !a.startsWith("--")) ?? "";
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
if (!dir) { console.error("usage: tengoku-index-load <index dir> [--commit sha] [--library name]"); process.exit(2); }
const url = process.env.TENGOKU_INDEX_DATABASE_URL;
if (!url) { console.error("TENGOKU_INDEX_DATABASE_URL is not set"); process.exit(2); }
const treeCommit = opt("--commit") || "unknown";
const defaultLibrary = opt("--library") || "tengoku";

async function* lines(file: string) {
  if (!fs.existsSync(file)) return;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) yield JSON.parse(l);
}

function libraryOf(module: string): string {
  // Tengoku.<Library>.… for translated libraries; the seeded root is 'mathlib'.
  const parts = module.split(".");
  return parts[1] && /^[A-Z][a-z]+[A-Z]/.test(parts[1]) ? parts[1].replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase() : defaultLibrary;
}

async function main() {
  const pool = new Pool({ connectionString: url, max: 4 });
  const sql = fs.readFileSync(path.join(process.cwd(), "sql", "tengoku-index.sql"), "utf8");
  await pool.query(sql);
  const derived = new Map<string, Record<string, unknown>>();
  for await (const d of lines(path.join(dir, "derived.jsonl"))) derived.set(d.name as string, d);
  let n = 0;
  let batch: unknown[][] = [];
  const flush = async () => {
    if (!batch.length) return;
    const cols = ["id","name","namespace","name_tokens","kind","library","module","line","permalink","statement","type_hash","binders","arity","universe_params","conclusion_head","hypothesis_heads","constants_used","notation_used","docstring","is_simp","is_instance","deprecated_for","proof_depth","value_consts","content_hash","pagerank","in_degree","out_degree","index_commit"];
    const values: unknown[] = [];
    const rows = batch.map((r, i) => `(${r.map((_, j) => `$${i * cols.length + j + 1}`).join(",")})`).join(",");
    for (const r of batch) values.push(...r);
    await pool.query(
      `INSERT INTO decl (${cols.join(",")}) VALUES ${rows}
       ON CONFLICT (id) DO UPDATE SET ${cols.filter((c) => c !== "id").map((c) => `${c} = EXCLUDED.${c}`).join(", ")}, updated_at = now()`,
      values,
    );
    batch = [];
  };
  for await (const d of lines(path.join(dir, "decls.jsonl"))) {
    const x = derived.get(d.name) || {};
    const library = libraryOf(d.module || "");
    const id = `${library}/${d.name}`;
    const contentHash = createHash("sha1").update(JSON.stringify([d.statement, d.docstring, d.kind, d.module])).digest("hex").slice(0, 16);
    const permalink = `https://github.com/competemath/tengoku/blob/${treeCommit}/${(d.module || "").replace(/\./g, "/")}.lean${d.line ? `#L${d.line}` : ""}`;
    batch.push([
      id, d.name, d.name.includes(".") ? d.name.slice(0, d.name.lastIndexOf(".")) : "", x.name_tokens || [], d.kind, library, d.module || "", d.line ?? null, permalink,
      d.statement || "", x.type_hash || null, JSON.stringify(d.binders || []), (d.binders || []).length, d.universe_params || [], d.conclusion_head || null,
      d.hypothesis_heads || [], d.constants_type || [], x.notation_used || [], d.docstring || null, !!d.is_simp, !!d.is_instance, d.deprecated_for || null,
      d.proof_depth ?? null, d.value_consts ?? null, contentHash, x.pagerank || 0, x.in_degree || 0, x.out_degree || 0, treeCommit,
    ]);
    if (batch.length >= 200) await flush();
    n++;
    if (n % 20000 === 0) console.log(`  ${n} declarations`);
  }
  await flush();
  console.log(`decl: ${n} rows`);

  // Derived text + weighted full-text vector (A name/gloss, B docstring, C statement gloss/topics, D module).
  let m = 0;
  for await (const d of lines(path.join(dir, "decls.jsonl"))) {
    const x = derived.get(d.name) || {};
    const id = `${libraryOf(d.module || "")}/${d.name}`;
    await pool.query(
      `INSERT INTO decl_text (id, name_gloss, statement_gloss, topic_labels, search_text)
       VALUES ($1, $2, $3, $4,
         setweight(to_tsvector('english', $5), 'A') || setweight(to_tsvector('english', coalesce($6, '')), 'B') ||
         setweight(to_tsvector('english', $3 || ' ' || array_to_string($4, ' ')), 'C') || setweight(to_tsvector('simple', $7), 'D'))
       ON CONFLICT (id) DO UPDATE SET name_gloss = EXCLUDED.name_gloss, statement_gloss = EXCLUDED.statement_gloss, topic_labels = EXCLUDED.topic_labels, search_text = EXCLUDED.search_text`,
      [id, x.name_gloss || "", x.statement_gloss || "", x.topics || [], `${d.name} ${(x.name_tokens as string[] || []).join(" ")} ${x.name_gloss || ""}`, d.docstring, (d.module || "").replace(/\./g, " ")],
    );
    if (++m % 20000 === 0) console.log(`  ${m} text rows`);
  }
  console.log(`decl_text: ${m} rows`);

  let s = 0;
  for await (const sym of lines(path.join(dir, "symbols.jsonl"))) {
    await pool.query(`INSERT INTO symbol (name, symbol, gloss, df) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO UPDATE SET symbol = EXCLUDED.symbol, gloss = EXCLUDED.gloss, df = EXCLUDED.df`, [sym.name, sym.symbol, sym.gloss || "", sym.df || 0]);
    s++;
  }
  console.log(`symbol: ${s} rows`);

  let e = 0;
  let edges: string[][] = [];
  const flushEdges = async () => {
    if (!edges.length) return;
    const values = edges.flat();
    await pool.query(`INSERT INTO dep_edge (src, dst) VALUES ${edges.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(",")} ON CONFLICT DO NOTHING`, values);
    e += edges.length; edges = [];
  };
  const ids = new Map<string, string>();
  for await (const d of lines(path.join(dir, "decls.jsonl"))) ids.set(d.name, `${libraryOf(d.module || "")}/${d.name}`);
  for await (const dep of lines(path.join(dir, "deps.jsonl"))) {
    const src = ids.get(dep.from);
    if (!src) continue;
    for (const t of dep.to as string[]) { const dst = ids.get(t); if (dst && dst !== src) edges.push([src, dst]); }
    if (edges.length >= 500) await flushEdges();
  }
  await flushEdges();
  console.log(`dep_edge: ${e} rows`);

  await pool.query(`INSERT INTO index_version (id, tree_commit, decl_count, extractor) VALUES (1, $1, $2, 'tengoku-extract') ON CONFLICT (id) DO UPDATE SET tree_commit = EXCLUDED.tree_commit, decl_count = EXCLUDED.decl_count, loaded_at = now()`, [treeCommit, n]);
  await pool.end();
  console.log(`index at ${treeCommit}: ${n} declarations loaded`);
}
main().catch((e) => { console.error(e); process.exit(1); });
