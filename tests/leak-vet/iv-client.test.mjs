// The verifier client against a local stand-in: an answer comes back, and a connection that drops mid-run fails the call cleanly
// (the first version let the stream's error crash the whole process after an hour of probing).
import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { connect } from "../../tools/leak-vet/iv-client.mjs"

function standIn() {
  const sessions = new Map()
  let n = 0
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x")
    if (req.method === "GET" && url.pathname === "/sse") {
      const sid = String(++n)
      res.writeHead(200, { "content-type": "text/event-stream" })
      sessions.set(sid, res)
      res.write(`event: endpoint\r\ndata: /message?sessionId=${sid}\r\n\r\n`) // CRLF, like the real server
      return
    }
    if (req.method === "POST" && url.pathname === "/message") {
      let b = ""
      req.on("data", (c) => (b += c))
      req.on("end", () => {
        const m = JSON.parse(b || "{}")
        res.writeHead(202).end("Accepted")
        const out = sessions.get(url.searchParams.get("sessionId"))
        if (m.id == null || !out) return
        const reply = (result) => out.write(`event: message\r\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: m.id, result })}\r\n\r\n`)
        if (m.method === "initialize") return reply({})
        if (m.method === "tools/call") {
          if (String(m.params.arguments.script).includes("DROP")) return out.destroy() // the connection dies with the call in flight
          return reply({ content: [{ type: "text", text: "✅ Compilation Successful! The proof is 100% verified." }] })
        }
      })
      return
    }
    res.writeHead(404).end()
  })
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}/sse`, close: () => {
    server.closeAllConnections()
    server.close()
  } })))
}

test("an answer comes back as an outcome with the verifier's text", async () => {
  const s = await standIn()
  const iv = await connect(s.url, { quiet: true, timeoutMs: 5000 })
  const o = await iv.verify("theorem t : True := trivial")
  assert.equal(o.ok, true)
  assert.match(o.text, /Compilation Successful/)
  assert.equal(iv.isDead(), false)
  s.close()
})

test("a connection that drops with a call in flight fails that call at once and marks the client dead; the process survives", async () => {
  const s = await standIn()
  const iv = await connect(s.url, { quiet: true, timeoutMs: 60000 })
  const t0 = Date.now()
  const o = await iv.verify("DROP")
  assert.equal(o.ok, false)
  assert.equal(o.noAnswer, true)
  assert.ok(Date.now() - t0 < 5000, "it did not wait for the timeout")
  assert.equal(iv.isDead(), true)
  const again = await iv.verify("theorem t : True := trivial")
  assert.equal(again.noAnswer, true, "a dead client answers nothing, quickly")
  // a fresh connection works
  const fresh = await connect(s.url, { quiet: true, timeoutMs: 5000 })
  assert.equal((await fresh.verify("theorem t : True := trivial")).ok, true)
  s.close()
})
