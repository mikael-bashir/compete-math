#!/usr/bin/env node
// Rank the theorems Leak banked, one to five stars, and say why.
//   node tools/leak-rank/rank.mjs [--target erdos-396] [--runs ~/.leak-runs] [--out DIR]
//                                 [--probes] [--read] [--draws 2] [--limit N] [--no-report]
// Phases are independent and cached (one JSON line per answer in OUT), so a rerun pays for nothing twice:
//   --probes   asks Leak IV two questions per entry (does a one-line automatic tactic prove its statement; does one existing lemma)
//   --read     has a model read each entry (batches of 8, --draws independent readings with the batches reshuffled)
// The report (ranking.csv, ranking.md, ranking.html) is written from whatever has been collected; rules and reasons are in rank-core.mjs.
import { spawn } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { scrubbedEnv } from "../../public/leak-containment.mjs"
import { connect } from "../leak-vet/iv-client.mjs"
import { splitStatement } from "../leak-vet/vet-core.mjs"
import { loadEntries } from "./load.mjs"
import { CONTROLS, distribution, features, probeScripts, stars, summariseReading } from "./rank-core.mjs"
import { readingPrompt, parseReading } from "./reading.mjs"
import { reportCsv, reportHtml, reportMd } from "./report.mjs"

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
const here = dirname(fileURLToPath(import.meta.url))
const targetId = opt("--target", "erdos-396")
const runsDir = opt("--runs", join(homedir(), ".leak-runs"))
const outDir = opt("--out", join(runsDir, ".quality", targetId))
const IV = process.env.LEAK_IV_URL || "https://barkingtree-leak-iv.hf.space/sse"
const MODEL = process.env.LEAK_RANK_MODEL || "claude-sonnet-5-5"
const DRAWS = Number(opt("--draws", 2))
const BATCH = 8
mkdirSync(outDir, { recursive: true })

const target = JSON.parse(readFileSync(join(here, "../../src/data/leak-targets", `${targetId}.json`), "utf8"))
const targetProp = splitStatement(target.statement)?.prop || ""
let entries = loadEntries(runsDir, { targetId })
const limit = Number(opt("--limit", 0))
if (limit) entries = entries.slice(0, limit)
const feats = features(entries, targetProp)
const byId = new Map(entries.map((e, i) => [e.id, { e, f: feats[i] }]))
console.error(`${entries.length} distinct banked entries for ${targetId}`)

const readCache = (file) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- probes -------------------------------------------------------------------------------------------------------------------------
const probeFile = join(outDir, "probes.jsonl")
async function runProbes() {
  // an answer the verifier never gave is asked again on the next run
  const done = new Set(readCache(probeFile).filter((r) => !r.noAnswer).map((r) => `${r.id}|${r.kind}`))
  let iv = await connect(IV, { timeoutMs: 240000, quiet: true })
  const health = IV.replace(/\/sse$/, "/health")
  // Leak IV is shared: wait while it is busy with someone else's run, but not for ever
  const polite = async () => {
    for (let i = 0; i < 12; i++) {
      try {
        const h = await (await fetch(health, { signal: AbortSignal.timeout(8000) })).json()
        if (!h.busy) return
      } catch { /* an unreachable health endpoint is not a reason to stop */ }
      await sleep(5000)
    }
  }
  // a battery that cannot close a truth (or closes a falsehood) says nothing about any entry: stop before spending an hour on it
  for (const c of CONTROLS) {
    const o = await iv.verify(c.script, `control: ${c.name}`)
    if (Boolean(o.ok) !== c.expect) {
      console.error(`CONTROL FAILED: ${c.name} (got ${o.ok}). ${(o.text || "").slice(0, 300)}`)
      process.exit(1)
    }
  }
  let n = 0
  for (const { e, f } of entries.map((e, i) => ({ e, f: feats[i] }))) {
    if (f.duplicateOf) continue
    const scripts = probeScripts(e.entry)
    if (!scripts) continue
    for (const kind of ["cheap", "library"]) {
      if (done.has(`${e.id}|${kind}`)) continue
      await polite()
      let o = await iv.verify(scripts[kind], `${e.entry.name}/${kind}`)
      if (o.noAnswer && iv.isDead()) {
        // the long-lived connection dropped: open a new one and ask again once
        iv = await connect(IV, { timeoutMs: 240000, quiet: true })
        o = await iv.verify(scripts[kind], `${e.entry.name}/${kind}`)
      }
      appendFileSync(probeFile, JSON.stringify({ id: e.id, kind, ok: Boolean(o.ok), noAnswer: Boolean(o.noAnswer), error: (o.errors || [])[0] || "" }) + "\n")
      if (++n % 25 === 0) console.error(`  probes: ${n} answers this run`)
      await sleep(300)
    }
  }
  console.error(`probes done (${n} new)`)
}

// ---- reading ------------------------------------------------------------------------------------------------------------------------
const readFile = join(outDir, "reading.jsonl")
const run = (cmd, args, opts) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, opts)
    let stdout = ""
    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", () => {})
    const timer = setTimeout(() => child.kill("SIGKILL"), 600000)
    child.on("close", (status) => {
      clearTimeout(timer)
      resolve({ status, stdout })
    })
  })

async function readBatch(batch, draw) {
  const prompt = readingPrompt(batch.map((b) => ({ id: b.e.id, entry: b.e.entry, features: b.f })), { target: target.statement, informal: target.informal })
  const cwd = mkdtempSync(join(tmpdir(), "leak-rank-"))
  try {
    // the CLI signs in through the keychain and needs the ordinary environment; secret-looking variables are dropped as for every agent
    const env = { ...scrubbedEnv(process.env, "sandbox"), CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" }
    const r = await run("claude", ["-p", prompt, "--model", MODEL, "--tools", "", "--strict-mcp-config", "--settings", JSON.stringify({ autoMemoryEnabled: false }), "--output-format", "json", "--max-turns", "3"], { cwd, env, stdio: ["ignore", "pipe", "pipe"] })
    let text = ""
    let cost = 0
    try {
      const j = JSON.parse(r.stdout)
      text = j.result || ""
      cost = j.total_cost_usd || 0
    } catch { /* an unreadable answer is retried by the next run */ }
    const got = parseReading(text)
    for (const g of got) {
      if (!byId.has(g.id)) continue
      appendFileSync(readFile, JSON.stringify({ ...g, draw }) + "\n")
    }
    return { cost, got: got.length, asked: batch.length }
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

async function runReading() {
  let cost = 0
  for (let draw = 0; draw < DRAWS; draw++) {
    const have = new Set(readCache(readFile).filter((r) => r.draw === draw).map((r) => r.id))
    let todo = [...byId.values()].filter(({ e, f }) => !have.has(e.id) && !f.duplicateOf)
    // each draw sees the entries in a different order and grouping, so the draws are not the same reading twice
    if (draw % 2 === 1) todo = todo.reverse()
    const batches = []
    for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH))
    let next = 0
    const worker = async () => {
      while (next < batches.length) {
        const b = batches[next++]
        const r = await readBatch(b, draw)
        cost += r.cost
        console.error(`  draw ${draw + 1}: batch ${next}/${batches.length}, ${r.got}/${r.asked} read, $${cost.toFixed(2)} so far`)
      }
    }
    await Promise.all([worker(), worker(), worker()])
  }
  console.error(`reading done, $${cost.toFixed(2)} this run`)
}

// ---- report -------------------------------------------------------------------------------------------------------------------------
function report() {
  const probes = new Map()
  for (const r of readCache(probeFile)) {
    if (!probes.has(r.id)) probes.set(r.id, {})
    probes.get(r.id)[r.kind] = r.noAnswer ? null : r.ok
  }
  const reads = new Map()
  for (const r of readCache(readFile)) {
    if (!reads.has(r.id)) reads.set(r.id, [])
    reads.get(r.id).push(r)
  }
  const rows = entries.map((e, i) => {
    const f = feats[i]
    const p = probes.get(e.id)
    const probe = p && p.cheap !== undefined && p.library !== undefined ? { cheap: p.cheap === true, library: p.library === true } : p ? { cheap: p.cheap === true, library: p.library === true } : null
    const reading = summariseReading(reads.get(e.id))
    const s = stars(f, probe, reading)
    return { id: e.id, name: e.entry.name, statement: e.entry.statement, features: f, probes: probe, reading, stars: s.stars, reasons: s.reasons, spread: s.spread ?? null, runs: e.runs.map((r) => r.run) }
  })
  writeFileSync(join(outDir, "ranking.csv"), reportCsv(rows))
  writeFileSync(join(outDir, "ranking.md"), reportMd(rows, { target: targetId, distribution: distribution(rows) }))
  writeFileSync(join(outDir, "ranking.html"), reportHtml(rows, { target: targetId, title: target.title }))
  console.error(`report written to ${outDir}`)
  console.error(JSON.stringify(distribution(rows)))
}

if (flag("--probes")) await runProbes()
if (flag("--read")) await runReading()
if (!flag("--no-report")) report()
process.exit(0)
