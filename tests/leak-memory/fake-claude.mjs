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
// FAKE_MODE=die: a CLI that rejects its own flags and exits at once, as an old CLI does at --restricted
if (process.env.FAKE_MODE === "die") {
  appendFileSync(process.env.FAKE_REPORT || "/dev/null", JSON.stringify({ died: true }) + "\n")
  process.stderr.write("error: unknown option '--restricted'\n")
  process.exit(1)
}
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
  appendFileSync(process.env.FAKE_REPORT, JSON.stringify({ cwd: process.cwd(), autoMemory: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY ?? null, claudeMds: process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS ?? null, resume: resumed, appendSystem: after("--append-system-prompt"), settings: after("--settings"), prompt: prompt.slice(0, 6000), promptTail: prompt.slice(-2500), promptFull: prompt, argv: args.filter((a) => a !== prompt), env: { LEAK_AGENT_NOTICES: process.env.LEAK_AGENT_NOTICES ?? null, BRIDGE_TOKEN: process.env.BRIDGE_TOKEN ?? null, TEST_SECRET_TOKEN: process.env.TEST_SECRET_TOKEN ?? null, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? null }, session: SESSION, pid: process.pid, prevBgAlive, servers: Object.fromEntries(Object.entries(cfg.mcpServers).map(([k, v]) => [k, v.url])) }) + "\n")
// FAKE_WAIT_FILE: the first invocation waits (up to 30 s) until this file exists, so a test can act on the running bridge while the agent is mid-attempt
if (process.env.FAKE_WAIT_FILE) {
  for (let i = 0; i < 300 && !existsSync(process.env.FAKE_WAIT_FILE); i++) await new Promise((r) => setTimeout(r, 100))
}
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
// which invocation of the CLI this is (1 for the first): the report has one line for each, this one included
const invocation = process.env.FAKE_REPORT && existsSync(process.env.FAKE_REPORT) ? readFileSync(process.env.FAKE_REPORT, "utf8").trim().split("\n").filter(Boolean).length : 1
// FAKE_MODE=idle: an agent that has lost its tools. The first FAKE_IDLE_STRETCHES invocations (default 3) say a line of text, make no tool call and
// stop; the ones after that work as usual. (The bridge resumes the first ones in the same conversation, then opens a new one.)
// FAKE_PATTERN="idle,idle,work,idle": a stretch by stretch script instead, where "work" verifies a lemma and stops without the target and anything else works as usual
const step = process.env.FAKE_PATTERN ? process.env.FAKE_PATTERN.split(",")[invocation - 1] || "ok" : null
if (step ? step === "idle" : mode === "idle" && invocation <= Number(process.env.FAKE_IDLE_STRETCHES || 3)) {
  out({ type: "assistant", message: { ...(process.env.FAKE_IDLE_CTX ? { id: `msg_idle_${invocation}`, model: "claude-sonnet-5-5", usage: { input_tokens: 4, output_tokens: 20, cache_read_input_tokens: Number(process.env.FAKE_IDLE_CTX), cache_creation_input_tokens: 0 } } : {}), content: [{ type: "text", text: "I will think about it some more." }] } })
  out({ type: "assistant", message: { content: [{ type: "tool_use", id: `idle_${invocation}`, name: "mcp__Leak_I__loogle_search", input: { query: "x" } }] } })
  out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: `idle_${invocation}`, is_error: true, content: "<tool_use_error>Error: No such tool available: mcp__Leak_I__loogle_search</tool_use_error>" }] } })
  out({ type: "result", subtype: "success", is_error: false, result: "I will think about it some more.", total_cost_usd: 0.01, session_id: SESSION })
  process.exit(0)
}
// The agents that stop without a proof (giveup, stubborn, lose) did something first: one tool call that worked, as an agent that is trying does.
// Without it each of their stretches would count as one with no tool call, and three of them make the bridge open a new conversation (FAKE_MODE=idle).
const workedBeforeStopping = () => {
  out({ type: "assistant", message: { content: [{ type: "tool_use", id: `worked_${invocation}`, name: "mcp__memory__memory_list", input: {} }] } })
  out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: `worked_${invocation}`, content: [{ type: "text", text: "Memory is empty for this target so far." }] }] } })
}
// lose = stop at once, and a resume finds no conversation: the CLI says so on stderr, prints nothing and exits 1
if (mode === "lose" && resumed) {
  process.stderr.write(`No conversation found with session ID: ${resumed}\n`)
  process.exit(1)
}
// FAKE_SEARCHES=n: the agent asks Leak I n times in the stretch before it stops (the bridge counts them for the reminder's Leak I check-in)
for (let i = 0; i < Number(process.env.FAKE_SEARCHES || 0); i++) out({ type: "assistant", message: { content: [{ type: "tool_use", id: `fake_search_${i}`, name: "mcp__Leak_I__moogle_search", input: { concept: "x" } }] } })
if (mode === "stubborn" || mode === "lose" || (mode === "giveup" && !resumed)) workedBeforeStopping()
if (process.env.FAKE_MIDNOTE && (mode === "stubborn" || mode === "lose" || (mode === "giveup" && !resumed))) {
  // the prompt asks for notes as the agent goes: this one wrote its NOTE/NEXT mid-stretch and ended on plain text
  out({ type: "assistant", message: { content: [{ type: "text", text: "NOTE: the mid-stretch note.\nNEXT: the mid-stretch next." }] } })
  out({ type: "assistant", message: { content: [{ type: "text", text: "Carrying on with that." }] } })
  out({ type: "result", subtype: "success", is_error: false, result: "Carrying on with that.", total_cost_usd: 0.01, session_id: SESSION })
  process.exit(0)
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
// FAKE_USAGE=1: every assistant message carries an id, a model and the usage a real API call reports, so the bridge's per-call usage record can
// be checked: the context grows by 20 000 cache-read tokens a call, unless FAKE_USAGE_DROP_AT=k, where call k reads only 30 000 (a compaction).
// FAKE_BIGCTX=n: the first invocation's conversation is n tokens big when it ends, and it does not try the target (so the bridge has to decide what to do with it)
const bigCtx = Number(process.env.FAKE_BIGCTX || 0) > 0 && invocation === 1
const noTarget = bigCtx || step === "work"
const usageOf = (k) =>
  bigCtx
    ? { id: `msg_big_${k}`, model: "claude-sonnet-5-5", usage: { input_tokens: 12, output_tokens: 300, cache_read_input_tokens: Number(process.env.FAKE_BIGCTX), cache_creation_input_tokens: 0 } }
    : process.env.FAKE_USAGE
    ? {
        id: `msg_fake_${k}`,
        model: "claude-sonnet-5-5",
        usage: { input_tokens: 12, output_tokens: 300 + k, cache_read_input_tokens: Number(process.env.FAKE_USAGE_DROP_AT) === k ? 30000 : 100000 + 20000 * k, cache_creation_input_tokens: 500 },
      }
    : {}
const toolUse = (name, input) => {
  const id = `tu${++n}`
  out({ type: "assistant", message: { ...usageOf(n), content: [{ type: "tool_use", id, name, input }] } })
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
  const concept = process.env.FAKE_SEARCH_CONCEPT || "odd sum even"
  const id = toolUse("mcp__Leak_I__moogle_search", { concept })
  const r = await mcp(searchUrl, "tools/call", { name: "moogle_search", arguments: { concept } })
  toolResult(id, r.result?.content?.[0]?.text || "")
}
// FAKE_LAB=1: the agent calls a tool of the lab server (Leak Elation / Misery), directly: the config lists it as the CLI would
const labCasUrl = cfg.mcpServers.Leak_Lab_CAS?.url
if (labCasUrl && process.env.FAKE_LAB) {
  const id = toolUse("mcp__Leak_Lab_CAS__factor", { n: 1631 })
  const r = await mcp(labCasUrl, "tools/call", { name: "factor", arguments: { n: 1631 } })
  toolResult(id, r.result?.content?.[0]?.text || "")
}
const labAtpUrl = cfg.mcpServers.Leak_Lab_ATP?.url
if (labAtpUrl && process.env.FAKE_LAB) {
  const id = toolUse("mcp__Leak_Lab_ATP__prove", { conjecture: "q(a)" })
  const r = await mcp(labAtpUrl, "tools/call", { name: "prove", arguments: { conjecture: "q(a)" } })
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
if (process.env.FAKE_TARGET !== "0" && !noTarget) {
  await pace()
  const id = toolUse("mcp__Leak_IV__verify_full_script", { script: TARGET })
  toolResult(id, await verify(TARGET))
}
out({ type: "result", subtype: "success", is_error: false, result: "done", total_cost_usd: 0.01, session_id: SESSION })
process.stdout.write("", () => process.exit(0)) // an MCP call's 60 s timer would otherwise keep this process alive after its answer, and the bridge waits for the CLI to exit (after stdout is flushed: a long line is lost to a pipe otherwise)
