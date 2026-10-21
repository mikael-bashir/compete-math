#!/usr/bin/env node
// Vet every Leak target (or the ids named) against Leak IV before a run is paid for.
//   node tools/leak-vet/vet.mjs [target-id ...]            LEAK_IV_URL overrides https://barkingtree-leak-iv.hf.space/sse
// Exit status 1 if any check fails. Needs the network; it is not part of `pnpm test`.
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { CHEAP_TACTICS, asScript, judge, negation, outcome, splitStatement, takeEvents, withProof } from "./vet-core.mjs"

const URL_IV = process.env.LEAK_IV_URL || "https://barkingtree-leak-iv.hf.space/sse"
const CALL_TIMEOUT_MS = Number(process.env.LEAK_VET_TIMEOUT_MS) || 240000
const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, "../../src/data/leak-targets")

// a minimal MCP client over SSE (initialize, then tools/call)
async function connect(url) {
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
      const timer = setTimeout(() => reject(new Error(`${method} timed out after ${CALL_TIMEOUT_MS / 1000}s`)), CALL_TIMEOUT_MS)
      pending.set(myId, (m) => {
        clearTimeout(timer)
        resolve(m)
      })
      await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) })
    })
  await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "leak-vet", version: "1" } })
  await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) })
  return {
    verify: async (script, label = "") => {
      const t0 = Date.now()
      try {
        const m = await call("tools/call", { name: "verify_full_script", arguments: { script } })
        const o = outcome((m.result?.content || []).map((c) => c.text || "").join("\n"))
        process.stderr.write(`  . ${label} ${o.ok ? "closed" : "not closed"} (${Math.round((Date.now() - t0) / 1000)}s)\n`)
        return o
      } catch (e) {
        // a probe that never answered is not a proof: it counts as not closed, and the run says so
        process.stderr.write(`  . ${label} no answer: ${e.message}\n`)
        return { ok: false, failed: true, errors: [e.message], sorry: false, onlySorry: false, noAnswer: true }
      }
    },
  }
}

const ids = process.argv.slice(2)
const targets = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8"))).filter((t) => !ids.length || ids.includes(t.id))
if (!targets.length) {
  console.error("no target matches")
  process.exit(2)
}
const iv = await connect(URL_IV)
let failed = 0
for (const t of targets) {
  console.log(`\n== ${t.id}: ${t.title}`)
  const parts = splitStatement(t.statement)
  const probes = { cheap: {} }
  probes.compile = await iv.verify(asScript(t.statement), "compile")
  probes.control = {
    easyTrue: (await iv.verify(asScript("theorem vet_true : 2 + 2 = 4 := by\n  decide\n"), "control true")).ok,
    easyFalse: (await iv.verify(asScript("theorem vet_false : 2 + 2 = 5 := by\n  decide\n"), "control false")).ok,
  }
  if (parts) {
    for (const [form, make] of [["statement", withProof], ["negation", negation]]) {
      probes.cheap[form] = {}
      for (const tac of CHEAP_TACTICS) probes.cheap[form][tac] = await iv.verify(asScript(make(parts, tac)), `${form} by ${tac}`)
    }
  }
  probes.seeds = []
  for (const [i, s] of (t.seeds || []).entries()) probes.seeds.push(await iv.verify(asScript(s), `seed ${i + 1}`))
  for (const v of judge(t, probes)) {
    console.log(`${v.pass ? "ok  " : "FAIL"} ${v.name}${v.detail ? `  [${v.detail}]` : ""}`)
    if (!v.pass) failed++
  }
}
console.log(failed ? `\n${failed} check(s) failed` : "\nevery target passed")
process.exit(failed ? 1 : 0)
