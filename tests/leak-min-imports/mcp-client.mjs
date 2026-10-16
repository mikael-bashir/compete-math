// A minimal MCP-over-SSE client for the live tests: one tool call per connection (what the bridge's callRemoteMcpTool does, without the retries).
export async function callTool(baseUrl, tool, args, { timeoutMs = 300000 } = {}) {
  const base = baseUrl.replace(/\/$/, "")
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}/sse`, { headers: { accept: "text/event-stream" }, signal: ac.signal })
    if (!res.ok || !res.body) throw new Error(`SSE ${base}: HTTP ${res.status}`)
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ""
    const waiting = new Map()
    let endpoint
    let onEndpoint
    const endpointReady = new Promise((r) => (onEndpoint = r))
    const pump = (async () => {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n")
        let i
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const ev = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const type = /^event: (.*)$/m.exec(ev)?.[1]
          const data = ev.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n")
          if (type === "endpoint") {
            endpoint = new URL(data, base).href
            onEndpoint()
          } else if (type === "message") {
            try {
              const j = JSON.parse(data)
              if (j.id != null && waiting.has(j.id)) waiting.get(j.id)(j)
            } catch {
              /* not JSON */
            }
          }
        }
      }
    })().catch(() => {})
    await endpointReady
    const rpc = (id, method, params) =>
      new Promise((resolve, reject) => {
        waiting.set(id, resolve)
        fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }), signal: ac.signal }).catch(reject)
      })
    await rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "leak-min-imports-test", version: "1" } })
    await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), signal: ac.signal })
    const out = await rpc(2, "tools/call", { name: tool, arguments: args })
    ac.abort()
    await pump
    const content = out.result?.content || []
    return { ok: !out.error && !out.result?.isError, text: content.map((c) => c.text || "").join("\n"), error: out.error ? JSON.stringify(out.error) : "" }
  } finally {
    clearTimeout(timer)
  }
}
