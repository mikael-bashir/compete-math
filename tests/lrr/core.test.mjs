// node --test tests/lrr/core.test.mjs
//
// tools/lrr-sync/core.mjs: turning a bridge transcript into a Leak run record. No network, no git, no disk: every transcript below is text.
import test from "node:test"
import assert from "node:assert/strict"
import {
  GZIP_OVER,
  INDEX_SCHEMA,
  MEMORY_SCHEMA,
  STALE_MS,
  answerOf,
  bankedProof,
  deriveItem,
  indexRow,
  lastVerifiedScript,
  launchdPlist,
  monthMetricsJson,
  monthMetricsMd,
  parseTranscript,
  readmeMd,
  reconstructMemory,
  residualSecrets,
  scrubText,
  sha256,
  slugOf,
} from "../../tools/lrr-sync/core.mjs"

const NOW = Date.parse("2026-10-20T12:00:00Z")
const jl = (...objs) => objs.map((o) => (typeof o === "string" ? o : JSON.stringify(o))).join("\n") + "\n"
const ev = (t, text) => ({ kind: "event", t, text })
const THEOREM = "theorem foo_bar (n : ℕ) : n + 0 = n := by\n  sorry"
const PROOF = "import Mathlib\n\ntheorem foo_bar (n : ℕ) : n + 0 = n := by\n  simp\n"
const call = (tool, input) => ev(1, `TOOL_CALL → ${tool}\n${JSON.stringify(input)}`)
const result = (text) => ev(2, `TOOL_RESULT\n${text}`)

// ---- scrubbing ------------------------------------------------------------------------------------------------------------------------
// The credentials below are made up on the spot from pieces, so no secret scanner finds a literal in this file.
const fakes = {
  github: "gh" + "p_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8",
  githubPat: "github" + "_pat_" + "11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGH",
  anthropic: "sk-" + "ant-api03-" + "abcdefghijklmnopqrstuvwxyz0123456789",
  openai: "sk-" + "proj-" + "abcdefghijklmnopqrstuvwxyz0123456789ABCD",
  aws: "AK" + "IA" + "ABCDEFGHIJKLMNOP",
  slack: "xo" + "xb-" + "1234567890-abcdefghijkl",
  jwt: "eyJ" + "hbGciOiJIUzI1NiJ9" + "." + "eyJzdWIiOiIxMjM0NTY3ODkwIn0" + "." + "dBjftJeZ4CVPmB92K27uhbUJU1p1r",
  bearer: "Bearer " + "abcdefghijklmnopqrstuvwxyz0123456789",
  header: 'Authorization: "' + "abcdefgh12345678" + '"',
  assignment: "MY_API_TOKEN=" + "supersecretvalue123",
  urlCred: "https://user:" + "hunter2hunter2" + "@example.com/repo.git",
  pem: "-----BEGIN OPENSSH PRIVATE KEY-----\\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\\n-----END OPENSSH PRIVATE KEY-----",
}

test("scrubText: every kind of seeded credential is replaced, and none survives", () => {
  for (const [name, secret] of Object.entries(fakes)) {
    const line = JSON.stringify({ kind: "event", t: 1, text: `run it with ${secret} please` })
    const { text, hits } = scrubText(line)
    assert.ok(Object.keys(hits).length > 0, `${name}: nothing was found`)
    assert.ok(text.includes("[REDACTED"), `${name}: no marker`)
    assert.deepEqual(residualSecrets(text), [], `${name}: a pattern survived`)
    assert.doesNotMatch(text, /abcdefghijklmnopqrstuvwxyz0123456789|hunter2hunter2|supersecretvalue123|b3BlbnNzaC1rZXktdjE/, `${name}: the value is still there`)
    assert.doesNotThrow(() => JSON.parse(text), `${name}: the line is no longer JSON`)
  }
})

test("scrubText keeps the variable name, so a transcript still reads", () => {
  const { text } = scrubText("export MY_API_TOKEN=supersecretvalue123 && ls")
  assert.match(text, /MY_API_TOKEN=\[REDACTED:secret-assignment\]/)
})

test("scrubText leaves Lean source and ordinary prose alone", () => {
  const lean = `theorem t (token_count : ℕ) (h : token_count = 5) : token_count + 1 = 6 := by\n  omega -- password is a word here\n  have : sk_ant = 3 := rfl`
  const { text, hits } = scrubText(lean)
  assert.equal(text, lean)
  assert.deepEqual(hits, {})
})

test("scrubText is idempotent", () => {
  const once = scrubText(Object.values(fakes).join(" | ")).text
  const twice = scrubText(once)
  assert.equal(twice.text, once)
  assert.deepEqual(twice.hits, {})
})

test("residualSecrets reports a bare credential and ignores a redacted one", () => {
  assert.deepEqual(residualSecrets("fine [REDACTED:github-token]"), [])
  assert.ok(residualSecrets(fakes.github).includes("github-token"))
})

// ---- reading a transcript -------------------------------------------------------------------------------------------------------
test("parseTranscript: start, end and events; a torn line is skipped, not fatal", () => {
  const text = jl({ kind: "start", at: "2026-10-20T10:00:00.000Z", theorem: THEOREM }, ev(1, "TEXT — hi"), '{"kind":"event","t":2,"te', ev(3, "TEXT — there"), { kind: "end", at: "2026-10-20T10:01:00.000Z", ok: true })
  const t = parseTranscript(text)
  assert.equal(t.start.theorem, THEOREM)
  assert.equal(t.end.ok, true)
  assert.equal(t.events.length, 2)
  assert.equal(t.lines, 5)
  assert.match(t.firstLine, /"kind":"start"/)
})

test("slugOf names the theorem, and survives a statement it cannot read", () => {
  assert.equal(slugOf(THEOREM), "foo_bar")
  assert.equal(slugOf("open Nat in\ntheorem erdos_396 : P"), "erdos_396")
  assert.equal(slugOf("nothing here"), "run")
  assert.equal(slugOf(undefined), "run")
})

// ---- proofs and answers -----------------------------------------------------------------------------------------------------------
test("lastVerifiedScript: the last script Leak IV accepted, not one it rejected or one with sorry", () => {
  const ok1 = "theorem a : True := trivial"
  const ok2 = "theorem a : True := by\n  trivial"
  const events = [
    call("mcp__Leak_IV__verify_full_script", { script: ok1 }),
    result("Compilation Successful"),
    call("mcp__Leak_IV__verify_full_script", { script: "theorem a : False := by\n  sorry" }),
    result("Compilation Successful (declaration uses sorry)"),
    call("mcp__Leak_IV__verify_full_script", { script: ok2 }),
    result("Compilation Successful"),
    call("mcp__Leak_IV__verify_full_script", { script: "theorem a : 1 = 2 := by simp" }),
    result("Compilation Failed: unsolved goals"),
    call("Bash", { command: "ls" }),
    result("x"),
  ]
  assert.equal(lastVerifiedScript(events), ok2)
  assert.equal(lastVerifiedScript([]), null)
})

test("lastVerifiedScript pairs results with calls in order, even when a tool errors", () => {
  const good = "theorem a : True := trivial"
  const events = [call("Bash", { command: "x" }), ev(2, "TOOL_ERROR\nboom"), call("mcp__Leak_IV__verify_full_script", { script: good }), result("Compilation Successful")]
  assert.equal(lastVerifiedScript(events), good)
})

test("bankedProof: matched by theorem name and the run's time window, newest wins, sorry never", () => {
  const e = (name, at, proof) => ({ name, verifiedAt: at, proof })
  const bank = [
    e("foo_bar", "2026-10-20T09:00:00Z", "too early"),
    e("foo_bar", "2026-10-20T10:00:30Z", "first"),
    e("foo_bar", "2026-10-20T10:20:00Z", "second"),
    e("foo_bar", "2026-10-20T10:25:00Z", "has sorry in it"),
    e("other", "2026-10-20T10:10:00Z", "wrong name"),
    e("foo_bar", "2026-10-20T11:30:00Z", "too late"),
  ]
  assert.equal(bankedProof(bank, "foo_bar", "2026-10-20T10:00:00Z", "2026-10-20T10:30:00Z"), "second")
  assert.equal(bankedProof(bank, "foo_bar", "2026-10-21T10:00:00Z", "2026-10-21T10:30:00Z"), null)
  assert.equal(bankedProof(null, "foo_bar", "2026-10-20T10:00:00Z", null), null)
})

test("answerOf reads which literal filled the answer slot", () => {
  const stmt = "open Nat in\ntheorem erdos_396 : (sorry : Prop) ↔ ∀ k : ℕ, ∃ n : ℕ, k ≤ n := by\n  sorry"
  const mk = (lit) => `import Mathlib\nopen Nat in\ntheorem erdos_396 : (${lit} : Prop) ↔ ∀ k : ℕ, ∃ n : ℕ, k ≤ n := by\n  simp`
  assert.equal(answerOf(stmt, mk("True")), "True")
  assert.equal(answerOf(stmt, mk("False")), "False")
  assert.equal(answerOf(stmt, mk("Foo")), null)
  assert.equal(answerOf(THEOREM, PROOF), null, "no slot in the statement")
  assert.equal(answerOf(stmt, ""), null)
})

// ---- one run -> one item --------------------------------------------------------------------------------------------------------------
const START = { kind: "start", at: "2026-10-20T10:00:00.000Z", theorem: THEOREM, strategy: "control-1", model: "claude-sonnet-5", bridge_build: "abc123", target_id: "foo_bar" }

test("deriveItem: a run the new bridge wrote keeps every figure it recorded", () => {
  const end = {
    kind: "end",
    at: "2026-10-20T10:10:00.000Z",
    ok: true,
    reason: "verified",
    seconds: 600,
    cost_usd: 1.25,
    metrics: { tokens: { input: 10, output: 5 }, cost_usd: 1.25, bridge_build: "abc123", time_elapsed: 600, tools_invoked: 7, llm_invocations: 3, lean_toolchain: "v4.32.0", mathlib_version: "v4.32.0", verifier_group: "Leak IV" },
    target_id: "foo_bar",
  }
  const { item, proof, firstLine } = deriveItem({ id: "2026-10-20T10-00-00-000Z-foo_bar", text: jl(START, ev(1, "TEXT — x"), end), sidecars: { proof: PROOF }, nowMs: NOW })
  assert.equal(item.status, "proved")
  assert.equal(item.problem_id, "foo_bar")
  assert.equal(item.cost_usd, 1.25)
  assert.equal(item.wall_ms, 600_000)
  assert.equal(item.started_at, "2026-10-20T10:00:00.000Z")
  assert.equal(item.finished_at, "2026-10-20T10:10:00.000Z")
  assert.deepEqual(item.metrics.tokens, { input: 10, output: 5 })
  assert.equal(item.metrics.tools_invoked, 7)
  assert.equal(item.metrics.llm_invocations, 3)
  assert.equal(item.metrics_source, "bridge")
  assert.equal(item.backfilled, false)
  assert.equal(item.has_proof, true)
  assert.equal(item.proof_source, "bridge")
  assert.equal(proof, PROOF)
  assert.equal(item.attempts, 1, "plain control runs are one attempt")
  assert.equal(item.variant, null)
  assert.equal(firstLine, JSON.stringify(START))
})

test("deriveItem: an older run leaves nulls where the bridge recorded nothing, and says it was backfilled", () => {
  const row = { at: START.at, file: "x.jsonl", theorem: THEOREM, ok: false, reason: "unverified", seconds: 120, cost_usd: 0.4 }
  const { item } = deriveItem({ id: "2026-10-20T10-00-00-000Z-foo_bar", text: jl({ ...START, bridge_build: null, target_id: undefined }, call("Bash", { command: "ls" }), result("ok")), indexRow: row, nowMs: NOW })
  assert.equal(item.status, "unsolved")
  assert.equal(item.cost_usd, 0.4)
  assert.equal(item.wall_ms, 120_000)
  assert.equal(item.finished_at, "2026-10-20T10:02:00.000Z")
  assert.equal(item.metrics.tokens, null)
  assert.equal(item.metrics.llm_invocations, null)
  assert.equal(item.metrics.tools_invoked, 1, "counted from the transcript")
  assert.equal(item.metrics_source, "derived")
  assert.equal(item.backfilled, true)
  assert.equal(item.has_proof, false)
  assert.equal(item.proof_source, null)
  assert.equal(item.target_id, "foo_bar")
})

test("deriveItem: the status follows the reason", () => {
  const mk = (ok, reason) => deriveItem({ id: "2026-10-20T10-00-00-000Z-foo_bar", text: jl(START, { kind: "end", at: "2026-10-20T10:01:00.000Z", ok, reason, seconds: 60 }), nowMs: NOW }).item.status
  assert.equal(mk(true, "verified"), "proved")
  assert.equal(mk(false, "unverified"), "unsolved")
  assert.equal(mk(false, "usage-limit"), "not_attempted")
  assert.equal(mk(false, "error"), "error")
  assert.equal(mk(false, "startup"), "error")
})

test("deriveItem: a proved run with no sidecar gets its proof from the transcript, then from the proof bank, else null", () => {
  const withVerify = jl(START, call("mcp__Leak_IV__verify_full_script", { script: PROOF }), result("Compilation Successful"), { kind: "end", at: "2026-10-20T10:10:00.000Z", ok: true, reason: "verified", seconds: 600 })
  const a = deriveItem({ id: "2026-10-20T10-00-00-000Z-foo_bar", text: withVerify, nowMs: NOW })
  assert.equal(a.proof, PROOF)
  assert.equal(a.item.proof_source, "transcript")

  const bare = jl(START, ev(1, "TEXT — 🏁 Leak XIV certified"), { kind: "end", at: "2026-10-20T10:10:00.000Z", ok: true, reason: "verified", seconds: 600 })
  const bank = [{ name: "foo_bar", verifiedAt: "2026-10-20T10:09:00Z", proof: PROOF }]
  const b = deriveItem({ id: "2026-10-20T10-00-00-000Z-foo_bar", text: bare, bank, nowMs: NOW })
  assert.equal(b.proof, PROOF)
  assert.equal(b.item.proof_source, "proof-bank")

  const c = deriveItem({ id: "2026-10-20T10-00-00-000Z-foo_bar", text: bare, nowMs: NOW })
  assert.equal(c.proof, null)
  assert.equal(c.item.has_proof, false)
  assert.equal(c.item.status, "proved", "a missing proof does not change the outcome that was recorded")
})

test("deriveItem: a refuted answer slot is marked refuted", () => {
  const theorem = "open Nat in\ntheorem erdos_396 : (sorry : Prop) ↔ ∀ k : ℕ, ∃ n : ℕ, k ≤ n := by\n  sorry"
  const proof = "import Mathlib\nopen Nat in\ntheorem erdos_396 : (False : Prop) ↔ ∀ k : ℕ, ∃ n : ℕ, k ≤ n := by\n  simp\n"
  const text = jl({ ...START, theorem, target_id: "erdos-396" }, { kind: "end", at: "2026-10-20T10:10:00.000Z", ok: true, reason: "verified", seconds: 600 })
  const { item } = deriveItem({ id: "2026-10-20T10-00-00-000Z-erdos_396", text, sidecars: { proof }, nowMs: NOW })
  assert.equal(item.answer, "False")
  assert.equal(item.refuted, true)
})

test("deriveItem: a transcript with no end is skipped while it may still be running, and recorded as interrupted once it has been quiet", () => {
  const text = jl(START, ev(1, "TEXT — working"))
  assert.deepEqual(deriveItem({ id: "x", text, mtimeMs: NOW - 60_000, nowMs: NOW }), { skip: "still running" })
  const { item } = deriveItem({ id: "2026-10-20T10-00-00-000Z-foo_bar", text, mtimeMs: NOW - STALE_MS - 1, nowMs: NOW })
  assert.equal(item.status, "interrupted")
  assert.equal(item.reason, "interrupted")
  assert.equal(item.cost_usd, null)
  assert.equal(item.wall_ms, null)
  assert.equal(item.finished_at, null)
})

test("deriveItem: a file with no start line is skipped", () => {
  assert.deepEqual(deriveItem({ id: "x", text: jl(ev(1, "TEXT — orphan")), nowMs: NOW }), { skip: "no start line" })
  assert.deepEqual(deriveItem({ id: "x", text: "", nowMs: NOW }), { skip: "no start line" })
})

test("deriveItem: a memory run carries its variant, session mode, attempts and library", () => {
  const memory = { schema: MEMORY_SCHEMA, variant: "control-lucid", target_id: "erdos-396", entries: [{ name: "lem" }] }
  const end = {
    kind: "end",
    at: "2026-10-20T11:00:00.000Z",
    ok: false,
    reason: "time",
    seconds: 3600,
    cost_usd: 9,
    memory_run: { variant: "control-lucid", session_mode: "persistent", attempts: 4, resumes: 3, fresh_starts: 1, size: 1, stats: { saved: 2 } },
  }
  const { item, memory: mem } = deriveItem({ id: "2026-10-20T10-00-00-000Z-erdos_396", text: jl({ ...START, strategy: "control-lucid" }, end), sidecars: { memory }, nowMs: NOW })
  assert.equal(item.variant, "control-lucid")
  assert.equal(item.session_mode, "persistent")
  assert.equal(item.attempts, 4)
  assert.deepEqual(item.memory_run, { attempts: 4, resumes: 3, fresh_starts: 1, size: 1, stats: { saved: 2 } })
  assert.equal(item.memory_source, "bridge")
  assert.equal(mem, memory)
})

test("deriveItem: an older memory run reports fresh attempts, counts them from the transcript, and has no library unless its events carried one", () => {
  const events = [ev(1, "TEXT — Attempt 1 — go"), ev(2, "TEXT — Attempt 2 — go"), ev(3, "TEXT — Attempt 3 — go")]
  const noLib = deriveItem({ id: "2026-10-20T10-00-00-000Z-foo_bar", text: jl({ ...START, strategy: "control-lucid" }, ...events, { kind: "end", at: "2026-10-20T11:00:00.000Z", ok: false, reason: "time", seconds: 3600 }), nowMs: NOW })
  assert.equal(noLib.item.session_mode, "fresh_per_attempt")
  assert.equal(noLib.item.attempts, 3)
  assert.equal(noLib.item.memory_source, null)
  assert.equal(noLib.memory, null)

  const saved = ev(5, "SYSTEM — Saved to memory: lem_one\ntheorem lem_one : True := trivial")
  const improved = ev(6, "SYSTEM — Memory entry improved: lem_one\ntheorem lem_one : True := by\n  trivial")
  const lib = deriveItem({ id: "2026-10-20T10-00-00-000Z-foo_bar", text: jl({ ...START, strategy: "control-lucid" }, saved, improved, { kind: "end", at: "2026-10-20T11:00:00.000Z", ok: false, reason: "time", seconds: 3600 }), nowMs: NOW })
  assert.equal(lib.item.memory_source, "reconstructed")
  assert.equal(lib.memory.reconstructed, true)
  assert.equal(lib.memory.entries.length, 1)
  assert.match(lib.memory.entries[0].closure, /by\n {2}trivial/, "the improved version replaces the first")
})

test("reconstructMemory ignores events that are not memory saves", () => {
  assert.equal(reconstructMemory([ev(1, "TEXT — Saved to memory: x")]).entries.length, 0)
})

// ---- the files --------------------------------------------------------------------------------------------------------------------
function sampleItems() {
  const mk = (id, over = {}) =>
    deriveItem({
      id,
      text: jl({ ...START, at: id.slice(0, 10) + "T10:00:00.000Z" }, { kind: "end", at: id.slice(0, 10) + "T10:10:00.000Z", ok: true, reason: "verified", seconds: 600, cost_usd: 2 }),
      sidecars: { proof: PROOF },
      nowMs: NOW,
      ...over,
    }).item
  return [mk("2026-10-02T10-00-00-000Z-foo_bar"), mk("2026-10-01T10-00-00-000Z-foo_bar")].map((it) => ({ ...it, files: { log: `2026-10/logs/${it.run_id}.jsonl`, proof: null, memory: null }, run_log: `2026-10/logs/${it.run_id}.jsonl` }))
}

test("monthMetricsJson follows the LRR metrics.json shape", () => {
  const items = sampleItems().map((it, i) => ({ ...it, seq: i }))
  const j = monthMetricsJson({ account: "fleeting", month: "2026-10", items })
  assert.ok(j.run && j.note && Array.isArray(j.items))
  for (const it of j.items) {
    for (const k of ["seq", "problem_id", "status", "refuted", "cost_usd", "started_at", "finished_at", "wall_ms", "attempts", "error_message", "metrics", "has_proof", "run_log"]) assert.ok(k in it, `item lacks ${k}`)
    for (const k of ["tokens", "cost_usd", "bridge_build", "time_elapsed", "tools_invoked", "lean_toolchain", "verifier_group", "llm_invocations", "mathlib_version"]) assert.ok(k in it.metrics, `metrics lack ${k}`)
  }
  assert.deepEqual(j.items.map((i) => i.seq), [0, 1])
})

test("monthMetricsMd and readmeMd render, with dashes for nulls and totals that add up", () => {
  const items = sampleItems().map((it, i) => ({ ...it, seq: i, cost_usd: i === 0 ? null : 2 }))
  const md = monthMetricsMd({ account: "fleeting", month: "2026-10", items })
  assert.match(md, /fleeting/)
  assert.match(md, /foo_bar/)
  assert.match(md, /—/, "a null prints as a dash, not as 0")
  const rows = sampleItems().map(indexRow)
  const readme = readmeMd({ account: "fleeting", rows })
  assert.match(readme, /fleeting/)
  assert.match(readme, /2026-10/)
})

test("indexRow is one flat line of the fields trend analysis wants, with the pointer or the log path", () => {
  const [it] = sampleItems()
  const row = indexRow(it)
  assert.equal(row.schema, INDEX_SCHEMA)
  assert.equal(row.run_id, it.run_id)
  assert.equal(row.month, "2026-10")
  for (const k of ["strategy", "model", "variant", "session_mode", "status", "cost_usd", "wall_ms", "attempts", "has_proof", "backfilled", "path"]) assert.ok(k in row, `row lacks ${k}`)
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(row)))
  const pointed = indexRow({ ...it, run_log: null, also_in: "runs/fatex/logs/a.jsonl" })
  assert.equal(pointed.path, "runs/fatex/logs/a.jsonl")
})

test("launchdPlist runs the sync on a timer and when the index changes, and escapes what it embeds", () => {
  const xml = launchdPlist({ label: "com.competemath.lrr-sync", node: "/opt/a&b/node", script: "/x/sync.mjs", home: "/Users/me" })
  assert.match(xml, /StartInterval<\/key><integer>900</)
  assert.match(xml, /WatchPaths/)
  assert.match(xml, /\/Users\/me\/\.leak-runs\/index\.jsonl/)
  assert.match(xml, /a&amp;b/)
  assert.doesNotMatch(xml, /a&b/)
})

test("constants the sync relies on", () => {
  assert.equal(sha256("a"), "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb")
  assert.ok(GZIP_OVER > 10 * 1024 * 1024 && GZIP_OVER < 50 * 1024 * 1024, "below GitHub's 50 MB warning")
})
