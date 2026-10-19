// End to end: the real bridge, a fake `claude` CLI and fake Leak servers, one bridge per scenario.
//   node tests/leak-memory/live-bridge.mjs        (also part of `pnpm test`, so CI runs it)
// Every scenario here is a bug that was real, or a promise the memory variants make: what the agent is shown, where it runs, what it
// may touch, what happens when it stops early, and what the sleep stage does to the library.
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import assert from "node:assert/strict"
import { startFakeLeak } from "./fake-leak.mjs"
import { Memory } from "../../public/leak-memory.mjs"
import { OLD, SLEEP_SCRIPT } from "./overnight-fixture.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const bridgePath = path.join(here, "../../public/local-claude-bridge.mjs")
const leak = await startFakeLeak()
const mcpServers = [
  { name: "Leak_IV", url: `http://127.0.0.1:${leak.port}/iv/sse`, tools: ["verify_full_script"] },
  { name: "Leak_I", url: `http://127.0.0.1:${leak.port}/i/sse`, tools: [{ name: "moogle_search", args: ["concept"] }] },
]
const THEOREM = "theorem target_fake (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0 := by\n  sorry"
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leak-memory-live-"))
let portCounter = 4300 + Math.floor(Math.random() * 400)

// A bridge with its own throwaway $HOME (it banks proofs and logs runs there) and its own env for the fake CLI.
async function startBridge(env = {}) {
  const PORT = portCounter++
  const HOME = fs.mkdtempSync(path.join(tmp, "home-"))
  const report = path.join(HOME, "report.jsonl")
  const child = spawn(env.__node || process.execPath, [bridgePath], {
    env: { PATH: process.env.PATH, TMPDIR: tmp, ...env, HOME, LEAK_PROOF_BANK: path.join(HOME, "bank.json"), PORT: String(PORT), CLAUDE_BIN: path.join(here, "fake-claude.mjs"), FAKE_SEARCH: "1", BRIDGE_TOKEN: "test-token", FAKE_REPORT: report },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let log = ""
  child.stdout.on("data", (d) => (log += d))
  child.stderr.on("data", (d) => (log += d))
  for (let i = 0; i < 100 && !/127\.0\.0\.1|localhost/.test(log); i++) await new Promise((r) => setTimeout(r, 100))
  const calls = () => (fs.existsSync(report) ? fs.readFileSync(report, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [])
  const post = async (strategy, extra = {}, { signal } = {}) => {
    const res = await fetch(`http://127.0.0.1:${PORT}/prove-tree`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-token": "test-token", origin: "http://localhost:3000" },
      body: JSON.stringify({ theorem: THEOREM, mcpServers, model: "sonnet", options: { strategy, computeBudgetMs: 120000, targetId: "fake-1", ...extra } }),
      signal,
    })
    if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()))
    return res
  }
  const frames = async (strategy, extra) => {
    const res = await post(strategy, extra)
    const out = []
    let buf = ""
    const dec = new TextDecoder()
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true })
      let i
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const d = raw.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("")
        if (d) try { out.push(JSON.parse(d)) } catch {}
      }
    }
    return out
  }
  return { frames, post, calls, log: () => log, stop: () => child.kill() }
}

const seed = [{ id: "seed1", name: "odd_pair_even_seed", statement: "theorem odd_pair_even_seed (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0", closure: "theorem odd_pair_even_seed (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0 := by\n  omega", origin: "seed", saved_at: 1 }]
const done = (f) => f.filter((x) => x.type === "done").pop()
const texts = (f) => f.filter((x) => x.subtype === "status").map((x) => x.thought)

let failed = 0
const check = async (name, fn) => {
  try {
    await fn()
    console.log("ok  ", name)
  } catch (e) {
    failed++
    console.log("FAIL", name, "\n    ", String(e.stack || e.message).split("\n").slice(0, 4).join("\n     "))
  }
}

// ---- the agent: what it is shown, where it runs ----
{
  const b = await startBridge()
  let honoured
  await check("honoured: solves, recalls, saves, and the logged prompt is the memory prompt", async () => {
    honoured = await b.frames("control-honoured", { memory: { entries: seed } })
    assert.ok(honoured.some((f) => f.type === "memory" && f.op === "save"))
    assert.ok(JSON.stringify(honoured).includes("memory_recall"))
    const last = honoured.filter((f) => f.type === "prompt").pop()?.prompt || ""
    assert.match(last, /CONTROL II MEMORY/)
    assert.match(last, /Verify early and often/)
    assert.doesNotMatch(last, /you do not write top-level helper lemmas/)
    assert.equal(done(honoured)?.verified, true)
  })
  await check("the agent runs in a scratch directory with auto-memory off, and the directory is removed afterwards", async () => {
    const c = b.calls()[0]
    assert.ok(fs.realpathSync(path.dirname(c.cwd)) === fs.realpathSync(tmp) || c.cwd.startsWith(tmp), `cwd ${c.cwd} is not under the bridge's temp directory ${tmp}`)
    assert.match(path.basename(c.cwd), /^leak-agent-/)
    assert.notEqual(path.resolve(c.cwd), path.resolve(here, "../.."))
    assert.equal(c.autoMemory, "1")
    assert.equal(c.claudeMds, "1")
    const st = JSON.parse(c.settings)
    assert.equal(st.autoMemoryEnabled, false)
    assert.ok(st.hooks?.PreToolUse, "the local-Lean block is still in the settings")
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(fs.existsSync(c.cwd), false, "scratch directory left behind")
  })
  await check("flint: no memory tools exposed", async () => {
    const f = await b.frames("control-flint", { memory: { entries: seed } })
    assert.ok(!JSON.stringify(f).includes("memory_recall"))
    assert.ok(f.some((x) => x.type === "memory" && x.op === "save"))
  })
  await check("paragon: search carries the memory block", async () => {
    const f = await b.frames("control-paragon", { memory: { entries: seed } })
    assert.ok(JSON.stringify(f).includes("odd_pair_even_seed"))
  })
  await check("cost cap and attemptMs accepted", async () => {
    assert.ok((await b.frames("control-honoured", { maxCostUsd: 0.001, attemptMs: 60000, memory: { entries: [] } })).length > 0)
  })
  await check("plain Control II: no memory frames, and it is isolated the same way", async () => {
    const before = b.calls().length
    const f = await b.frames("control-oneshot-2")
    assert.ok(!f.some((x) => x.type === "memory"))
    const c = b.calls()[before]
    assert.match(path.basename(c.cwd), /^leak-agent-/)
    assert.equal(c.autoMemory, "1")
  })
  b.stop()
}

// ---- the agent stops early ----
{
  const b = await startBridge({ FAKE_MODE: "giveup" })
  await check("an agent that gives up in seconds is resumed in the same conversation, and then proves the target", async () => {
    const f = await b.frames("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 2 })
    const calls = b.calls()
    assert.equal(calls[0].resume, null)
    assert.equal(calls[1].resume, calls[0].session, "the nudge resumes the session that stopped")
    assert.match(calls[1].prompt, /You stopped after/)
    assert.match(calls[1].prompt, /verify_full_script/)
    assert.ok(texts(f).some((t) => /stopped after .* minute/i.test(t)), "the run says it nudged: " + texts(f).join(" | "))
    assert.equal(done(f)?.verified, true)
    const stats = f.filter((x) => x.type === "memory" && x.op === "stats").pop()
    assert.equal(stats.stats.nudges, 1)
  })
  b.stop()
}
{
  const b = await startBridge({ FAKE_MODE: "stubborn" })
  await check("an agent that never works gets at most maxNudges reminders per attempt, then a fresh attempt", async () => {
    const ctl = new AbortController()
    const p = b.post("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 2 }, { signal: ctl.signal }).then((r) => r.text()).catch(() => "")
    for (let i = 0; i < 100 && b.calls().length < 4; i++) await new Promise((r) => setTimeout(r, 100))
    ctl.abort()
    await p
    const calls = b.calls()
    assert.ok(calls.length >= 4, `only ${calls.length} CLI calls`)
    assert.deepEqual(calls.slice(0, 4).map((c) => c.resume !== null), [false, true, true, false])
    assert.equal(calls[2].resume, calls[1].session, "each reminder resumes the latest session")
    assert.match(calls[3].prompt, /attempt 2 of an unbounded series/)
  })
  b.stop()
}
{
  const b = await startBridge({ FAKE_MODE: "stubborn" })
  await check("maxNudges 0 turns reminders off", async () => {
    const ctl = new AbortController()
    const p = b.post("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 0 }, { signal: ctl.signal }).then((r) => r.text()).catch(() => "")
    for (let i = 0; i < 100 && b.calls().length < 3; i++) await new Promise((r) => setTimeout(r, 100))
    ctl.abort()
    await p
    assert.ok(b.calls().slice(0, 3).every((c) => c.resume === null))
  })
  b.stop()
}

// ---- what the agent is told about its shell ----
{
  // a PATH with node and nothing else: no timeout, no python3
  const bin = fs.mkdtempSync(path.join(tmp, "bin-"))
  fs.symlinkSync(process.execPath, path.join(bin, "node"))
  const b = await startBridge({ PATH: bin })
  await check("the prompt says what the shell lacks (no timeout, no python3), found by probing it", async () => {
    const f = await b.frames("control-honoured", { memory: { entries: [] } })
    const prompt = f.filter((x) => x.type === "prompt").pop()?.prompt || ""
    assert.match(prompt, /`timeout` is not installed/)
    assert.match(prompt, /python3 is not installed/)
    assert.match(prompt, /moved to the background/)
  })
  b.stop()
}

// ---- the project's seed lemmas ----
{
  const b = await startBridge({ FAKE_QUERY: "seed lemma fake" })
  const seedScript = "theorem seed_lemma_fake (a : ℕ) : a + 0 = a + 0 + 0 := by\n  simp"
  await check("seed lemmas are in the run's library but are never saved to the account", async () => {
    const f = await b.frames("control-honoured", { memory: { entries: [] }, seeds: [seedScript] })
    assert.ok(JSON.stringify(f).includes("seed_lemma_fake"), "recall returns the seed")
    assert.ok(!f.some((x) => x.type === "memory" && x.op !== "stats" && x.entry?.name === "seed_lemma_fake"), "no frame would persist it")
    assert.ok(!f.some((x) => x.type === "memory" && x.op === "nominate" && /seed_lemma/.test(JSON.stringify(x))))
    const first = f.find((x) => x.type === "message-annotation" && /loaded for this target/.test(x.thought || ""))
    assert.match(first.thought, /\(1 loaded/)
  })
  b.stop()
}

// ---- the sleep stage on the run that went wrong ----
{
  const m = new Memory({})
  const olds = OLD.flatMap((s) => m.addScript(s, { attempt: 1 }))
  const ids = olds.map((e) => e.id.slice(0, 8))
  const json = JSON.stringify([{ name: "factorization_centralBinom_eq_card", script: SLEEP_SCRIPT, subsumes: ids, why: "one counting identity" }])
  const b = await startBridge({ FAKE_MODE: "ok", FAKE_SLEEP_JSON: json, FAKE_LIST: "1" })
  await check("sleep: each merged entry is updated once, the new lemmas are saved once each, and the merged entries leave the list", async () => {
    const f = await b.frames("control-lucid", { memory: { entries: olds.map((e) => ({ ...e })) }, sleepEveryMs: 0, sleepMinNew: 1 })
    assert.ok(texts(f).some((t) => /Sleep done: 4 abstract/.test(t)), texts(f).join(" | "))
    const fullIds = olds.map((e) => e.id)
    for (const id of fullIds) {
      const n = f.filter((x) => x.type === "memory" && x.op === "update" && x.entry?.id === id).length
      assert.equal(n, 1, `entry ${id.slice(0, 8)} updated ${n} times`)
      assert.ok(f.find((x) => x.op === "update" && x.entry?.id === id).entry.subsumedBy, "and it says what replaced it")
    }
    const saves = f.filter((x) => x.type === "memory" && x.op === "save" && x.entry?.origin === "abstracted")
    assert.equal(saves.length, 4)
    // the agent that runs after the sleep sees the merged entries hidden from memory_list, and the abstract lemmas in their place
    assert.ok(b.calls().some((c) => /consolidation \("sleep"\) stage/.test(c.prompt)))
    const listing = f.filter((x) => x.subtype === "tool_result" && /verified theorem\(s\) saved \(showing/.test(x.output || "")).pop()?.output || ""
    assert.match(listing, /factorization_centralBinom_eq_card/)
    assert.match(listing, /\(abstract lemma\)/)
    assert.doesNotMatch(listing, /le_factorization_centralBinom_of_dvd_succ/, "a merged entry is still listed")
    assert.match(listing, /4 more merged into the general lemmas above are hidden/)
  })
  b.stop()
}

leak.close()
fs.rmSync(tmp, { recursive: true, force: true })
if (failed) {
  console.log(`\n${failed} scenario(s) failed`)
  process.exit(1)
}
console.log("all live-bridge scenarios passed")
process.exit(0)
