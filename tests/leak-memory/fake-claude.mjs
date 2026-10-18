#!/usr/bin/env node
// A stand-in for the `claude` CLI, for tests/leak-memory/live-bridge.mjs. It speaks the stream-json the bridge reads and, like the real CLI,
// reaches the bridge's MCP servers over SSE from the --mcp-config file: it recalls from the memory tool and searches, so the whole
// path (server name, tools, augmentation, saving) is exercised without a model.
import { readFileSync } from "node:fs"
const args = process.argv.slice(2)
const cfgPath = args[args.indexOf("--mcp-config") + 1]
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"))
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n")
const SESSION = "fake-session"
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
const searchUrl = cfg.mcpServers.Leak_I?.url
if (searchUrl && process.env.FAKE_SEARCH) {
  await pace()
  const id = toolUse("mcp__Leak_I__moogle_search", { concept: "odd sum even" })
  const r = await mcp(searchUrl, "tools/call", { name: "moogle_search", arguments: { concept: "odd sum even" } })
  toolResult(id, r.result?.content?.[0]?.text || "")
}
if (process.env.FAKE_LEMMA !== "0") {
  await pace()
  const id = toolUse("mcp__Leak_IV__verify_full_script", { script: LEMMA })
  toolResult(id, "✅ Compilation Successful! The proof is 100% verified.")
}
if (process.env.FAKE_TARGET !== "0") {
  await pace()
  const id = toolUse("mcp__Leak_IV__verify_full_script", { script: TARGET })
  toolResult(id, "✅ Compilation Successful! The proof is 100% verified.")
}
out({ type: "result", subtype: "success", is_error: false, result: "done", total_cost_usd: 0.01, session_id: SESSION })
