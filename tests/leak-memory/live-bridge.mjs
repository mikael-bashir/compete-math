// End-to-end: spawn the real bridge with a fake `claude` CLI and fake Leak servers, POST /prove-tree with a memory variant,
// and check the frames, the exposed tools, the augmentation, saving and the final re-check.
//   node tests/leak-memory/live-bridge.mjs
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import assert from "node:assert/strict"
import { startFakeLeak } from "./fake-leak.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const bridgePath = path.join(here, "../../public/local-claude-bridge.mjs")
const PORT = 4300 + Math.floor(Math.random() * 500)

// The bridge banks proofs and logs runs under $HOME; give it a throwaway one so a test never touches the real bank.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "leak-memory-live-"))
const leak = await startFakeLeak()
const bridge = spawn("node", [bridgePath], {
  env: { ...process.env, HOME, LEAK_PROOF_BANK: path.join(HOME, "bank.json"), PORT: String(PORT), CLAUDE_BIN: path.join(here, "fake-claude.mjs"), FAKE_SEARCH: "1", BRIDGE_TOKEN: "test-token" },
  stdio: ["ignore", "pipe", "pipe"],
})
let log = ""
bridge.stdout.on("data", (d) => (log += d))
bridge.stderr.on("data", (d) => (log += d))
for (let i = 0; i < 100 && !/listening|127\.0\.0\.1/.test(log); i++) await new Promise((r) => setTimeout(r, 100))

const mcpServers = [
  { name: "Leak_IV", url: `http://127.0.0.1:${leak.port}/iv/sse`, tools: ["verify_full_script"] },
  { name: "Leak_I", url: `http://127.0.0.1:${leak.port}/i/sse`, tools: [{ name: "moogle_search", args: ["concept"] }] },
]
const THEOREM = "theorem target_fake (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0 := by\n  sorry"

async function run(strategy, extra = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}/prove-tree`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bridge-token": "test-token", origin: "http://localhost:3000" },
    body: JSON.stringify({ theorem: THEOREM, mcpServers, model: "sonnet", options: { strategy, computeBudgetMs: 120000, targetId: "fake-1", ...extra } }),
  })
  if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()))
  const frames = []
  let buf = ""
  const dec = new TextDecoder()
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true })
    let i
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const d = raw.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("")
      if (d) try { frames.push(JSON.parse(d)) } catch {}
    }
  }
  return frames
}

let failed = 0
const check = async (name, fn) => {
  try {
    await fn()
    console.log("ok  ", name)
  } catch (e) {
    failed++
    console.log("FAIL", name, "\n    ", String(e.message).split("\n")[0])
  }
}

const seed = [{ id: "seed1", name: "odd_pair_even_seed", statement: "theorem odd_pair_even_seed (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0", closure: "theorem odd_pair_even_seed (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0 := by\n  omega", origin: "seed", saved_at: 1 }]

let honoured
await check("honoured: solves, recalls, saves", async () => {
  honoured = await run("control-honoured", { memory: { entries: seed } })
  if (process.env.DUMP) for (const f of honoured) console.log("   ", JSON.stringify(f).slice(0, 260))
  const types = honoured.map((f) => f.type)
  const mem = honoured.filter((f) => f.type === "memory")
  assert.ok(mem.length > 0, "no memory frames; types: " + [...new Set(types)].join(","))
  assert.ok(mem.some((f) => f.op === "save"), "no save op")
  assert.ok(JSON.stringify(honoured).includes("memory_recall"), "recall tool never used")
})
await check("honoured: final result verified", async () => {
  const last = honoured.filter((f) => f.type === "result" || f.type === "done" || f.type === "final").pop()
  assert.ok(last, "no terminal frame: " + [...new Set(honoured.map((f) => f.type))].join(","))
  assert.ok(/verified|true/.test(JSON.stringify(last)), JSON.stringify(last).slice(0, 300))
})
await check("flint: no memory tools exposed", async () => {
  const f = await run("control-flint", { memory: { entries: seed } })
  assert.ok(!JSON.stringify(f).includes("memory_recall"))
  assert.ok(f.some((x) => x.type === "memory" && x.op === "save"))
})
await check("paragon: search carries memory block", async () => {
  const f = await run("control-paragon", { memory: { entries: seed } })
  assert.ok(JSON.stringify(f).includes("odd_pair_even_seed"), "seed lemma not surfaced")
})
await check("cost cap and attemptMs accepted", async () => {
  const f = await run("control-honoured", { maxCostUsd: 0.001, attemptMs: 60000, memory: { entries: [] } })
  assert.ok(f.length > 0)
})
await check("plain control-ii untouched", async () => {
  const f = await run("control-ii")
  assert.ok(!f.some((x) => x.type === "memory"))
})

bridge.kill()
leak.close()
fs.rmSync(HOME, { recursive: true, force: true })
if (failed) {
  console.log("\n--- bridge log tail ---\n" + log.split("\n").slice(-40).join("\n"))
  process.exit(1)
}
console.log("all live-bridge checks passed")
process.exit(0)
