// A minimal MCP client for Leak IV over SSE (initialize, then tools/call verify_full_script), shared by the tools that probe the verifier.
import { outcome, takeEvents } from "./vet-core.mjs"

// a minimal MCP client over SSE (initialize, then tools/call)
export async function connect(url, { timeoutMs = 240000, quiet = false } = {}) {
  const res = await fetch(url, { headers: { accept: "text/event-stream" } })
  const pending = new Map()
  let endpoint = null
  let ready
  const gotEndpoint = new Promise((r) => (ready = r))
  ;(async () => {
    const dec = new TextDecoder()
    let buf = ""
    for await (const chunk of res.body) {
      const t = takeEvents(buf + dec.decode(chunk, { stream: true }))
      buf = t.rest
      for (const { event, data } of t.events) {
        if (event === "endpoint") {
          endpoint = new URL(data, url).toString()
          ready()
        } else if (data) {
          try {
            const m = JSON.parse(data)
            if (m.id != null && pending.has(m.id)) pending.get(m.id)(m)
          } catch { /* a keep-alive or a non-JSON event */ }
        }
      }
    }
  })()
  await gotEndpoint
  let id = 0
  const call = (method, params) =>
    new Promise(async (resolve, reject) => {
      const myId = ++id
      const timer = setTimeout(() => reject(new Error(`${method} timed out after ${timeoutMs / 1000}s`)), timeoutMs)
      pending.set(myId, (m) => {
        clearTimeout(timer)
        resolve(m)
      })
      await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) })
    })
  await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "leak-client", version: "1" } })
  await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) })
  return {
    verify: async (script, label = "") => {
      const t0 = Date.now()
      try {
        const m = await call("tools/call", { name: "verify_full_script", arguments: { script } })
        const text = (m.result?.content || []).map((c) => c.text || "").join("\n")
        const o = { ...outcome(text), text }
        if (!quiet) process.stderr.write(`  . ${label} ${o.ok ? "closed" : "not closed"} (${Math.round((Date.now() - t0) / 1000)}s)\n`)
        return o
      } catch (e) {
        // a probe that never answered is not a proof: it counts as not closed, and the run says so
        if (!quiet) process.stderr.write(`  . ${label} no answer: ${e.message}\n`)
        return { ok: false, failed: true, errors: [e.message], sorry: false, onlySorry: false, noAnswer: true }
      }
    },
  }
}

