#!/usr/bin/env node
// A stand-in for the `claude` CLI, for tests/leak-memory/live-bridge.mjs. It speaks the stream-json the bridge reads and, like the real CLI,
// reaches the bridge's MCP servers over SSE from the --mcp-config file: it recalls from the memory tool and searches, so the whole
// path (server name, tools, augmentation, saving) is exercised without a model.
import { readFileSync, appendFileSync, existsSync } from "node:fs"
import { spawn as spawnChild, spawnSync } from "node:child_process"
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n")
const args = process.argv.slice(2)
const cfgPath = args[args.indexOf("--mcp-config") + 1]
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"))
const SESSION = `fake-session-${process.pid}`
const after = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null)
const prompt = after("-p") || ""
const resumed = after("--resume")
// FAKE_BG: like an agent that runs `nohup python3 search.py &`: start a background process in this CLI's own process group, and say
// whether the ones earlier invocations started are still alive. FAKE_MODE=hang then never exits, like a CLI in a long think.
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
// FAKE_BASH_TRY: a JSON list of shell commands the agent "tries": each goes through the PreToolUse hooks of --settings as the real CLI's Bash
// tool does, and a blocked one (exit status 2) is not run.
if (process.env.FAKE_BASH_TRY) {
  const settingsArg = (() => { const i = process.argv.indexOf("--settings"); return i >= 0 ? process.argv[i + 1] : null })()
  const hooks = settingsArg ? JSON.parse(existsSync(settingsArg) ? readFileSync(settingsArg, "utf8") : settingsArg).hooks?.PreToolUse || [] : []
  for (const command of JSON.parse(process.env.FAKE_BASH_TRY)) {
    for (const h of hooks.filter((x) => x.matcher === "Bash").flatMap((x) => x.hooks || [])) {
      spawnSync("sh", ["-c", h.command], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }), encoding: "utf8" })
    }
  }
}
const prevBg = process.env.FAKE_BG && existsSync(process.env.FAKE_BG) ? readFileSync(process.env.FAKE_BG, "utf8").trim().split("\n").filter(Boolean).map(Number) : []
const prevBgAlive = prevBg.map(alive)
if (process.env.FAKE_BG) {
  if (process.env.FAKE_BG_PLAIN) {
    // a plain child in this CLI's own process group
    const bg = spawnChild(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" })
    appendFileSync(process.env.FAKE_BG, bg.pid + "\n")
  } else {
    // what the real CLI's Bash tool does with `nohup job &`: it passes the command through the PreToolUse hooks of --settings (which may
    // rewrite it), then runs it in a shell that leads a process group and session of its own. That shell starts the job and exits, so the
    // job is an orphan (parent 1) that neither the CLI's process group nor its process tree reaches.
    let command = `"${process.execPath}" -e "setInterval(()=>{},1000)" >/dev/null 2>&1 & echo $! >> "${process.env.FAKE_BG}"`
    const settingsArg = after("--settings")
    const hooks = settingsArg ? JSON.parse(existsSync(settingsArg) ? readFileSync(settingsArg, "utf8") : settingsArg).hooks?.PreToolUse || [] : []
    for (const h of hooks.filter((x) => x.matcher === "Bash").flatMap((x) => x.hooks || [])) {
      const r = spawnSync("sh", ["-c", h.command], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }), encoding: "utf8" })
      if (r.status === 2) { command = "" ; break } // blocked
      const upd = r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput?.updatedInput?.command : null
      if (upd) command = upd
    }
    if (command) spawnChild("bash", ["-c", command], { stdio: "ignore", detached: true }).unref()
    await new Promise((r) => setTimeout(r, 300))
  }
}
// FAKE_REPORT: one line per invocation, so a test can see how the bridge called the CLI (cwd, env, resume, settings)
if (process.env.FAKE_REPORT)
  appendFileSync(process.env.FAKE_REPORT, JSON.stringify({ cwd: process.cwd(), autoMemory: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY ?? null, claudeMds: process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS ?? null, resume: resumed, appendSystem: after("--append-system-prompt"), settings: after("--settings"), prompt: prompt.slice(0, 6000), promptTail: prompt.slice(-2500), promptFull: prompt, argv: args.filter((a) => a !== prompt), env: { BRIDGE_TOKEN: process.env.BRIDGE_TOKEN ?? null, TEST_SECRET_TOKEN: process.env.TEST_SECRET_TOKEN ?? null, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? null }, session: SESSION, pid: process.pid, prevBgAlive }) + "\n")
// FAKE_MODE: giveup = stop at once unless resumed; stubborn = always stop at once; lose = stop at once, a resume fails; sleep = answer the consolidation prompt with FAKE_SLEEP_JSON
const mode = process.env.FAKE_MODE || "ok"
if (mode === "hang") setInterval(() => {}, 1000)
if (mode === "hang") await new Promise(() => {})
// the rating pass of the sleep stage: a reading of each theorem in the prompt (FAKE_READING overrides the default scores)
if (/You are reviewing theorems that an automated prover banked/.test(prompt)) {
  const base = { says: "a fake reading", kind: "general-lemma", depth: 3, generality: 3, role: 2, inMathlib: "no", vacuous: "no", ...(process.env.FAKE_READING ? JSON.parse(process.env.FAKE_READING) : {}) }
  const ids = [...prompt.matchAll(/^### (\S+)$/gm)].map((m) => m[1])
  out({ type: "result", subtype: "success", is_error: false, result: "```json\n" + JSON.stringify(ids.map((id) => ({ id, ...base }))) + "\n```", total_cost_usd: 0.01, session_id: SESSION })
  process.exit(0)
}
if (/consolidation \("sleep"\) stage/.test(prompt)) {
  out({ type: "result", subtype: "success", is_error: false, result: "```json\n" + (process.env.FAKE_SLEEP_JSON || "[]") + "\n```", total_cost_usd: 0.01, session_id: SESSION })
  process.exit(0)
}
// lose = stop at once, and a resume finds no conversation: the CLI says so on stderr, prints nothing and exits 1
if (mode === "lose" && resumed) {
  process.stderr.write(`No conversation found with session ID: ${resumed}\n`)
  process.exit(1)
}
if (mode === "stubborn" || mode === "lose" || (mode === "giveup" && !resumed)) {
  out({ type: "assistant", message: { content: [{ type: "text", text: "Not done: this is an open problem.\nNOTE: the fake learned nothing yet.\nNEXT: fake next step, try the small case." }] } })
  out({ type: "result", subtype: "success", is_error: false, result: "Not done: this is an open problem.\nNOTE: the fake learned nothing yet.\nNEXT: fake next step, try the small case.", total_cost_usd: 0.01, session_id: SESSION })
  process.exit(0)
}
const LEMMA = `theorem odd_odd_sum_even_fake (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0 := by
  have h := ha
  omega`
const TARGET = process.env.FAKE_TARGET_PROOF || `theorem target_fake (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0 := by
  omega`

async function mcp(url, method, params, session) {
  // minimal MCP-over-SSE client: open the stream, read the endpoint, POST, read the reply from the stream
  const ctl = new AbortController()
  const res = await fetch(url, { headers: { accept: "text/event-stream" }, signal: ctl.signal })
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let endpoint = null
  const base = new URL(url)
  const waiters = new Map()
  ;(async () => {
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true }))
      if (done) return
      buf += dec.decode(value)
      let i
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const ev = /event: (.*)/.exec(chunk)?.[1]
        const data = /data: (.*)/.exec(chunk)?.[1]
        if (ev === "endpoint") endpoint = new URL(data, base).href
        else if (data) {
          try {
            const m = JSON.parse(data)
            waiters.get(m.id)?.(m)
          } catch {}
        }
      }
    }
  })()
  for (let k = 0; k < 100 && !endpoint; k++) await new Promise((r) => setTimeout(r, 50))
  const send = async (id, method, params) => {
    const p = new Promise((r) => waiters.set(id, r))
    await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("mcp timeout")), 60000))])
  }
  await send(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "fake", version: "0" } })
  const tools = await send(2, "tools/list", {})
  const r = await send(3, method, params)
  ctl.abort()
  return { tools: tools.result?.tools?.map((t) => t.name) || [], result: r.result }
}

let n = 0
// FAKE_PACE_MS slows the stand-in down so the visualiser can be watched by hand
const pace = () => new Promise((r) => setTimeout(r, Number(process.env.FAKE_PACE_MS) || 0))
const toolUse = (name, input) => {
  const id = `tu${++n}`
  out({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } })
  return id
}
const toolResult = (id, text) => out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }] } })

const mem = cfg.mcpServers.memory?.url
if (mem) {
  await pace()
  const id = toolUse("mcp__memory__memory_recall", { query: process.env.FAKE_QUERY || "odd sum even" })
  const r = await mcp(mem, "tools/call", { name: "memory_recall", arguments: { query: process.env.FAKE_QUERY || "odd sum even" } })
  toolResult(id, `[tools: ${r.tools.join(",")}] ${r.result?.content?.[0]?.text || ""}`)
}
if (mem && process.env.FAKE_LIST) {
  const id = toolUse("mcp__memory__memory_list", { limit: 50 })
  const r = await mcp(mem, "tools/call", { name: "memory_list", arguments: { limit: 50 } })
  toolResult(id, r.result?.content?.[0]?.text || "")
}
const searchUrl = cfg.mcpServers.Leak_I?.url
if (searchUrl && process.env.FAKE_SEARCH) {
  await pace()
  const id = toolUse("mcp__Leak_I__moogle_search", { concept: "odd sum even" })
  const r = await mcp(searchUrl, "tools/call", { name: "moogle_search", arguments: { concept: "odd sum even" } })
  toolResult(id, r.result?.content?.[0]?.text || "")
}
// FAKE_VERIFY_VIA_MCP=1: the verify call really goes to the Leak_IV server of the config (the bridge's guarded proxy, in a memory
// run), so what the bridge does with a script before it reaches the verifier can be seen. Otherwise the answer is made up here.
const verify = async (script) => {
  const url = cfg.mcpServers.Leak_IV?.url
  if (process.env.FAKE_VERIFY_VIA_MCP === "1" && url) {
    const r = await mcp(url, "tools/call", { name: "verify_full_script", arguments: { script } })
    return `${r.result?.content?.[0]?.text || ""}\n[tools: ${r.tools.join(",")}]`
  }
  return "✅ Compilation Successful! The proof is 100% verified."
}
if (process.env.FAKE_LEMMA !== "0") {
  await pace()
  const id = toolUse("mcp__Leak_IV__verify_full_script", { script: LEMMA })
  toolResult(id, await verify(LEMMA))
}
if (process.env.FAKE_TARGET !== "0") {
  await pace()
  const id = toolUse("mcp__Leak_IV__verify_full_script", { script: TARGET })
  toolResult(id, await verify(TARGET))
}
out({ type: "result", subtype: "success", is_error: false, result: "done", total_cost_usd: 0.01, session_id: SESSION })
