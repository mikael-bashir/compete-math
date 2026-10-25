#!/usr/bin/env node
// Start, check and stop the Leak Lab tool servers.
//
//   node services/leak-lab/start.mjs elation    Leak Elation's tools: the CAS server           (http://127.0.0.1:8021/sse)
//   node services/leak-lab/start.mjs misery     Leak Misery's tools: the CAS server plus the Vampire / SMT / SAT server (…:8022/sse)
//   node services/leak-lab/start.mjs status     what is running, and whether each answers
//   node services/leak-lab/start.mjs stop       stop everything
//   add --dry-run to see the docker command without running it
//
// It builds the images (the first time: Misery compiles Vampire, which takes a while), starts the containers, then asks each server what tools
// it offers and checks, from docker's own answers, that the containment is what the compose file says. It prints the MCP URL of each server.
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))
export const COMPOSE = path.join(here, "docker-compose.yml")

export const SERVERS = {
  cas: { label: "Leak Lab CAS", port: Number(process.env.LAB_CAS_PORT) || 8021, minTools: 20, service: "cas", gate: "cas-gate", variants: ["elation", "misery"] },
  atp: { label: "Leak Lab ATP", port: Number(process.env.LAB_ATP_PORT) || 8022, minTools: 9, service: "atp", gate: "atp-gate", variants: ["misery"] },
}
export const urlOf = (key) => `http://127.0.0.1:${SERVERS[key].port}/sse`

// Ask an MCP server (SSE transport) for its tool names: initialize, then tools/list.
export async function listTools(sseUrl, timeoutMs = 20000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(sseUrl, { headers: { Accept: "text/event-stream" }, signal: ac.signal })
    if (!res.ok || !res.body) return { ok: false, error: `HTTP ${res.status}` }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ""
    let endpoint = null
    const waiters = new Map()
    ;(async () => {
      for (;;) {
        const { done, value } = await reader.read().catch(() => ({ done: true }))
        if (done) return
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n")
        let i
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const ev = /^event: (.*)$/m.exec(chunk)?.[1]
          const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("")
          if (ev === "endpoint") {
            // the server names where to POST; a reply that points anywhere but back at the server we asked is not followed
            const target = new URL(data, sseUrl)
            if (target.origin === new URL(sseUrl).origin) endpoint = target.href
          }
          else if (data) {
            try {
              const m = JSON.parse(data)
              waiters.get(m.id)?.(m)
            } catch { /* not a reply */ }
          }
        }
      }
    })()
    for (let k = 0; k < 200 && !endpoint; k++) await new Promise((r) => setTimeout(r, 50))
    if (!endpoint) return { ok: false, error: "no endpoint event" }
    const send = (id, method, params) => {
      const p = new Promise((r) => waiters.set(id, r))
      fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }).catch(() => {})
      return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("no reply")), timeoutMs))])
    }
    await send(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "leak-lab-start", version: "1" } })
    const list = await send(2, "tools/list", {})
    return { ok: true, tools: (list.result?.tools || []).map((t) => t.name) }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  } finally {
    clearTimeout(timer)
    ac.abort()
  }
}

const docker = (args, opts = {}) => spawnSync("docker", args, { encoding: "utf8", ...opts })
const compose = (profileArgs, args) => ["compose", "-f", COMPOSE, ...profileArgs, ...args]

// What docker says about a running container: it must be what the compose file asked for, or the tool refuses to call the lab contained.
export function containmentProblems(inspect, networkInternal) {
  const bad = []
  const h = inspect?.HostConfig || {}
  if (!h.ReadonlyRootfs) bad.push("the root filesystem is writable")
  if (!(h.CapDrop || []).includes("ALL")) bad.push("capabilities are not all dropped")
  if (!(h.SecurityOpt || []).some((s) => /no-new-privileges/.test(s))) bad.push("no-new-privileges is not set")
  if (!/^10001/.test(inspect?.Config?.User || "")) bad.push(`it runs as user '${inspect?.Config?.User || "root"}', not 10001`)
  if (networkInternal !== true) bad.push("its network can reach the outside (not internal)")
  if (h.Privileged) bad.push("it is privileged")
  if ((h.Binds || []).length) bad.push(`it mounts host paths (${h.Binds.join(", ")})`)
  return bad
}

function verifyContainment(project, service) {
  const id = docker(["ps", "-q", "--filter", `label=com.docker.compose.project=${project}`, "--filter", `label=com.docker.compose.service=${service}`]).stdout.trim().split("\n")[0]
  if (!id) return [`${service}: container not found`]
  const insp = JSON.parse(docker(["inspect", id]).stdout || "[]")[0]
  const netName = Object.keys(insp?.NetworkSettings?.Networks || {}).find((n) => n.endsWith("lab_internal"))
  const net = netName ? JSON.parse(docker(["network", "inspect", netName]).stdout || "[]")[0] : null
  const onlyInternal = Object.keys(insp?.NetworkSettings?.Networks || {}).length === 1
  return containmentProblems(insp, net?.Internal === true && onlyInternal).map((p) => `${service}: ${p}`)
}

async function report(keys, { waitMs = 90000 } = {}) {
  let failed = false
  for (const key of keys) {
    const s = SERVERS[key]
    const t0 = Date.now()
    let r = await listTools(urlOf(key))
    while (!r.ok && Date.now() - t0 < waitMs) {
      await new Promise((res) => setTimeout(res, 2000))
      r = await listTools(urlOf(key))
    }
    if (r.ok && r.tools.length >= s.minTools) console.log(`  ${s.label.padEnd(14)} ${urlOf(key).padEnd(30)} up, ${r.tools.length} tools`)
    else {
      failed = true
      console.log(`  ${s.label.padEnd(14)} ${urlOf(key).padEnd(30)} ${r.ok ? `only ${r.tools.length} tools (expected at least ${s.minTools})` : `NOT ANSWERING (${r.error})`}`)
    }
    if (r.ok) {
      const problems = verifyContainment("leak-lab", s.service)
      if (problems.length) {
        failed = true
        for (const p of problems) console.log(`  !! containment: ${p}`)
      }
    }
  }
  return !failed
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const dry = rest.includes("--dry-run")
  const run = (profileArgs, args) => {
    const full = compose(profileArgs, args)
    if (dry) {
      console.log(["docker", ...full].join(" "))
      return 0
    }
    return spawnSync("docker", full, { stdio: "inherit" }).status
  }
  if (!["elation", "misery", "status", "stop"].includes(cmd)) {
    console.log("usage: node services/leak-lab/start.mjs elation | misery | status | stop   [--dry-run]")
    process.exit(cmd ? 2 : 0)
  }
  if (!dry && docker(["compose", "version"]).status !== 0) {
    console.error("docker compose is not available. Install Docker Desktop (or docker + the compose plugin) and try again.")
    process.exit(1)
  }
  if (cmd === "stop") process.exit(run(["--profile", "misery"], ["down"]))
  if (cmd === "status") {
    const ok = await report(Object.keys(SERVERS), { waitMs: 0 })
    process.exit(ok ? 0 : 1)
  }
  const keys = Object.keys(SERVERS).filter((k) => SERVERS[k].variants.includes(cmd))
  console.log(`Starting the Leak Lab for Leak ${cmd === "elation" ? "Elation" : "Misery"}…${cmd === "misery" ? " (the first build compiles Vampire and takes several minutes)" : ""}`)
  const code = run(cmd === "misery" ? ["--profile", "misery"] : [], ["up", "-d", "--build", "--wait"])
  if (code !== 0) process.exit(code || 1)
  if (dry) process.exit(0)
  console.log("")
  const ok = await report(keys)
  console.log("")
  if (!ok) {
    console.log("Something is not as expected (above). Look at: docker compose -f services/leak-lab/docker-compose.yml logs")
    process.exit(1)
  }
  console.log("Contained: read-only filesystem, no capabilities, non-root, no outbound network (checked with docker inspect just now).")
  console.log("The bridge finds these servers by itself. Start it with:  node public/local-claude-bridge.mjs")
  console.log(`To point it elsewhere:  LEAK_LAB_CAS_URL=${urlOf("cas")}${keys.includes("atp") ? `  LEAK_LAB_ATP_URL=${urlOf("atp")}` : ""}`)
  console.log(`Then choose "Leak ${cmd === "elation" ? "Elation" : "Misery"}" as the strategy.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
