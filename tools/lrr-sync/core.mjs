// Leak run records (LRR): the pure part. Turns a bridge transcript (~/.leak-runs/<UTC>-<slug>.jsonl, its sidecars and its index row) into
// the record this repo's README promises, in the shapes competemath/LRR already uses (runs/<run>/{METRICS.md, metrics.json, *.lean, logs/}),
// scrubbed of secrets. Nothing here touches the network, git, or the disk outside what a caller hands it, so tests can drive all of it.

import { createHash } from "node:crypto"

export const RUN_SCHEMA = "leak-run/1"
export const INDEX_SCHEMA = "leak-run-index/1"
export const MEMORY_SCHEMA = "leak-run-memory/1"
export const STALE_MS = 2 * 3600 * 1000 // a transcript with no end line that has not changed for this long is an interrupted run
export const GZIP_OVER = 25 * 1024 * 1024 // a transcript larger than this is stored gzipped (GitHub warns at 50 MB, refuses at 100 MB)

const MEMORY_VARIANT = /^control-(honoured|flint|paragon|lucid)(-iv)?$/

// ---- scrubbing --------------------------------------------------------------------------------------------------------------------
// Replaced in place with [REDACTED:kind], so a JSON line stays a JSON line. The patterns are the shapes of real credentials; a transcript
// is the agent's own words and tool output, and a shell command or an error can quote an environment variable.
const SCRUBBERS = [
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["github-token", /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g],
  ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{16,}/g],
  ["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g],
  ["aws-key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["slack-token", /\bxox[abeoprs]-[A-Za-z0-9-]{10,}/g],
  ["private-key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g],
  ["private-key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[A-Za-z0-9+/=\\n ]{20,}/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["bearer", /\b(Bearer|Basic) [A-Za-z0-9._~+/=-]{16,}/g, "$1 [REDACTED:bearer]"],
  ["auth-header", /\b(Authorization|X-Api-Key|Api-Key)(\\?["']?\s*[:=]\s*\\?["']?)(?!\[REDACTED)[^\s"',;\\]{8,}/gi, "$1$2[REDACTED:auth-header]"],
  [
    "secret-assignment",
    /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIAL)[A-Z0-9_]*)(\\?["']?\s*[=:]\s*\\?["']?)(?!\[REDACTED)[^\s"',;\\]{8,}/g,
    "$1$2[REDACTED:secret-assignment]",
  ],
  ["url-credentials", /\b([a-z][a-z0-9+.-]*:\/\/)(?!\[REDACTED)[^\s/@"'\\]+:[^\s/@"'\\]+@/gi, "$1[REDACTED:url-credentials]@"],
]

export function scrubText(text) {
  let out = String(text)
  const hits = {}
  for (const [kind, re, rep] of SCRUBBERS) {
    out = out.replace(re, (...m) => {
      hits[kind] = (hits[kind] || 0) + 1
      return rep ? rep.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? "") : `[REDACTED:${kind}]`
    })
  }
  return { text: out, hits }
}

// A scrubbed text must not match any pattern again. CI seeds fake credentials and fails if one survives; the sync refuses to write a
// file that fails this.
export function residualSecrets(text) {
  const found = []
  for (const [kind, re] of SCRUBBERS) {
    re.lastIndex = 0
    for (const m of String(text).matchAll(re)) if (!String(m[0]).includes("[REDACTED")) found.push(kind)
  }
  return found
}

export const sha256 = (s) => createHash("sha256").update(s).digest("hex")

// ---- reading a transcript ------------------------------------------------------------------------------------------------------------
export function parseTranscript(text) {
  const lines = String(text).split("\n").filter((l) => l.trim())
  let start = null
  let end = null
  const events = []
  for (const l of lines) {
    let o
    try {
      o = JSON.parse(l)
    } catch {
      continue
    }
    if (o?.kind === "start") start = start || o
    else if (o?.kind === "end") end = o
    else if (o?.kind === "event") events.push(o)
  }
  return { start, end, events, lines: lines.length, firstLine: lines[0] || "" }
}

const slugOf = (theorem) => {
  const m = String(theorem || "").match(/theorem\s+([A-Za-z0-9_'.]+)/)
  return (m ? m[1] : "run").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) || "run"
}

// "(sorry : Prop) ↔ P": which literal filled the slot in the proof, if the statement has one
export function answerOf(theorem, proof) {
  if (!theorem || !proof) return null
  const i = theorem.indexOf("(sorry : Prop)")
  if (i < 0) return null
  const head = theorem.slice(0, i).replace(/\s+/g, " ").trim()
  const norm = proof.replace(/\s+/g, " ")
  const j = norm.lastIndexOf(head)
  if (j < 0) return null
  const m = /^\s*\(?\s*(True|False)\b/.exec(norm.slice(j + head.length))
  return m ? m[1] : null
}

const toolCallInfo = (text) => {
  const m = /^TOOL_CALL → ([^\n]+)\n([\s\S]*)$/.exec(text)
  if (!m) return null
  let input = null
  try {
    input = JSON.parse(m[2])
  } catch {}
  return { tool: m[1].trim(), input }
}

// The last script Leak IV accepted, for a proved run that left no sidecar: the verify call whose answer was a success.
export function lastVerifiedScript(events) {
  const pending = []
  let last = null
  for (const e of events) {
    const text = String(e.text || "")
    if (text.startsWith("TOOL_CALL")) {
      const c = toolCallInfo(text)
      if (c) pending.push(c)
    } else if (text.startsWith("TOOL_RESULT") || text.startsWith("TOOL_ERROR")) {
      const c = pending.shift()
      if (c && /verify_full_script$/.test(c.tool) && typeof c.input?.script === "string" && text.startsWith("TOOL_RESULT") && /Compilation Successful/.test(text) && !/\bsorry\b/.test(c.input.script))
        last = c.input.script
    }
  }
  return last
}

// The older architect strategies assemble the proof server-side and only bank it (~/.leak-proof-bank.json): the entry for this theorem
// verified while the run was going is that run's proof. Matched by theorem name and time, never by guesswork beyond that.
export function bankedProof(bank, name, startedAt, finishedAt) {
  const from = Date.parse(startedAt) - 60_000
  const to = (finishedAt ? Date.parse(finishedAt) : Date.parse(startedAt)) + 120_000
  let best = null
  for (const e of Array.isArray(bank) ? bank : []) {
    if (!e || e.name !== name || typeof e.proof !== "string" || /\bsorry\b/.test(e.proof)) continue
    const at = Date.parse(e.verifiedAt)
    if (Number.isFinite(at) && at >= from && at <= to && (!best || at > best.at)) best = { at, proof: e.proof }
  }
  return best ? best.proof : null
}

// A memory run's library, for a transcript that left no memory sidecar: what its "Saved to memory" / "Memory entry improved" events carried.
export function reconstructMemory(events, { variant = "", targetId = "" } = {}) {
  const byName = new Map()
  for (const e of events) {
    const m = /^SYSTEM — (Saved to memory|Memory entry improved): ([^\n]+)\n([\s\S]*)$/.exec(String(e.text || ""))
    if (!m) continue
    byName.set(m[2].trim(), { name: m[2].trim(), kind: "reconstructed", closure: m[3], origin: "events", savedAfterSeconds: e.t, improved: m[1] !== "Saved to memory" })
  }
  return { schema: MEMORY_SCHEMA, reconstructed: true, variant, target_id: targetId, entries: [...byName.values()] }
}

function attemptsOf(strategy, events, memoryRun) {
  if (memoryRun && Number.isFinite(memoryRun.attempts)) return memoryRun.attempts
  let max = 0
  for (const e of events) {
    const m = /\bAttempt (\d+) —/.exec(String(e.text || ""))
    if (m) max = Math.max(max, Number(m[1]))
  }
  if (max) return max
  return /^control-/.test(strategy) ? 1 : null
}

// ---- one run -> one item (the shape of an entry in LRR's metrics.json, plus what a Leak run also has) ----------------------------------
export function deriveItem({ id, text, indexRow = null, sidecars = {}, bank = [], mtimeMs = 0, nowMs = Date.now() }) {
  const t = parseTranscript(text)
  if (!t.start) return { skip: "no start line" }
  const { start, end, events } = t
  const summary = end || indexRow
  if (!summary && nowMs - mtimeMs < STALE_MS) return { skip: "still running" }
  const strategy = start.strategy || indexRow?.strategy || ""
  const model = start.model || indexRow?.model || ""
  const targetId = start.target_id || slugOf(start.theorem)
  const secondsFromEnd = Number.isFinite(summary?.seconds) ? summary.seconds : null
  const startedAt = start.at
  const finishedAt = end?.at || (secondsFromEnd !== null ? new Date(Date.parse(startedAt) + secondsFromEnd * 1000).toISOString() : null)
  const wallMs = secondsFromEnd !== null ? secondsFromEnd * 1000 : finishedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : null
  const reason = summary ? String(summary.reason || "") : "interrupted"
  const status = !summary ? "interrupted" : summary.ok ? "proved" : reason === "usage-limit" ? "not_attempted" : reason === "error" || reason === "startup" ? "error" : "unsolved"
  const endMetrics = end?.metrics && typeof end.metrics === "object" ? end.metrics : null
  const toolsDerived = events.filter((e) => String(e.text || "").startsWith("TOOL_CALL")).length
  const metrics = {
    tokens: endMetrics?.tokens ?? null,
    cost_usd: Number.isFinite(summary?.cost_usd) ? summary.cost_usd : endMetrics?.cost_usd ?? null,
    bridge_build: endMetrics?.bridge_build ?? start.bridge_build ?? null,
    time_elapsed: endMetrics?.time_elapsed ?? secondsFromEnd,
    tools_invoked: endMetrics?.tools_invoked ?? toolsDerived,
    lean_toolchain: endMetrics?.lean_toolchain ?? null,
    verifier_group: endMetrics?.verifier_group ?? null,
    llm_invocations: endMetrics?.llm_invocations ?? null,
    mathlib_version: endMetrics?.mathlib_version ?? null,
  }
  const memoryRun = end?.memory_run && typeof end.memory_run === "object" ? end.memory_run : null
  const isMemory = MEMORY_VARIANT.test(strategy)
  let proof = sidecars.proof || null
  let proofSource = proof ? "bridge" : null
  if (!proof && status === "proved") {
    proof = lastVerifiedScript(events)
    proofSource = proof ? "transcript" : null
    if (!proof) {
      proof = bankedProof(bank, slugOf(start.theorem), startedAt, finishedAt)
      proofSource = proof ? "proof-bank" : null
    }
  }
  let memory = sidecars.memory || null
  let memorySource = memory ? "bridge" : null
  if (!memory && isMemory) {
    const r = reconstructMemory(events, { variant: strategy, targetId })
    if (r.entries.length) {
      memory = r
      memorySource = "reconstructed"
    }
  }
  const answer = status === "proved" ? answerOf(start.theorem, proof) : null
  const item = {
    run_id: id,
    problem_id: slugOf(start.theorem),
    status,
    refuted: answer === "False",
    cost_usd: metrics.cost_usd,
    started_at: startedAt,
    finished_at: finishedAt,
    wall_ms: wallMs,
    attempts: attemptsOf(strategy, events, memoryRun),
    error_message: status === "error" ? reason : null,
    metrics,
    has_proof: !!proof,
    run_log: null, // set by the writer: the path of the stored transcript, or null when the transcript is already in another LRR folder
    strategy,
    model,
    target_id: targetId,
    variant: memoryRun?.variant || (isMemory ? strategy : null),
    session_mode: memoryRun?.session_mode || (isMemory ? "fresh_per_attempt" : null),
    reason,
    answer,
    memory_run: memoryRun ? { attempts: memoryRun.attempts ?? null, resumes: memoryRun.resumes ?? null, fresh_starts: memoryRun.fresh_starts ?? null, size: memoryRun.size ?? null, stats: memoryRun.stats ?? null, guards: memoryRun.guards ?? null } : null,
    metrics_source: endMetrics ? "bridge" : "derived",
    proof_source: proofSource,
    memory_source: memorySource,
    backfilled: !endMetrics,
    transcript: { lines: t.lines, events: events.length },
  }
  return { item, proof, memory, firstLine: t.firstLine }
}

// ---- formatting -------------------------------------------------------------------------------------------------------------------
export const money = (v) => (Number.isFinite(v) ? `$${v.toFixed(2)}` : "—")
export function wall(ms) {
  if (!Number.isFinite(ms)) return "—"
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${String(m).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s` : `${m}m ${String(s % 60).padStart(2, "0")}s`
}
const num = (v) => (Number.isFinite(v) ? String(v) : "—")
const median = (xs) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y)
  if (!a.length) return null
  const m = a.length >> 1
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}
const utc = (iso) => (iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—")
const uniq = (xs) => [...new Set(xs.filter(Boolean))]

// The month's master sheet: the same header block and per-run table as LRR's other METRICS.md, with strategy and session columns added.
export function monthMetricsMd({ account, month, items }) {
  const proved = items.filter((i) => i.status === "proved")
  const logs = items.filter((i) => i.run_log || i.also_in).length
  const models = uniq(items.map((i) => i.model))
  const groups = uniq(items.map((i) => i.metrics?.verifier_group))
  const chains = uniq(items.map((i) => i.metrics?.lean_toolchain))
  const strategies = uniq(items.map((i) => i.strategy))
  const rows = items.map((i, k) => {
    const log = i.run_log ? "✓" : i.also_in ? "↗" : "—"
    return `| ${k} | ${i.problem_id} | ${i.status === "proved" ? "✅ proved" : i.status} | ${money(i.cost_usd)} | ${wall(i.wall_ms)} | ${num(i.metrics?.tools_invoked)} | ${num(i.metrics?.llm_invocations)} | ${num(i.metrics?.tokens)} | ${log} | ${num(i.attempts)} | ${i.strategy || "—"} | ${i.session_mode || "—"} |`
  })
  return `# ${account} — Leak runs, ${month}

| Field | Value |
|---|---|
| Account | \`${account}\` |
| Month | ${month} |
| Strategies | ${strategies.map((s) => `\`${s}\``).join(", ") || "—"} |
| First run | ${utc(items[0]?.started_at)} |
| Last run | ${utc(items[items.length - 1]?.started_at)} |
| Driver / model | ${models.join(", ") || "—"} |
| Verifier group | ${groups.join(", ") || "—"} |
| Toolchain | ${chains.join(", ") || "—"} |
| Runs | ${items.length} |
| **Proved** | **${proved.length}** (${items.length ? ((100 * proved.length) / items.length).toFixed(1) : "0.0"}%) |
| Total cost | ${money(items.reduce((a, i) => a + (Number.isFinite(i.cost_usd) ? i.cost_usd : 0), 0))} |
| Total wall (sum) | ${wall(items.reduce((a, i) => a + (Number.isFinite(i.wall_ms) ? i.wall_ms : 0), 0))} |
| Median solve time (proved) | ${wall(median(proved.map((i) => i.wall_ms)))} |
| Raw transcripts | ${logs} / ${items.length} (✓ stored in [\`logs/\`](./logs/), ↗ already held in another LRR folder, named in \`metrics.json\` as \`also_in\`) |

> **Null is not zero.** Where a run did not record a number (tokens and LLM-call counts before the bridge began writing them, the toolchain of an old run), the cell shows — and \`metrics.json\` holds \`null\`. \`metrics_source\` says whether a run's numbers came from the bridge or were derived from its transcript.
> **Attempts** for a Control II memory run are the attempts the run made; for older runs they are read from the transcript.

## Per-run metrics
| # | problem | status | cost | wall | tools | llm | tokens | log | attempts | strategy | session |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}
`
}

export function monthMetricsJson({ account, month, items, model }) {
  return {
    run: { folder: `${account}/${month}`, account, month, schema: RUN_SCHEMA },
    note: "One item per Leak run, in start order. Fields follow the other LRR folders (seq, problem_id, status, refuted, cost_usd, started_at, finished_at, wall_ms, attempts, error_message, metrics, has_proof, run_log); strategy, model, target_id, variant, session_mode, reason, answer, memory_run, files, also_in and the *_source fields are added. null means the run did not record it.",
    items: items.map((it, seq) => ({ seq, ...it })),
  }
}

export function indexRow(item) {
  return {
    schema: INDEX_SCHEMA,
    run_id: item.run_id,
    month: item.started_at.slice(0, 7),
    started_at: item.started_at,
    finished_at: item.finished_at,
    problem_id: item.problem_id,
    target_id: item.target_id,
    strategy: item.strategy,
    model: item.model,
    variant: item.variant,
    session_mode: item.session_mode,
    status: item.status,
    reason: item.reason,
    answer: item.answer,
    cost_usd: item.cost_usd,
    wall_ms: item.wall_ms,
    attempts: item.attempts,
    tools_invoked: item.metrics?.tools_invoked ?? null,
    llm_invocations: item.metrics?.llm_invocations ?? null,
    tokens: item.metrics?.tokens ?? null,
    has_proof: item.has_proof,
    memory_size: item.memory_run?.size ?? null,
    backfilled: item.backfilled,
    path: item.run_log || item.also_in || null,
  }
}

export function readmeMd({ account, rows }) {
  const byMonth = new Map()
  for (const r of rows) {
    const m = byMonth.get(r.month) || { runs: 0, proved: 0, cost: 0, wall: 0 }
    m.runs++
    if (r.status === "proved") m.proved++
    m.cost += Number.isFinite(r.cost_usd) ? r.cost_usd : 0
    m.wall += Number.isFinite(r.wall_ms) ? r.wall_ms : 0
    byMonth.set(r.month, m)
  }
  const strategies = new Map()
  for (const r of rows) {
    const s = strategies.get(r.strategy || "—") || { runs: 0, proved: 0, cost: 0 }
    s.runs++
    if (r.status === "proved") s.proved++
    s.cost += Number.isFinite(r.cost_usd) ? r.cost_usd : 0
    strategies.set(r.strategy || "—", s)
  }
  const last = rows.length ? rows.map((r) => r.started_at).sort().at(-1) : null
  return `# ${account} — Leak runs

Every Leak run made from the \`${account}\` account, recorded automatically from the bridge's transcripts by \`tools/lrr-sync\` in competemath. Layout follows the other folders here.

- [\`index.jsonl\`](./index.jsonl): one line per run (\`${INDEX_SCHEMA}\`), for analysis over time. Load it with pandas, DuckDB or \`jq\`.
- \`<YYYY-MM>/METRICS.md\`, \`<YYYY-MM>/metrics.json\`: the month's master sheet and its machine-readable twin.
- \`<YYYY-MM>/logs/<run_id>.jsonl\` (or \`.jsonl.gz\` over 25 MB): the transcript, with credentials replaced by \`[REDACTED:…]\`.
- \`<YYYY-MM>/<run_id>.lean\`: the verified proof of a proved run. \`<YYYY-MM>/memory/<run_id>.json\`: a memory run's saved theorems (\`${MEMORY_SCHEMA}\`).
- Runs whose transcript is already in another LRR folder (the three FATE-X benchmark runs) are listed with \`also_in\` pointing at it, not copied again.

**Null is not zero.** A run records only what the bridge counted at the time; older runs have \`null\` for tokens and LLM calls. Last run recorded: ${last ? utc(last) : "—"}.

## By month
| Month | Runs | Proved | Cost | Wall |
|---|---|---|---|---|
${[...byMonth.entries()].sort().map(([m, v]) => `| [${m}](./${m}/METRICS.md) | ${v.runs} | ${v.proved} | ${money(v.cost)} | ${wall(v.wall)} |`).join("\n")}

## By strategy
| Strategy | Runs | Proved | Cost |
|---|---|---|---|
${[...strategies.entries()].sort((a, b) => b[1].runs - a[1].runs).map(([s, v]) => `| \`${s}\` | ${v.runs} | ${v.proved} | ${money(v.cost)} |`).join("\n")}
`
}

// The launchd job: every 15 minutes, and whenever the bridge appends to index.jsonl (a run has ended).
export function launchdPlist({ label, node, script, home, intervalSec = 900 }) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${esc(label)}</string>
  <key>ProgramArguments</key>
  <array><string>${esc(node)}</string><string>${esc(script)}</string><string>sync</string></array>
  <key>StartInterval</key><integer>${intervalSec}</integer>
  <key>WatchPaths</key><array><string>${esc(`${home}/.leak-runs/index.jsonl`)}</string></array>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${esc(`${home}/.leak-runs/.lrr-sync.log`)}</string>
  <key>StandardErrorPath</key><string>${esc(`${home}/.leak-runs/.lrr-sync.log`)}</string>
</dict>
</plist>
`
}

export { slugOf }
