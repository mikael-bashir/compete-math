// Golden-set evaluation of the search index (tests/tengoku-search/README.md).
//   pnpm tengoku:eval [tests/tengoku-search/golden-dev.jsonl] [--min-hit10 0.7] [--verbose]
import fs from "node:fs";
import { searchIndex } from "../src/app/lib/tengoku-search/search";
import { findNames } from "../src/app/lib/tengoku-search/shards";
import { loadEnv } from "./tengoku-index/env";
loadEnv();

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) || "tests/tengoku-search/golden-dev.jsonl";
const minHit10 = Number(args[args.indexOf("--min-hit10") + 1] || 0);
const verbose = args.includes("--verbose");

async function main() {
  const golden = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { q: string; intent: string; expect: string[] });
  let hit1 = 0, hit10 = 0, mrr = 0, evaluated = 0;
  const byIntent: Record<string, { n: number; hit10: number }> = {};
  const missing: string[] = [];
  const misses: string[] = [];
  for (const g of golden) {
    const present = await findNames(g.expect);
    if (!present.length) { missing.push(`${g.q} → ${g.expect.join(" | ")}`); continue; }
    const r = await searchIndex(g.q, { limit: 10 });
    const rank = r.results.findIndex((h) => present.includes(h.name));
    evaluated++;
    const bi = (byIntent[g.intent] ||= { n: 0, hit10: 0 }); bi.n++;
    if (rank === 0) hit1++;
    if (rank >= 0) { hit10++; mrr += 1 / (rank + 1); bi.hit10++; } else misses.push(`${g.q} [${r.intent}] → wanted ${present.join("|")}; got ${r.results.slice(0, 3).map((h) => h.name).join(", ")}`);
    if (verbose) console.log(`${rank >= 0 ? `#${rank + 1}` : "miss"}\t${g.q}\t${r.results[0]?.name ?? "-"}\t${r.tookMs}ms`);
  }
  const pct = (n: number) => (evaluated ? (100 * n / evaluated).toFixed(1) : "0.0") + "%";
  console.log(`\n${file}: ${evaluated} evaluated, ${missing.length} skipped (expected name not in index)`);
  console.log(`hit@1 ${pct(hit1)}  hit@10 ${pct(hit10)}  MRR ${(evaluated ? mrr / evaluated : 0).toFixed(3)}`);
  for (const [i, b] of Object.entries(byIntent)) console.log(`  ${i.padEnd(9)} hit@10 ${(100 * b.hit10 / b.n).toFixed(0)}% (${b.hit10}/${b.n})`);
  if (misses.length) console.log(`\nmisses:\n  ${misses.join("\n  ")}`);
  if (missing.length) console.log(`\nnot in index (fix the expectation or the index):\n  ${missing.join("\n  ")}`);
  if (evaluated && hit10 / evaluated < minHit10) { console.error(`hit@10 below ${minHit10}`); process.exit(1); }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
