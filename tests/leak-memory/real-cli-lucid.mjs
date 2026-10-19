// By hand, never in CI: a short Lucid run with the real `claude` CLI (Sonnet 5, time budget only) through the real bridge against the fake Leak
// servers. It shows what the agent actually does: which Leak tools it calls, whether it recalls from the library, what it saves, and whether the
// run leaves anything behind (processes, scratch directories, notes in ~/.claude/projects).
//   node tests/leak-memory/real-cli-lucid.mjs      (LUCID_MS = time budget in ms, default 240000)
import { spawn, execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import { startFakeLeak } from "./fake-leak.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const leak = await startFakeLeak()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leak-real-lucid-"))
const PORT = 4900 + Math.floor(Math.random() * 90)
const projects = path.join(os.homedir(), ".claude", "projects")
const listing = () => { try { return fs.readdirSync(projects).flatMap((d) => { try { return fs.readdirSync(path.join(projects, d, "memory")).map((f) => `${d}/memory/${f}`) } catch { return [] } }) } catch { return [] } }
const notesBefore = new Set(listing())
const bridge = spawn(process.execPath, [path.join(here, "../../public/local-claude-bridge.mjs")], {
  env: { ...process.env, PORT: String(PORT), BRIDGE_TOKEN: "smoke", LEAK_PROOF_BANK: path.join(tmp, "bank.json"), TMPDIR: tmp },
  stdio: "ignore",
})
await new Promise((r) => setTimeout(r, 1500))
const mcpServers = [
  { name: "Leak_IV", url: `http://127.0.0.1:${leak.port}/iv/sse`, tools: ["verify_full_script"] },
  { name: "Leak_I", url: `http://127.0.0.1:${leak.port}/i/sse`, tools: [{ name: "moogle_search", args: ["concept"] }] },
]
const theorem = `theorem lucid_smoke (a b : ℕ) : a + b + 0 = b + a := by
  sorry`
const seed = "theorem seed_add_zero_fake (a : ℕ) : a + 0 = a := by\n  simp"
const ms = Number(process.env.LUCID_MS || 240000)
const r = await fetch(`http://127.0.0.1:${PORT}/prove-tree`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-bridge-token": "smoke", origin: "http://localhost:3000" },
  body: JSON.stringify({ theorem, mcpServers, model: process.env.SMOKE_MODEL || "claude-sonnet-5", options: { strategy: "control-lucid", computeBudgetMs: ms, targetId: "smoke", memory: { entries: [] }, seeds: [seed] } }),
})
let text = ""
const dec = new TextDecoder()
for await (const c of r.body) text += dec.decode(c, { stream: true })
const frames = text.split("\n\n").map((x) => x.replace(/^data: /, "")).filter(Boolean).map((x) => { try { return JSON.parse(x) } catch { return null } }).filter(Boolean)
console.log("status", r.status, "frames", frames.length)
console.log("leak calls:", leak.calls.map((c) => `${c.tool}(${JSON.stringify(c.args).slice(0, 80)})`))
const mem = frames.filter((f) => f.type === "memory")
console.log("memory frames:", mem.map((f) => f.op + (f.entry?.name ? ":" + f.entry.name : "")))
console.log("done:", JSON.stringify(frames.filter((f) => f.type === "done").map((f) => ({ verified: f.verified }))))
for (const f of frames.filter((f) => f.type === "message-annotation" && /🧠|↩️|✅|⚠️|Sleep/.test(f.thought || ""))) console.log("  ·", String(f.thought).slice(0, 200))
let bad = 0
const say = (ok, msg) => { console.log(ok ? "ok  " : "FAIL", msg); if (!ok) bad++ }
await new Promise((r) => setTimeout(r, 2500))
say(leak.calls.some((c) => c.tool === "verify_full_script"), "the agent called verify_full_script")
say(listing().every((f) => notesBefore.has(f)), "no new notes in ~/.claude/projects/*/memory: " + listing().filter((f) => !notesBefore.has(f)).join(", "))
say(fs.readdirSync(tmp).every((f) => !f.startsWith("leak-agent-")), "no scratch directory left")
try { execFileSync("pgrep", ["-f", "leak-agent-"]); say(false, "a process is still in a scratch directory") } catch { say(true, "no process left in a scratch directory") }
bridge.kill()
leak.close()
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
