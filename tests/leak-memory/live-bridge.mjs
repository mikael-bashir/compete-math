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
import { deriveItem } from "../../tools/lrr-sync/core.mjs"

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
      body: JSON.stringify({ theorem: extra.theorem || THEOREM, mcpServers: extra.mcpServers || mcpServers, model: "sonnet", options: { strategy, computeBudgetMs: 120000, targetId: "fake-1", ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== "theorem" && k !== "mcpServers")) } }),
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
  return { home: HOME, frames, post, calls, log: () => log, stop: () => child.kill(), signal: (sig) => child.kill(sig), exited: () => child.exitCode !== null || child.signalCode !== null }
}

const seed = [{ id: "seed1", name: "odd_pair_even_seed", statement: "theorem odd_pair_even_seed (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0", closure: "theorem odd_pair_even_seed (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0 := by\n  omega", origin: "seed", saved_at: 1 }]
const done = (f) => f.filter((x) => x.type === "done").pop()
const texts = (f) => f.filter((x) => x.subtype === "status").map((x) => x.thought)

let failed = 0
const check = async (name, fn) => {
  if (process.env.LIVE_ONLY && !new RegExp(process.env.LIVE_ONLY).test(name)) return // LIVE_ONLY=<regex>: run just the matching scenarios while developing
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
  await check("cost cap accepted", async () => {
    assert.ok((await b.frames("control-honoured", { maxCostUsd: 0.001, memory: { entries: [] } })).length > 0)
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

// ---- Leak II variants and what the logs say about the prompts ----
{
  const withLeakII = [...mcpServers, { name: "Leak_II", url: `http://127.0.0.1:${leak.port}/ii/sse`, tools: [{ name: "init_proof", args: ["goal"] }, { name: "apply_tactic", args: ["tactic"] }] }]
  const promptOf = (f) => f.filter((x) => x.type === "prompt" && x.kind !== "followup").pop()
  await check("the -iv variant gives the agent Leak II and says so; the plain variant, given the same servers, does not", async () => {
    const b = await startBridge({ FAKE_MODE: "ok" })
    try {
      const iv = await b.frames("control-honoured-iv", { memory: { entries: seed }, mcpServers: withLeakII })
      const p = promptOf(iv)
      assert.match(p.prompt, /CONTROL IV MEMORY — Control IV Honoured/)
      assert.match(p.prompt, /mcp__Leak_II__init_proof/)
      assert.match(p.prompt, /INTERACTIVE \(Leak II\)/)
      assert.ok(p.mcpServers.some((s) => s.name === "Leak_II"), "Leak II is among the agent's servers")
      assert.match(texts(iv).join(" | "), /Leak II \(Pantograph\)/)
      assert.equal(done(iv)?.verified, true)
      const plain = await b.frames("control-honoured", { memory: { entries: seed }, mcpServers: withLeakII })
      const q = promptOf(plain)
      assert.doesNotMatch(q.prompt, /mcp__Leak_II__|INTERACTIVE \(Leak II\)|ALSO have Leak II|Leak II \(init_proof/)
      assert.ok(!q.mcpServers.some((s) => s.name === "Leak_II"), "the plain variant must not get Leak II")
    } finally {
      b.stop()
    }
  })
  await check("an -iv variant with no Leak II connected says so, and its prompt does not promise tools it lacks", async () => {
    const b = await startBridge({ FAKE_MODE: "ok" })
    try {
      const f = await b.frames("control-lucid-iv", { memory: { entries: seed } })
      assert.match(JSON.stringify(f), /no Leak II server is connected/)
      assert.doesNotMatch(promptOf(f).prompt, /mcp__Leak_II__|INTERACTIVE \(Leak II\)|ALSO have Leak II|Leak II \(init_proof/)
    } finally {
      b.stop()
    }
  })
  await check("the prompt carries the standing order, the stuck playbook and the no-churning rule, in every variant", async () => {
    const b = await startBridge({ FAKE_MODE: "ok" })
    try {
      for (const v of ["control-honoured", "control-flint", "control-paragon", "control-lucid", "control-flint-iv"]) {
        const p = promptOf(await b.frames(v, { memory: { entries: seed }, mcpServers: withLeakII })).prompt
        assert.match(p, /STANDING ORDER FROM THE OPERATOR/, v)
        assert.match(p, /WHEN YOU ARE STUCK/, v)
        assert.match(p, /NO BRUTE FORCE\. THIS IS A PROHIBITION/, v)
        assert.match(p, /THE GOAL OF THIS RUN[\s\S]*proof ecosystem/, v)
        assert.match(p, /Tengoku is a large, self-contained/, v)
        assert.match(p, /THREE KINDS OF WORK[\s\S]*LONG-LASTING PROCESS/, v)
        assert.ok(p.indexOf("THREE KINDS OF WORK") < p.indexOf("THE LOOP"), `${v}: the options come before the loop`)
        assert.ok(p.indexOf("STANDING ORDER") < p.indexOf("THE LOOP"), `${v}: the order comes first`)
      }
    } finally {
      b.stop()
    }
  })
  await check("the CLI's system prompt carries the brute-force rule for the memory variants and not for plain Control II", async () => {
    const b = await startBridge({ FAKE_MODE: "ok" })
    try {
      await b.frames("control-honoured", { memory: { entries: seed } })
      await b.frames("control-oneshot-2", {})
      const [mem, plain] = b.calls().map((c) => c.appendSystem || "")
      assert.match(mem, /NO BRUTE FORCE[\s\S]*LOCAL LEAN IS NOT AVAILABLE/, "the rule comes before the machine note it overrides")
      assert.doesNotMatch(plain, /NO BRUTE FORCE/, "the baseline's system prompt is untouched")
      assert.match(plain, /LOCAL LEAN IS NOT AVAILABLE/)
    } finally {
      b.stop()
    }
  })
  await check("the transcript on disk holds every prompt the agent was given, in full, and says which is which", async () => {
    const b = await startBridge({ FAKE_MODE: "giveup" })
    try {
      await b.frames("control-honoured-iv", { memory: { entries: [] }, mcpServers: withLeakII, minAttemptMs: 600000, maxNudges: 2 })
      const dir = path.join(b.home, ".leak-runs")
      let lines = []
      for (let i = 0; i < 80 && !lines.length; i++) {
        const f = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => n.endsWith(".jsonl") && n !== "index.jsonl") : null
        if (f) lines = fs.readFileSync(path.join(dir, f), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((o) => o.kind === "event")
        if (!lines.some((o) => /reminder 1 of 2/.test(o.text))) lines = []
        if (!lines.length) await new Promise((r) => setTimeout(r, 100))
      }
      const prompts = lines.map((o) => o.text).filter((t) => t.startsWith("PROMPT TO THE AGENT"))
      assert.ok(prompts.length >= 2, "prompts in the transcript: " + prompts.length)
      const first = prompts[0]
      assert.match(first, /^PROMPT TO THE AGENT — \[CONTROL IV MEMORY — Control IV Honoured · attempt 1\]/)
      assert.match(first, /STANDING ORDER FROM THE OPERATOR/)
      assert.match(first, /Theorem \(its signature is immutable/)
      assert.match(first, /SYSTEM PROMPT ADDENDUM[\s\S]*NO BRUTE FORCE[\s\S]*LOCAL LEAN IS NOT AVAILABLE/)
      assert.ok(first.length > 6000, "the whole prompt, not an excerpt: " + first.length)
      const nudge = prompts.find((t) => /reminder 1 of 2/.test(t))
      assert.match(nudge, /^PROMPT TO THE AGENT \(follow-up\) — /)
      assert.match(nudge, /ORDER: DO NOT STOP/)
      assert.match(nudge, /Leak II \(init_proof/)
      assert.ok(!lines.some((o) => /run prompt captured/.test(o.text) && /memory/i.test(o.text)), "no stand-in line where a prompt should be")
    } finally {
      b.stop()
    }
  })
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
  await check("an agent that never works gets at most maxNudges reminders per attempt, then the next attempt resumes the SAME session", async () => {
    const ctl = new AbortController()
    const p = b.post("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 2 }, { signal: ctl.signal }).then((r) => r.text()).catch(() => "")
    for (let i = 0; i < 100 && b.calls().length < 4; i++) await new Promise((r) => setTimeout(r, 100))
    ctl.abort()
    await p
    const calls = b.calls()
    assert.ok(calls.length >= 4, `only ${calls.length} CLI calls`)
    assert.deepEqual(calls.slice(0, 4).map((c) => c.resume !== null), [false, true, true, true])
    assert.equal(calls[2].resume, calls[1].session, "each reminder resumes the latest session")
    assert.equal(calls[3].resume, calls[2].session, "the next attempt resumes it too, instead of opening a fresh conversation")
    assert.match(calls[3].prompt, /attempt 2 of the SAME session/)
    assert.doesNotMatch(calls[3].prompt, /THE LOOP/, "the rules are not repeated: they are already in the conversation")
    assert.match(calls[3].prompt, /select:mcp__Leak_IV__verify_full_script/, "it says how to reload a tool, in case the resume lost it")
  })
  b.stop()
}
{
  const b = await startBridge({ FAKE_MODE: "stubborn" })
  await check("maxNudges 0 turns reminders off: every stop is the next attempt, in the same session", async () => {
    const ctl = new AbortController()
    const p = b.post("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 0 }, { signal: ctl.signal }).then((r) => r.text()).catch(() => "")
    for (let i = 0; i < 100 && b.calls().length < 3; i++) await new Promise((r) => setTimeout(r, 100))
    ctl.abort()
    await p
    const calls = b.calls()
    assert.equal(calls[0].resume, null)
    assert.equal(calls[1].resume, calls[0].session)
    assert.equal(calls[2].resume, calls[1].session)
    assert.match(calls[1].prompt, /attempt 2 of the SAME session/)
    assert.match(calls[2].prompt, /attempt 3 of the SAME session/)
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

// ---- processes the agent starts ----
// An overnight agent ran `nohup python3 … &` and a compiled C sieve over 400 million numbers. Killing the CLI does not kill what it
// started, so the bridge starts the CLI as its own process group and kills the group: when the run ends, when it is aborted, and when
// the bridge itself is stopped. Between two reminders in one attempt the group is kept (the agent may be waiting for its own job).
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
const waitDead = async (pids, ms = 5000) => { for (let t = 0; t < ms / 100 && pids.some(alive); t++) await new Promise((r) => setTimeout(r, 100)); return pids.filter(alive) }
const readPids = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(Number) : [])
const bgFile = (name) => path.join(tmp, `bg-${name}.txt`)
{
  const bg = bgFile("finish")
  const b = await startBridge({ FAKE_BG: bg })
  await check("a background job the agent started is gone when the run ends, and nothing else is touched", async () => {
    // a bystander in the test's own group, and the bridge itself, must come through every group kill
    const bystander = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" })
    await b.frames("control-honoured", { memory: { entries: [] } })
    assert.ok(alive(bystander.pid), "a process outside the agent's group was killed")
    assert.equal(b.exited(), false, "the bridge itself died")
    bystander.kill()
    const pids = readPids(bg)
    assert.ok(pids.length >= 1)
    assert.deepEqual(await waitDead(pids), [], "a background job outlived the run")
  })
  await check("plain Control II does the same", async () => {
    const before = readPids(bg).length
    await b.frames("control-oneshot-2")
    const pids = readPids(bg).slice(before)
    assert.ok(pids.length >= 1)
    assert.deepEqual(await waitDead(pids), [], "a background job outlived plain Control II")
  })
  b.stop()
}
{
  const bg = bgFile("nudge")
  const b = await startBridge({ FAKE_MODE: "giveup", FAKE_BG: bg })
  await check("a job survives a reminder in the same conversation, and is gone when the run ends", async () => {
    await b.frames("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 2 })
    const calls = b.calls()
    assert.equal(calls[1].resume, calls[0].session)
    assert.deepEqual(calls[1].prevBgAlive, [true], "the first session's job should still be running when the reminder arrives")
    assert.deepEqual(await waitDead(readPids(bg)), [])
  })
  b.stop()
}
{
  const bg = bgFile("fresh")
  const b = await startBridge({ FAKE_MODE: "stubborn", FAKE_BG: bg })
  await check("while the session goes on across attempts the agent's jobs are its own; they end with the run", async () => {
    const ctl = new AbortController()
    const p = b.post("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 1 }, { signal: ctl.signal }).then((r) => r.text()).catch(() => "")
    for (let i = 0; i < 100 && b.calls().length < 3; i++) await new Promise((r) => setTimeout(r, 100))
    ctl.abort()
    await p
    const calls = b.calls()
    assert.deepEqual(calls.slice(0, 3).map((c) => c.resume !== null), [false, true, true])
    assert.deepEqual(calls[1].prevBgAlive, [true])
    assert.deepEqual(calls[2].prevBgAlive, [true, true], `the next attempt of the same session lost its jobs: ${calls[2].prevBgAlive}`)
    assert.deepEqual(await waitDead(readPids(bg)), [])
  })
  b.stop()
}
{
  const bg = bgFile("lost")
  const b = await startBridge({ FAKE_MODE: "lose", FAKE_BG: bg })
  await check("a session that cannot be resumed is replaced by a new conversation with the full prompt, and its jobs end", async () => {
    const ctl = new AbortController()
    const p = b.post("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 1 }, { signal: ctl.signal }).then((r) => r.text()).catch(() => "")
    for (let i = 0; i < 100 && b.calls().length < 3; i++) await new Promise((r) => setTimeout(r, 100))
    ctl.abort()
    await p
    const calls = b.calls()
    assert.deepEqual(calls.slice(0, 3).map((c) => c.resume !== null), [false, true, false])
    assert.match(calls[2].prompt, /THE LOOP/)
    assert.match(calls[2].promptFull, /could not be resumed/)
    assert.ok(calls[2].prevBgAlive.every((x) => x === false), `the new conversation found jobs alive: ${calls[2].prevBgAlive}`)
    assert.deepEqual(await waitDead(readPids(bg)), [])
  })
  b.stop()
}
{
  const bg = bgFile("abort")
  const b = await startBridge({ FAKE_MODE: "hang", FAKE_BG: bg })
  await check("terminating a run kills the CLI and what it started", async () => {
    const ctl = new AbortController()
    const p = b.post("control-honoured", { memory: { entries: [] } }, { signal: ctl.signal }).then((r) => r.text()).catch(() => "")
    for (let i = 0; i < 100 && b.calls().length < 1; i++) await new Promise((r) => setTimeout(r, 100))
    assert.equal(b.calls().length, 1)
    const pids = [...readPids(bg), b.calls()[0].pid]
    assert.ok(pids.every(alive), "the CLI and its job are running before the abort")
    ctl.abort()
    await p
    assert.deepEqual(await waitDead(pids), [], "something survived the abort")
  })
  b.stop()
}
for (const sig of ["SIGTERM", "SIGINT"]) {
  const bg = bgFile(sig)
  const b = await startBridge({ FAKE_MODE: "hang", FAKE_BG: bg })
  await check(`stopping the bridge with ${sig} takes the CLI and its jobs with it`, async () => {
    b.post("control-honoured", { memory: { entries: [] } }).catch(() => {})
    for (let i = 0; i < 100 && b.calls().length < 1; i++) await new Promise((r) => setTimeout(r, 100))
    const pids = [...readPids(bg), b.calls()[0].pid]
    assert.ok(pids.every(alive))
    b.signal(sig)
    assert.deepEqual(await waitDead(pids), [], `something survived the bridge's ${sig}`)
  })
  b.stop()
}

// ---- the answer slot: True proves the statement, False proves its negation, nothing else counts ----
{
  const SLOT = "theorem slot_fake : (sorry : Prop) ↔ (∀ a : ℕ, a + 0 = a) := by\n  sorry"
  const proofs = {
    yes: "theorem slot_fake : True ↔ (∀ a : ℕ, a + 0 = a) := by\n  simp",
    yesParen: "theorem slot_fake : (True : Prop) ↔ (∀ a : ℕ, a + 0 = a) := by\n  simp",
    no: "theorem slot_fake :  False  ↔ (∀ a : ℕ, a + 0 = a) := by\n  simp",
    same: "theorem slot_fake : (∀ a : ℕ, a + 0 = a) ↔ (∀ a : ℕ, a + 0 = a) := by\n  exact Iff.rfl",
    other: "theorem slot_fake : (1 = 1) ↔ (∀ a : ℕ, a + 0 = a) := by\n  simp",
    changed: "theorem slot_fake : True ↔ (∀ a : ℕ, a + 1 = a + 1) := by\n  simp",
  }
  const run = async (key, strategy = "control-honoured") => {
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_TARGET_PROOF: proofs[key], FAKE_LEMMA: "0" })
    try {
      const f = await b.frames(strategy, { theorem: SLOT, memory: { entries: [] }, computeBudgetMs: /yes|no/.test(key) ? 120000 : 4000 })
      return { f, calls: b.calls(), t: texts(f), done: f.find((x) => x.type === "done") }
    } finally {
      b.stop()
    }
  }
  await check("slot True: the statement counts as proved, and the run says so", async () => {
    const r = await run("yes")
    assert.ok(r.t.some((x) => /closed it on attempt 1.*Answer True: the statement is PROVED/.test(x)), r.t.join(" | "))
    assert.equal(r.done.verified, true)
  })
  await check("slot written (True : Prop) also counts", async () => {
    assert.equal((await run("yesParen")).done.verified, true)
  })
  await check("slot False: the negation counts as proved, and the run says DISPROVED", async () => {
    const r = await run("no")
    assert.ok(r.t.some((x) => /Answer False: the statement is DISPROVED/.test(x)), r.t.join(" | "))
    assert.equal(r.done.verified, true)
  })
  await check("plain Control II takes either answer too", async () => {
    const r = await run("no", "control-oneshot-2")
    assert.equal(r.done.verified, true, r.t.join(" | "))
  })
  for (const key of ["same", "other", "changed"]) {
    await check(`slot filled with something else (${key}) does not count`, async () => {
      const r = await run(key)
      assert.notEqual(r.done?.verified, true, "the gate accepted it")
      assert.ok(!r.t.some((x) => /closed it on attempt/.test(x)), r.t.join(" | "))
    })
  }
  await check("the prompt explains the slot for a slot target, and says nothing of it otherwise", async () => {
    const withSlot = await run("yes")
    assert.match(withSlot.calls[0].promptTail, /ANSWER SLOT[\s\S]*True[\s\S]*False[\s\S]*except for the answer slot/)
    const b = await startBridge({ FAKE_MODE: "ok" })
    try {
      await b.frames("control-honoured", { memory: { entries: [] } })
      assert.ok(!/ANSWER SLOT/.test(b.calls()[0].promptTail), "a plain target got the slot note")
    } finally {
      b.stop()
    }
  })
}

// ---- run records: what a finished run leaves in ~/.leak-runs for tools/lrr-sync (the end line, the sidecars, the hook) ----
{
  const waitFor = async (f, ms = 8000) => {
    for (let i = 0; i < ms / 100; i++) {
      const v = f()
      if (v) return v
      await new Promise((r) => setTimeout(r, 100))
    }
    return null
  }
  const runsOf = (home) => {
    const d = path.join(home, ".leak-runs")
    return fs.existsSync(d) ? fs.readdirSync(d).sort() : []
  }
  const readLines = (f) => fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l))
  await check("a memory run leaves a start line with its target, an end line with its metrics and session, a .lean proof and a .memory.json library", async () => {
    const hookOut = path.join(tmp, "hook-calls.txt")
    const hook = path.join(tmp, "hook.sh")
    fs.writeFileSync(hook, `#!/bin/sh\necho "$1" >> "${hookOut}"\n`, { mode: 0o755 })
    const b = await startBridge({ FAKE_MODE: "ok", LEAK_RUN_HOOK: hook })
    try {
      const f = await b.frames("control-honoured", { memory: { entries: seed }, targetId: "fake-1" })
      assert.equal(done(f).verified, true)
      const names = await waitFor(() => (runsOf(b.home).some((n) => n.endsWith(".memory.json")) ? runsOf(b.home) : null))
      assert.ok(names, "no run record: " + runsOf(b.home).join(", "))
      const jsonl = names.find((n) => n.endsWith(".jsonl") && n !== "index.jsonl")
      const base = path.join(b.home, ".leak-runs", jsonl.replace(/\.jsonl$/, ""))
      const lines = readLines(`${base}.jsonl`)
      const start = lines[0]
      const end = lines.at(-1)
      assert.equal(start.kind, "start")
      assert.equal(start.target_id, "fake-1")
      assert.equal(start.strategy, "control-honoured")
      assert.equal(end.kind, "end")
      assert.equal(end.ok, true)
      assert.equal(end.target_id, "fake-1")
      assert.ok(end.metrics && ["tools_invoked", "llm_invocations", "time_elapsed", "bridge_build"].every((k) => k in end.metrics), "metrics on the end line: " + JSON.stringify(end.metrics))
      assert.equal(end.memory_run.variant, "control-honoured")
      assert.equal(end.memory_run.session_mode, "persistent")
      assert.ok(end.memory_run.attempts >= 1)
      assert.ok(end.sidecars.includes(path.basename(`${base}.lean`)) && end.sidecars.includes(path.basename(`${base}.memory.json`)))
      const lean = fs.readFileSync(`${base}.lean`, "utf8")
      assert.match(lean, /theorem target_fake/)
      assert.ok(!/\bsorry\b/.test(lean))
      const mem = JSON.parse(fs.readFileSync(`${base}.memory.json`, "utf8"))
      assert.equal(mem.schema, "leak-run-memory/1")
      assert.equal(mem.target_id, "fake-1")
      assert.ok(mem.entries.length >= 1 && mem.entries.every((e) => e.name && e.closure))
      const idx = readLines(path.join(b.home, ".leak-runs/index.jsonl")).at(-1)
      assert.equal(idx.file, jsonl)
      assert.equal(idx.strategy, "control-honoured")
      // and the sync reads it as a run the bridge itself described, not a backfill
      const d = deriveItem({ id: jsonl.replace(/\.jsonl$/, ""), text: fs.readFileSync(`${base}.jsonl`, "utf8"), sidecars: { proof: lean, memory: mem }, indexRow: idx })
      assert.equal(d.item.status, "proved")
      assert.equal(d.item.backfilled, false)
      assert.equal(d.item.metrics_source, "bridge")
      assert.equal(d.item.proof_source, "bridge")
      assert.equal(d.item.memory_source, "bridge")
      assert.equal(d.item.variant, "control-honoured")
      assert.equal(d.item.session_mode, "persistent")
      // the hook ran once, with the transcript's path
      const called = await waitFor(() => (fs.existsSync(hookOut) ? fs.readFileSync(hookOut, "utf8").trim().split("\n") : null))
      assert.deepEqual(called, [`${base}.jsonl`])
    } finally {
      b.stop()
    }
  })
  await check("a plain run leaves no memory sidecar, and a relative hook path is never run", async () => {
    const b = await startBridge({ FAKE_MODE: "ok", LEAK_RUN_HOOK: "relative/hook.sh" })
    try {
      const f = await b.frames("control-oneshot-2", {})
      assert.ok(done(f))
      const names = await waitFor(() => (runsOf(b.home).some((n) => n.endsWith(".jsonl") && n !== "index.jsonl") ? runsOf(b.home) : null))
      assert.ok(names)
      assert.ok(!names.some((n) => n.endsWith(".memory.json")), names.join(", "))
      const end = readLines(path.join(b.home, ".leak-runs", names.find((n) => n.endsWith(".jsonl") && n !== "index.jsonl"))).at(-1)
      assert.equal(end.kind, "end")
      assert.ok(end.metrics, "a plain run's end line has its metrics too")
      assert.equal(end.memory_run, undefined)
    } finally {
      b.stop()
    }
  })
  await check("a run that proves nothing writes no .lean", async () => {
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_TARGET_PROOF: "theorem unrelated_fake : True := trivial", FAKE_LEMMA: "0" })
    try {
      const f = await b.frames("control-oneshot-2", { computeBudgetMs: 4000 })
      assert.notEqual(done(f)?.verified, true)
      const idx = await waitFor(() => (runsOf(b.home).includes("index.jsonl") ? readLines(path.join(b.home, ".leak-runs/index.jsonl")).at(-1) : null), 12000)
      assert.ok(idx, "no index row")
      assert.equal(idx.ok, false)
      assert.ok(!runsOf(b.home).some((n) => n.endsWith(".lean")), "an unproved run wrote a proof")
    } finally {
      b.stop()
    }
  })
}

// ---- no cap on a session: the agent manages its own context ----
{
  const ctl = { a: new AbortController(), b: new AbortController() }
  const a = await startBridge({ FAKE_MODE: "hang" })
  const b = await startBridge({ FAKE_MODE: "hang" })
  await check("a session is never cut by a timer of the bridge's own, even if a client still sends attemptMs", async () => {
    const collect = (bridge, extra, signal) => {
      const got = { text: "", done: null }
      got.done = bridge.post("control-honoured", extra, { signal }).then(async (r) => { const dec = new TextDecoder(); for await (const c of r.body) got.text += dec.decode(c, { stream: true }) }).catch(() => {})
      return got
    }
    const pa = collect(a, { memory: { entries: [] } }, ctl.a.signal)
    const pb = collect(b, { memory: { entries: [] }, attemptMs: 60000 }, ctl.b.signal) // the old 1-minute floor of the cap that used to exist
    for (let i = 0; i < 100 && (a.calls().length < 1 || b.calls().length < 1); i++) await new Promise((r) => setTimeout(r, 100))
    await new Promise((r) => setTimeout(r, 68_000))
    for (const [name, x] of [["default", a], ["with attemptMs", b]]) {
      assert.equal(x.calls().length, 1, `${name}: the session was cut and a fresh one started`)
      assert.ok(alive(x.calls()[0].pid), `${name}: the session's CLI is gone`)
    }
    ctl.a.abort()
    ctl.b.abort()
    await Promise.all([pa.done, pb.done])
    assert.match(pa.text, /no cap on it/)
    assert.ok(!/at most \d+ min/.test(pa.text), "the status line still names a cap")
  })
  a.stop()
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
