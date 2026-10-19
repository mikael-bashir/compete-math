// node scripts/verify-target-seeds.mjs [leak-iv-sse-url]
// Compiles every entry the memory would build from each target's seed lemmas (src/data/leak-targets/*.json) on Leak IV, exactly as an
// agent would paste it. Needs the network, so it is run by hand when a seed changes, not in CI. Exit code 1 if any entry fails.
import { readdirSync, readFileSync } from "node:fs"
import { Memory } from "../public/leak-memory.mjs"

const url = process.argv[2] || "https://barkingtree-leak-iv.hf.space/sse"
async function verify(script) {
  const ac = new AbortController()
  const res = await fetch(url, { headers: { Accept: "text/event-stream" }, signal: ac.signal })
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = "", post = null, next = 1
  const pending = new Map()
  ;(async () => {
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true }))
      if (done) return
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n")
      let i
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i)
        buf = buf.slice(i + 2)
        let evt = "message"
        const lines = []
        for (const l of chunk.split("\n")) {
          if (l.startsWith("event:")) evt = l.slice(6).trim()
          else if (l.startsWith("data:")) lines.push(l.slice(5).trimStart())
        }
        if (!lines.length) continue
        if (evt === "endpoint") post = new URL(lines.join("\n"), new URL(url).origin).toString()
        else try { const m = JSON.parse(lines.join("\n")); pending.get(m.id)?.(m) } catch {}
      }
    }
  })()
  const rpc = async (method, params) => {
    for (let t = 0; !post && t < 400; t++) await new Promise((r) => setTimeout(r, 50))
    const id = next++
    const p = new Promise((resolve, reject) => { pending.set(id, resolve); setTimeout(() => reject(new Error("timeout")), 240000) })
    await fetch(post, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })
    return p
  }
  try {
    await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "verify-target-seeds", version: "0" } })
    const r = await rpc("tools/call", { name: "verify_full_script", arguments: { script } })
    return r.result?.content?.map((c) => c.text ?? "").join("\n") ?? ""
  } finally {
    ac.abort()
  }
}

const dir = new URL("../src/data/leak-targets/", import.meta.url)
let bad = 0
for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
  const t = JSON.parse(readFileSync(new URL(f, dir), "utf8"))
  const m = new Memory({ targetId: t.id })
  for (const seed of t.seeds || []) m.addScript(seed, { origin: "seed", silent: true, keepTrivial: true })
  console.log(`${t.id}: ${m.size} seed entr${m.size === 1 ? "y" : "ies"}`)
  for (const e of m.entries.values()) {
    const text = await verify(e.closure)
    const ok = /100% verified|Compilation Successful/.test(text) && !/Compilation Failed|❌/.test(text) && !/\bsorry\b/.test(e.closure)
    if (!ok) bad++
    console.log(`  ${ok ? "ok  " : "FAIL"} ${e.name}${ok ? "" : "\n       " + text.replace(/\s+/g, " ").slice(0, 300)}`)
  }
}
process.exit(bad ? 1 : 0)
