// node tests/leak-min-imports/live-smoke.mjs [url]  — one real script through minimizeImports on the live Leak IV (not part of `npm test`)
import { minimizeImports } from "../../public/leak-min-imports.mjs"
import { callTool } from "./mcp-client.mjs"

const url = process.argv[2] || "https://barkingtree-leak-iv.hf.space"
const script = `import Tengoku.All

theorem t1 (a b : Nat) : a + b = b + a := by omega

theorem t2 (x : ℝ) (h : 0 < x) : 0 < x ^ 2 := by positivity
`
const verify = (s) => callTool(url, "verify_full_script", { script: s }, { timeoutMs: 400000 })
const r = await minimizeImports(script, verify, { log: (m) => console.log("log:", m) })
console.log(JSON.stringify({ narrowed: r.narrowed, reason: r.reason, imports: r.imports, detail: r.detail }, null, 1))
console.log("--- script ---\n" + r.script)
