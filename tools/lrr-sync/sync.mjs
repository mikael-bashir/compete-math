#!/usr/bin/env node
// lrr-sync: copies the Leak runs a bridge recorded under ~/.leak-runs into competemath/LRR as runs/<account>/, in LRR's own shapes.
//
//   node tools/lrr-sync/sync.mjs sync [--dry-run] [--no-push]    record every finished run not recorded yet (the first call is the backfill)
//   node tools/lrr-sync/sync.mjs status                          what is recorded, what is pending
//   node tools/lrr-sync/sync.mjs plist                           the launchd job (see install.sh)
//
// Config: ~/.leak-runs/.lrr-sync.json (account, remote, branch, sshKey), overridable by flags. It runs git over SSH with a deploy key that
// reaches this one repository; no token is read, stored or printed. Append-only: it writes only under runs/<account>/ and refuses to commit
// anything else. Safe to run twice at once (lock), to kill at any point (nothing is marked done until the push succeeds), and to repeat
// (the output is deterministic, so a second run changes nothing).

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { GZIP_OVER, deriveItem, indexRow, launchdPlist, monthMetricsJson, monthMetricsMd, readmeMd, residualSecrets, scrubText, sha256 } from "./core.mjs"

const run = promisify(execFile)
const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,38}$/
const MONTH = /^\d{4}-\d{2}$/

export function loadConfig(argv = [], env = process.env) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    const k = a.slice(2)
    if (["dry-run", "no-push", "quiet"].includes(k)) flags[k] = true
    else flags[k] = argv[++i]
  }
  const source = path.resolve(flags.source || env.LRR_SOURCE || path.join(os.homedir(), ".leak-runs"))
  let file = {}
  try {
    file = JSON.parse(fs.readFileSync(path.join(source, ".lrr-sync.json"), "utf8"))
  } catch {}
  return {
    account: flags.account || file.account || "",
    remote: flags.remote || file.remote || "git@github.com:competemath/LRR.git",
    branch: flags.branch || file.branch || "main",
    sshKey: flags.key || file.sshKey || "",
    source,
    clone: path.resolve(flags.clone || file.clone || path.join(source, ".lrr")),
    authorName: file.authorName || "lrr-sync",
    authorEmail: file.authorEmail || "lrr-sync@users.noreply.github.com",
    dryRun: !!flags["dry-run"],
    push: !flags["no-push"],
    quiet: !!flags.quiet,
    maxBytesPerCommit: Number(flags["max-bytes"] || file.maxBytesPerCommit || 8_000_000),
    bankPath: path.resolve(flags.bank || env.LEAK_PROOF_BANK || file.proofBank || path.join(os.homedir(), ".leak-proof-bank.json")),
    command: argv.find((a) => !a.startsWith("--") && ["sync", "status", "plist"].includes(a)) || "sync",
  }
}

const gitEnv = (cfg) => ({
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "echo", // never prompt; a missing credential is an error, not a question
  ...(cfg.sshKey ? { GIT_SSH_COMMAND: `ssh -i ${JSON.stringify(cfg.sshKey)} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new` } : {}),
})
async function git(cfg, args, opts = {}) {
  const { stdout } = await run("git", ["-c", "core.autocrlf=false", "-c", "gc.auto=0", "-c", `user.name=${cfg.authorName}`, "-c", `user.email=${cfg.authorEmail}`, ...args], {
    cwd: opts.cwd || cfg.clone,
    env: gitEnv(cfg),
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout
}

// ---- state and lock -------------------------------------------------------------------------------------------------------------------
const statePath = (cfg) => path.join(cfg.source, ".lrr-state.json")
function readState(cfg) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(cfg), "utf8"))
    if (s && s.account === cfg.account && s.runs) return s
  } catch {}
  return { account: cfg.account, runs: {} }
}
function writeState(cfg, state) {
  const tmp = `${statePath(cfg)}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state))
  fs.renameSync(tmp, statePath(cfg))
}
function takeLock(cfg) {
  const lock = path.join(cfg.source, ".lrr-sync.lock")
  for (let i = 0; i < 2; i++) {
    try {
      fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: "wx" })
      return () => {
        try {
          fs.rmSync(lock)
        } catch {}
      }
    } catch {
      let held = null
      try {
        held = JSON.parse(fs.readFileSync(lock, "utf8"))
      } catch {}
      let alive = false
      if (held?.pid) {
        try {
          process.kill(held.pid, 0)
          alive = true
        } catch {}
      }
      if (alive && Date.now() - (held.at || 0) < 3 * 3600 * 1000) return null
      try {
        fs.rmSync(lock)
      } catch {}
    }
  }
  return null
}

// ---- reading the source ------------------------------------------------------------------------------------------------------------
export function listRuns(cfg) {
  const index = new Map()
  try {
    for (const l of fs.readFileSync(path.join(cfg.source, "index.jsonl"), "utf8").split("\n")) {
      if (!l.trim()) continue
      try {
        const r = JSON.parse(l)
        if (r?.file) index.set(r.file, r)
      } catch {}
    }
  } catch {}
  const out = []
  for (const name of fs.readdirSync(cfg.source)) {
    if (!name.endsWith(".jsonl") || name === "index.jsonl" || name.startsWith(".")) continue
    const full = path.join(cfg.source, name)
    let st
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    const id = name.slice(0, -".jsonl".length)
    if (!/^\d{4}-\d{2}-\d{2}T[0-9-]+Z-[A-Za-z0-9_.-]+$/.test(id)) continue
    const sidecar = (ext) => {
      const f = path.join(cfg.source, `${id}${ext}`)
      try {
        const s = fs.statSync(f)
        return { f, fp: `${s.size}:${s.mtimeMs}` }
      } catch {
        return null
      }
    }
    const lean = sidecar(".lean")
    const mem = sidecar(".memory.json")
    out.push({ id, full, st, indexRow: index.get(name) || null, lean, mem, fp: `${st.size}:${st.mtimeMs}|${lean?.fp || ""}|${mem?.fp || ""}` })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

// transcripts LRR already holds in other folders (the benchmark runs), by their first line
function existingTranscripts(cfg) {
  const map = new Map()
  const runs = path.join(cfg.clone, "runs")
  let dirs = []
  try {
    dirs = fs.readdirSync(runs)
  } catch {}
  for (const d of dirs) {
    if (d === cfg.account) continue
    const logs = path.join(runs, d, "logs")
    let files = []
    try {
      files = fs.readdirSync(logs)
    } catch {
      continue
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue
      try {
        const fd = fs.openSync(path.join(logs, f), "r")
        const buf = Buffer.alloc(65536)
        const n = fs.readSync(fd, buf, 0, buf.length, 0)
        fs.closeSync(fd)
        const text = buf.subarray(0, n).toString("utf8")
        const first = text.slice(0, text.indexOf("\n") < 0 ? undefined : text.indexOf("\n"))
        if (first) map.set(sha256(first), `runs/${d}/logs/${f}`)
      } catch {}
    }
  }
  return map
}

// ---- building the tree ----------------------------------------------------------------------------------------------------------------
const accountDir = (cfg) => path.join(cfg.clone, "runs", cfg.account)
function writeFile(abs, data) {
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  if (fs.existsSync(abs) && Buffer.compare(fs.readFileSync(abs), Buffer.isBuffer(data) ? data : Buffer.from(data)) === 0) return // same bytes: no touch
  fs.writeFileSync(abs, data)
}

function readIndex(cfg) {
  try {
    return fs.readFileSync(path.join(accountDir(cfg), "index.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  } catch {
    return []
  }
}
function readMonthItems(cfg, month) {
  try {
    return JSON.parse(fs.readFileSync(path.join(accountDir(cfg), month, "metrics.json"), "utf8")).items.map(({ seq, ...it }) => it)
  } catch {
    return []
  }
}

// Turn one source run into files under the account folder; returns {item, bytes, scrubbed} or {skip|error}
function buildRun(cfg, r, pointers, nowMs, notes) {
  let text
  try {
    text = fs.readFileSync(r.full, "utf8")
  } catch (e) {
    return { error: `unreadable: ${e.message}` }
  }
  const read = (s) => {
    try {
      return s ? fs.readFileSync(s.f, "utf8") : null
    } catch {
      return null
    }
  }
  let memory = null
  try {
    const m = read(r.mem)
    memory = m ? JSON.parse(m) : null
  } catch {}
  const d = deriveItem({ id: r.id, text, indexRow: r.indexRow, sidecars: { proof: read(r.lean), memory }, bank: cfg.bank || [], mtimeMs: r.st.mtimeMs, nowMs })
  if (d.skip) return { skip: d.skip }
  const month = d.item.started_at.slice(0, 7)
  if (!MONTH.test(month)) return { error: `bad start time ${d.item.started_at}` }
  const hits = {}
  const scrub = (s) => {
    const x = scrubText(s)
    for (const [k, n] of Object.entries(x.hits)) hits[k] = (hits[k] || 0) + n
    const bad = residualSecrets(x.text)
    if (bad.length) throw new Error(`a credential pattern survived scrubbing (${[...new Set(bad)].join(", ")}) in ${r.id}`)
    return x.text
  }
  let bytes = 0
  const writes = [] // pushed to notes only when the whole run built: a run that fails half way leaves no files behind
  const files = { log: null, proof: null, memory: null }
  try {
    const pointer = pointers.get(sha256(d.firstLine))
    if (pointer) d.item.also_in = pointer
    else {
      const body = scrub(text)
      const raw = Buffer.from(body)
      const gz = raw.length > GZIP_OVER
      const rel = `${month}/logs/${r.id}.jsonl${gz ? ".gz" : ""}`
      const data = gz ? zlib.gzipSync(raw, { level: 9 }) : raw
      if (data.length > 90 * 1024 * 1024) return { error: `${r.id}: transcript is ${data.length} bytes even gzipped; GitHub would refuse it` }
      writes.push([rel, data])
      bytes += data.length
      files.log = rel
      d.item.run_log = rel
      d.item.log_sha256 = sha256(body)
    }
    if (d.proof) {
      const rel = `${month}/${r.id}.lean`
      const body = scrub(d.proof.endsWith("\n") ? d.proof : `${d.proof}\n`)
      writes.push([rel, body])
      bytes += body.length
      files.proof = rel
    }
    if (d.memory) {
      const rel = `${month}/memory/${r.id}.json`
      const body = scrub(JSON.stringify(d.memory, null, 1) + "\n")
      writes.push([rel, body])
      bytes += body.length
      files.memory = rel
    }
  } catch (e) {
    return { error: String(e.message || e) }
  }
  d.item.files = files
  notes.writes.push(...writes)
  for (const [k, n] of Object.entries(hits)) notes.scrubbed[k] = (notes.scrubbed[k] || 0) + n
  return { item: d.item, month, bytes, fp: r.fp }
}

// write the month sheets, the index and the README for the months touched
function writeAggregates(cfg, built, nowMs) {
  const byMonth = new Map()
  for (const b of built) byMonth.set(b.month, [...(byMonth.get(b.month) || []), b.item])
  const dir = accountDir(cfg)
  for (const [month, fresh] of byMonth) {
    const have = new Map(readMonthItems(cfg, month).map((it) => [it.run_id, it]))
    for (const it of fresh) have.set(it.run_id, it)
    const items = [...have.values()].sort((a, b) => a.started_at.localeCompare(b.started_at) || a.run_id.localeCompare(b.run_id))
    writeFile(path.join(dir, month, "metrics.json"), JSON.stringify(monthMetricsJson({ account: cfg.account, month, items }), null, 1) + "\n")
    writeFile(path.join(dir, month, "METRICS.md"), monthMetricsMd({ account: cfg.account, month, items: items.map((it, i) => ({ ...it, seq: i })) }))
  }
  const rows = new Map(readIndex(cfg).map((r) => [r.run_id, r]))
  for (const b of built) rows.set(b.item.run_id, indexRow(b.item))
  const sorted = [...rows.values()].sort((a, b) => a.started_at.localeCompare(b.started_at) || a.run_id.localeCompare(b.run_id))
  writeFile(path.join(dir, "index.jsonl"), sorted.map((r) => JSON.stringify(r)).join("\n") + "\n")
  writeFile(path.join(dir, "README.md"), readmeMd({ account: cfg.account, rows: sorted }))
  return sorted.length
}

async function assertConfined(cfg) {
  const status = await git(cfg, ["status", "--porcelain", "-z"])
  const bad = status.split("\0").filter(Boolean).map((l) => l.slice(3)).filter((p) => !p.startsWith(`runs/${cfg.account}/`))
  if (bad.length) throw new Error(`refusing to commit outside runs/${cfg.account}/: ${bad.slice(0, 5).join(", ")}`)
}

async function freshClone(cfg) {
  if (!fs.existsSync(path.join(cfg.clone, ".git"))) {
    fs.mkdirSync(path.dirname(cfg.clone), { recursive: true })
    await git(cfg, ["clone", "--quiet", "--depth", "1", "--branch", cfg.branch, cfg.remote, cfg.clone], { cwd: path.dirname(cfg.clone) })
  } else {
    await git(cfg, ["fetch", "--quiet", "--depth", "1", "origin", cfg.branch])
    await git(cfg, ["reset", "--quiet", "--hard", `origin/${cfg.branch}`])
    await git(cfg, ["clean", "-fdq"])
  }
}

// ---- the sync --------------------------------------------------------------------------------------------------------------------
export async function runSync(cfg, { log = () => {}, nowMs = Date.now() } = {}) {
  if (!ACCOUNT.test(cfg.account)) throw new Error("account is not set (or not a plain name): put it in ~/.leak-runs/.lrr-sync.json or pass --account")
  const release = takeLock(cfg)
  if (!release) {
    log("another sync is running; nothing to do")
    return { ok: true, skipped: "locked" }
  }
  try {
    if (!cfg.bank) {
      try {
        const e = JSON.parse(fs.readFileSync(cfg.bankPath, "utf8")).entries
        cfg.bank = Array.isArray(e) ? e : Object.values(e || {})
      } catch {
        cfg.bank = []
      }
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      await freshClone(cfg)
      const state = readState(cfg)
      const pending = listRuns(cfg).filter((r) => state.runs[r.id]?.fp !== r.fp)
      if (!pending.length) {
        log("nothing new")
        return { ok: true, recorded: 0 }
      }
      const pointers = existingTranscripts(cfg)
      const notes = { writes: [], scrubbed: {} }
      let batch = []
      let batchBytes = 0
      const done = []
      const skipped = { "still running": 0 }
      const errors = []
      let commits = 0
      const flush = async () => {
        if (!batch.length) return
        for (const [rel, data] of notes.writes) writeFile(path.join(accountDir(cfg), rel), data)
        writeAggregates(cfg, batch, nowMs)
        await assertConfined(cfg)
        await git(cfg, ["add", "--all", "--", `runs/${cfg.account}`])
        const changed = (await git(cfg, ["status", "--porcelain"])).trim()
        if (changed) {
          const ids = batch.map((b) => b.item.run_id)
          await git(cfg, ["commit", "--quiet", "-m", `leak runs: +${batch.length} (${cfg.account})\n\n${ids.slice(0, 40).join("\n")}${ids.length > 40 ? `\n… and ${ids.length - 40} more` : ""}`])
          commits++
        }
        done.push(...batch)
        notes.writes = []
        batch = []
        batchBytes = 0
      }
      for (const r of pending) {
        const b = buildRun(cfg, r, pointers, nowMs, notes)
        if (b.skip) {
          skipped[b.skip] = (skipped[b.skip] || 0) + 1
          continue
        }
        if (b.error) {
          errors.push(`${r.id}: ${b.error}`)
          continue
        }
        batch.push(b)
        batchBytes += b.bytes
        if (batchBytes >= cfg.maxBytesPerCommit) await flush()
      }
      await flush()
      const summary = { recorded: done.length, commits, errors, skipped, scrubbed: notes.scrubbed }
      if (cfg.dryRun) {
        log(`dry run: would record ${done.length} run(s) in ${commits} commit(s); scrubbed ${JSON.stringify(notes.scrubbed)}; errors ${errors.length}`)
        return { ok: true, dryRun: true, ...summary }
      }
      if (cfg.push && commits) {
        try {
          await git(cfg, ["push", "--quiet", "origin", `HEAD:${cfg.branch}`])
        } catch (e) {
          log(`push failed (attempt ${attempt}): ${String(e.stderr || e.message).split("\n")[0]}`)
          if (attempt === 3) throw e
          await new Promise((r) => setTimeout(r, 1000 * attempt))
          continue // the remote moved or the network blinked: start again from its head; the output is deterministic
        }
      }
      if (cfg.push || !commits) {
        for (const b of done) state.runs[b.item.run_id] = { fp: b.fp, at: new Date(nowMs).toISOString() }
        // a run that the source still lists but that failed to build is retried next time (no state entry)
        writeState(cfg, state)
      }
      log(`recorded ${done.length} run(s) in ${commits} commit(s)${cfg.push ? " and pushed" : " (not pushed)"}; skipped ${JSON.stringify(skipped)}; scrubbed ${JSON.stringify(notes.scrubbed)}${errors.length ? `; ${errors.length} error(s): ${errors.slice(0, 3).join(" | ")}` : ""}`)
      return { ok: errors.length === 0, ...summary }
    }
  } finally {
    release()
  }
}

export function status(cfg) {
  const state = readState(cfg)
  const runs = listRuns(cfg)
  const pending = runs.filter((r) => state.runs[r.id]?.fp !== r.fp)
  return { account: cfg.account, onDisk: runs.length, recorded: runs.length - pending.length, pending: pending.length }
}

async function main() {
  const cfg = loadConfig(process.argv.slice(2))
  const log = (m) => {
    if (!cfg.quiet) console.log(`[lrr-sync ${new Date().toISOString()}] ${m}`)
  }
  if (cfg.command === "status") return console.log(JSON.stringify(status(cfg), null, 2))
  if (cfg.command === "plist")
    return process.stdout.write(launchdPlist({ label: "com.competemath.lrr-sync", node: process.execPath, script: fileURLToPath(import.meta.url), home: os.homedir() }))
  const r = await runSync(cfg, { log })
  if (!r.ok && !r.skipped) process.exitCode = 1
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(`[lrr-sync] failed: ${String(e.stderr || e.message || e).split("\n").slice(0, 3).join(" ")}`)
    process.exit(1)
  })
}
