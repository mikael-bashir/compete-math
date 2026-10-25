// A fake Leak I + Leak IV for the live-bridge test: MCP over SSE, enough for the bridge's client and the fake CLI.
// verify_full_script says success unless the script has `sorry`; moogle_search returns one hit.
import { createServer } from "node:http"
import { randomBytes } from "node:crypto"

// brokenBattery: the tactic probes of the rating pass close nothing, not even an easy truth (the pass must notice and stop)
export function startFakeLeak({ brokenBattery = false } = {}) {
  const sessions = new Map()
  const calls = []
  // marker: a successful verify ends with the `[[LEAK_NORMALIZED_SCRIPT_B64:...]]` marker the real Leak IV appends (the exact compiled bytes:
  // the script with `import Mathlib` in front). Off by default so the other scenarios keep their plain replies; a scenario turns it on.
  let marker = false
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x")
    const kind = url.pathname.startsWith("/iv") ? "iv" : "i"
    if (req.method === "GET" && url.pathname.endsWith("/sse")) {
      const sid = randomBytes(6).toString("hex")
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
      sessions.set(sid, res)
      res.write(`event: endpoint\ndata: /${kind}/message?sessionId=${sid}\n\n`)
      req.on("close", () => sessions.delete(sid))
      return
    }
    if (req.method === "POST" && url.pathname.endsWith("/message")) {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => {
        const m = JSON.parse(body || "{}")
        const out = sessions.get(url.searchParams.get("sessionId"))
        res.writeHead(202).end("Accepted")
        if (m.id == null || !out) return
        const reply = (result) => out.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: m.id, result })}\n\n`)
        if (m.method === "initialize") return reply({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake-leak", version: "0" } })
        if (m.method === "tools/list")
          return reply({
            tools: [
              kind === "iv"
                ? { name: "verify_full_script", description: "compile", inputSchema: { type: "object", properties: { script: { type: "string" } }, required: ["script"] } }
                : { name: "moogle_search", description: "search", inputSchema: { type: "object", properties: { concept: { type: "string" } }, required: ["concept"] } },
            ],
          })
        if (m.method === "tools/call") {
          const a = m.params?.arguments || {}
          calls.push({ kind, tool: m.params?.name, args: a })
          if (kind === "iv") {
            const script = String(a.script || "")
            // a probe of the rating pass (a statement whose proof is a tactic battery or exact?): closes only an easy truth
            // HUGE_ERROR: a failed compile as long as the one that stopped an overnight run (196,348 characters), with a head and a tail to look for
            // HUGE_OK: a compile that says it succeeded but is too long to pass whole (a long list of warnings): cut, it must not read as a clean success
            if (/HUGE_OK/.test(script)) return reply({ content: [{ type: "text", text: `✅ Compilation Successful! The proof is 100% verified.\n${"Line 7 (Warning): unused variable `h`\n".repeat(900)}` }] })
            if (/HUGE_ERROR/.test(script)) return reply({ content: [{ type: "text", text: `❌ Compilation Failed: HEAD-OF-REPORT\n${"Line 7 (Error): unsolved goals ⊢ a b c d e f\n".repeat(4800)}TAIL-OF-REPORT` }] })
            const probe = /exact\?|first \| decide/.test(script)
            const ok = probe ? !brokenBattery && /2 \+ 2 = 4|a \+ b = b \+ a|EASY_PROBE/.test(script) : !/\bsorry\b/.test(script)
            const tail = ok && marker ? `\n[[LEAK_NORMALIZED_SCRIPT_B64:${Buffer.from(`import Mathlib\n${script}`).toString("base64")}]]` : ""
            return reply({ content: [{ type: "text", text: ok ? `✅ Compilation Successful! The proof is 100% verified.${tail}` : "Compilation Failed: Line 1 (Error): declaration uses sorry" }] })
          }
          if (/HUGE/.test(String(a.concept || ""))) return reply({ content: [{ type: "text", text: `SEARCH-HEAD\n${"Mathlib.Fake.lemma_of_many_hits : a → b → c\n".repeat(2000)}SEARCH-TAIL` }] })
          return reply({ content: [{ type: "text", text: "Mathlib.Algebra.Group.even_add_odd_fake : Even a → Odd b → Odd (a + b)" }] })
        }
        reply({})
      })
      return
    }
    res.writeHead(404).end()
  })
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, calls, setMarker: (v) => (marker = !!v), close: () => server.close() })))
}
