// By hand, never in CI: the real `claude` CLI (your login) through the real bridge, against the fake Leak servers, with Sonnet 5 (SMOKE_MODEL overrides), bounded by time only.
//   node tests/leak-memory/real-cli-smoke.mjs
// It checks what the fake CLI cannot: that the real CLI starts under the isolation (own process group, scratch directory, auto-memory
// off), reaches the bridge's MCP servers, and that a background job the real CLI's Bash tool starts dies with the run, both when the run
// finishes and when it is terminated. The theorem text asks the model to start `sleep 731` / `sleep 732` / `sleep 733` in the background.
import { spawn, execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import { startFakeLeak } from "./fake-leak.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const leak = await startFakeLeak()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leak-real-smoke-"))
const PORT = 4900 + Math.floor(Math.random() * 90)
// the real HOME is needed for the CLI's login; only the proof bank is redirected
const bridge = spawn(process.execPath, [path.join(here, "../../public/local-claude-bridge.mjs")], {
  env: { ...process.env, PORT: String(PORT), BRIDGE_TOKEN: "smoke", LEAK_PROOF_BANK: path.join(tmp, "bank.json"), TMPDIR: tmp },
  stdio: "ignore",
})
await new Promise((r) => setTimeout(r, 1500))
const mcpServers = [
  { name: "Leak_IV", url: `http://127.0.0.1:${leak.port}/iv/sse`, tools: ["verify_full_script"] },
  { name: "Leak_I", url: `http://127.0.0.1:${leak.port}/i/sse`, tools: [{ name: "moogle_search", args: ["concept"] }] },
]
const pgrep = (pat) => { try { return execFileSync("pgrep", ["-f", pat]).toString().trim().split("\n").filter(Boolean) } catch { return [] } }
const theorem = (n) => `-- SMOKE TEST of the harness. Your very first action, before anything else: run this exact Bash command and nothing else with it:
--   nohup sleep ${n} > /dev/null 2>&1 &
-- Then verify the theorem below once with verify_full_script (simp is enough) and stop.
theorem smoke_${n} (a : ℕ) : a + 0 = a := by
  sorry`
const post = (n, signal) =>
  fetch(`http://127.0.0.1:${PORT}/prove-tree`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bridge-token": "smoke", origin: "http://localhost:3000" },
    body: JSON.stringify({ theorem: theorem(n), mcpServers, model: process.env.SMOKE_MODEL || "claude-sonnet-5", options: { strategy: "control-honoured", computeBudgetMs: 120000, targetId: "smoke", memory: { entries: [] }, minAttemptMs: 0 } }),
    signal,
  })

let bad = 0
const say = (ok, msg) => { console.log(ok ? "ok  " : "FAIL", msg); if (!ok) bad++ }

// A: let it finish
let r = await post(731)
let text = ""
const dec = new TextDecoder()
for await (const c of r.body) text += dec.decode(c, { stream: true })
const frames = text.split("\n\n").map((x) => x.replace(/^data: /, "")).filter(Boolean).map((x) => { try { return JSON.parse(x) } catch { return null } }).filter(Boolean)
const started = frames.some((f) => /sleep 731/.test(JSON.stringify(f)))
if (process.env.DUMP) console.log(r.status, text.slice(0, 1500))
say(started, "the real CLI ran under the isolation and started the background job (its Bash call is in the transcript)")
say(frames.some((f) => f.type === "done"), "the run ended: " + JSON.stringify(frames.filter((f) => f.type === "done").map((f) => ({ verified: f.verified }))))
await new Promise((r) => setTimeout(r, 1500))
if (process.env.DUMP) for (const pid of pgrep("^sleep 731")) { try { console.log(execFileSync("ps", ["-o", "pid,pgid,ppid,sess,etime,command", "-p", pid]).toString().split("\n")[1]) } catch {} }
say(pgrep("^sleep 731").length === 0, "no `sleep 731` survives the run: " + pgrep("^sleep 731").join(","))

// B: terminate while it runs
const ctl = new AbortController()
const p = post(732, ctl.signal).then((x) => x.text()).catch(() => "")
let seen = false
for (let i = 0; i < 300 && !seen; i++) { await new Promise((r) => setTimeout(r, 200)); seen = pgrep("^sleep 732").length > 0 }
say(seen, "the job is running while the run is")
ctl.abort()
await p
await new Promise((r) => setTimeout(r, 2500))
say(pgrep("^sleep 732").length === 0, "no `sleep 732` survives the terminate: " + pgrep("^sleep 732").join(","))
say(pgrep("leak-agent-").length === 0, "no CLI process is left in a scratch directory")

// C: stop the bridge itself while it runs
const p3 = post(733).then((x) => x.text()).catch(() => "")
let seen3 = false
for (let i = 0; i < 300 && !seen3; i++) { await new Promise((r) => setTimeout(r, 200)); seen3 = pgrep("^sleep 733").length > 0 }
say(seen3, "the job is running while the run is (bridge-stop case)")
bridge.kill("SIGTERM")
await p3
await new Promise((r) => setTimeout(r, 2500))
say(pgrep("^sleep 733").length === 0, "no `sleep 733` survives the bridge being stopped: " + pgrep("^sleep 733").join(","))
say(pgrep("leak-agent-").length === 0, "no CLI process is left after the bridge stopped")

bridge.kill()
leak.close()
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
