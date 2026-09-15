// Ad-hoc search against the index: npx tsx scripts/tengoku-index/query.ts "<query>" [--channels name,fts] [--n 10]
import { loadEnv } from "./env";
import { searchIndex } from "../../src/app/lib/tengoku-search/search";
loadEnv();
const args = process.argv.slice(2);
const q = args.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a) && args[args.indexOf(a) - 1] !== "--channels" && args[args.indexOf(a) - 1] !== "--n").join(" ");
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
searchIndex(q, { limit: Number(opt("--n") || 10), channels: opt("--channels")?.split(",") }).then((r) => {
  console.log(`"${r.query}" → intent ${r.intent}, ${r.tookMs} ms, channels ${JSON.stringify(r.channels)}`);
  for (const [i, h] of r.results.entries()) console.log(`${String(i + 1).padStart(2)}. ${h.name}  [${h.channels.join("+")}] ${h.score.toFixed(4)}${h.variants > 1 ? ` (+${h.variants - 1} variants)` : ""}\n    ${h.statement.slice(0, 110).replace(/\s+/g, " ")}`);
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
