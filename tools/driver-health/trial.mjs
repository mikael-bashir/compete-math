#!/usr/bin/env node
// A timed trial of one harness: the real bridge from this checkout, the real `claude` CLI (your login), the remote Leak servers, one
// target, a few minutes. When it ends, the transcript is scored (score.mjs) and a line is appended to ~/.leak-runs/.trials/trials.jsonl.
// Nothing is downloaded and nothing is installed; the bridge's hook blocks that for the agent as well.
//
//   node tools/driver-health/trial.mjs --strategy control-honoured-iv --voice curious --minutes 20 [--model claude-sonnet-5-5]
//        [--target erdos-396] [--library file.json] [--label name] [--opt key=value ...]
//
// It starts its own bridge on a free port (4700-4799) and stops it afterwards, so a bridge you run yourself is not touched.
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { randomBytes } from "node:crypto"
import { scoreTranscript, renderReport } from "./score.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "../..")
const argv = process.argv.slice(2)
const flag = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const strategy = flag("strategy", "control-honoured-iv")
const voice = flag("voice", "curious")
const minutes = Number(flag("minutes", "20"))
const model = flag("model", "claude-sonnet-5-5")
const targetId = flag("target", "erdos-396")
const label = flag("label", `${strategy}-${voice}`)
const library = flag("library", "")
const extra = {}
for (let i = 0; i < argv.length; i++) if (argv[i] === "--opt") {
  const [k, v] = String(argv[i + 1] || "").split("=")
  if (k) extra[k] = v === undefined ? true : /^\d+(\.\d+)?$/.test(v) ? Number(v) : v === "true" ? true : v === "false" ? false : v
}
if (!/^claude-sonnet-5(-5)?$/.test(model)) {
  console.error(`refusing model ${model}: trials run on Sonnet 5.5 only`)
  process.exit(2)
}

const target = JSON.parse(fs.readFileSync(path.join(root, "src/data/leak-targets", `${targetId}.json`), "utf8"))
const entries = library ? JSON.parse(fs.readFileSync(library, "utf8")) : []
// The three public Leak services, with the tool lists the page would send (src/lib/mcp/leak-defaults.ts).
const mcpServers = [
  { name: "Leak_IV", url: "https://barkingtree-leak-iv.hf.space/sse", tools: [{ name: "verify_full_script", args: ["script"] }] },
  { name: "Leak_I", url: "https://barkingtree-leak-i.hf.space/sse", tools: [{ name: "loogle_search", args: ["query"] }, { name: "moogle_search", args: ["concept"] }] },
  { name: "Leak_II", url: "https://barkingtree-leak-ii.hf.space/sse", tools: ["init_proof", "apply_tactic", "get_current_proof_state", "snapshot_state", "branch_tactics", "cleanup_memory"].map((name) => ({ name, args: [] })) },
]

const runsDir = path.join(os.homedir(), ".leak-runs")
const trialsDir = path.join(runsDir, ".trials")
fs.mkdirSync(trialsDir, { recursive: true })
const PORT = 4700 + Math.floor(Math.random() * 100)
const token = randomBytes(12).toString("hex")
const startedAt = new Date()
const stamp = startedAt.toISOString().replace(/[:.]/g, "-")
const framesPath = path.join(trialsDir, `${stamp}-${label}.frames.jsonl`)
const log = (m) => console.log(`[trial ${new Date().toISOString().slice(11, 19)}] ${m}`)

log(`bridge on :${PORT}, ${strategy}, voice ${voice}, ${minutes} min, ${model}, target ${targetId}, library ${entries.length}`)
const bridge = spawn(process.execPath, [path.join(root, "public/local-claude-bridge.mjs")], {
  env: { ...process.env, PORT: String(PORT), BRIDGE_TOKEN: token, LEAK_PROOF_BANK: path.join(runsDir, ".trial-bank.json") },
  stdio: ["ignore", "pipe", "pipe"],
})
let bridgeLog = ""
bridge.stdout.on("data", (d) => (bridgeLog += d))
bridge.stderr.on("data", (d) => (bridgeLog += d))
const stopBridge = () => {
  try {
    bridge.kill("SIGTERM")
  } catch {}
}
process.on("SIGINT", () => {
  stopBridge()
  process.exit(130)
})
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 200))
  try {
    await fetch(`http://127.0.0.1:${PORT}/`)
    break
  } catch {}
}

const body = {
  theorem: target.statement,
  mcpServers,
  model,
  options: {
    model, // the run record's start line reads it from the options, as the page sends it
    strategy,
    computeBudgetMs: Math.round(minutes * 60000),
    targetId,
    memory: { entries },
    seeds: Array.isArray(target.seeds) ? target.seeds : [],
    voice,
    ...extra,
  },
}
const res = await fetch(`http://127.0.0.1:${PORT}/prove-tree`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-bridge-token": token, origin: "http://localhost:3000" },
  body: JSON.stringify(body),
})
if (!res.ok) {
  console.error(`bridge answered ${res.status}: ${(await res.text()).slice(0, 500)}\n${bridgeLog.slice(-2000)}`)
  stopBridge()
  process.exit(1)
}
const out = fs.createWriteStream(framesPath)
let buf = ""
let done = null
let frames = 0
const dec = new TextDecoder()
const t0 = Date.now()
let lastSaid = 0
for await (const chunk of res.body) {
  buf += dec.decode(chunk, { stream: true })
  let i
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const raw = buf.slice(0, i)
    buf = buf.slice(i + 2)
    const d = raw.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("")
    if (!d) continue
    out.write(d + "\n")
    frames++
    try {
      const f = JSON.parse(d)
      if (f.type === "done") done = f
      if (f.type === "message-annotation" && f.subtype === "status" && Date.now() - lastSaid > 30000) {
        lastSaid = Date.now()
        log(`${Math.round((Date.now() - t0) / 60000)} min · ${String(f.thought || "").replace(/\s+/g, " ").slice(0, 140)}`)
      }
    } catch {}
  }
}
out.end()
stopBridge()
await new Promise((r) => setTimeout(r, 1500))
log(`run ended after ${Math.round((Date.now() - t0) / 60000)} min, ${frames} frames, verified=${!!done?.verified}, cost $${Number(done?.metrics?.cost_usd || 0).toFixed(2)}`)

// the transcript: the newest run file for this target that started after we did
const slug = (/theorem\s+([A-Za-z0-9_'.]+)/.exec(target.statement) || [])[1] || "run"
const candidates = fs
  .readdirSync(runsDir)
  .filter((n) => n.endsWith(`-${slug}.jsonl`) && n.slice(0, 24).replace(/-/g, (m, i) => (i === 13 || i === 16 ? ":" : i === 19 ? "." : m)) >= startedAt.toISOString().slice(0, 19))
  .sort()
const transcript = (() => {
  for (const n of candidates) {
    try {
      const first = JSON.parse(fs.readFileSync(path.join(runsDir, n), "utf8").split("\n")[0])
      if (first.strategy === strategy) return path.join(runsDir, n)
    } catch {}
  }
  return null
})()
if (!transcript) {
  console.error("no transcript found for this trial")
  process.exit(1)
}
const r = scoreTranscript(fs.readFileSync(transcript, "utf8"))
console.log(`\n${transcript}\n${renderReport(r)}`)
fs.appendFileSync(path.join(trialsDir, "trials.jsonl"), JSON.stringify({ at: startedAt.toISOString(), label, strategy, voice, minutes, model, targetId, library: entries.length, extra, transcript: path.basename(transcript), verified: !!done?.verified, cost_usd: done?.metrics?.cost_usd ?? null, verdict: r.verdict, flags: r.flags, signals: r.signals }) + "\n")
process.exit(0)
