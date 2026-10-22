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
import { Memory, TEMPERAMENT_CARD } from "../../public/leak-memory.mjs"
import { OLD, SLEEP_SCRIPT_STRICT } from "./overnight-fixture.mjs"
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
  const child = spawn(env.__node || process.execPath, [env.__bridge || bridgePath], {
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
  return { home: HOME, port: PORT, frames, post, calls, log: () => log, stop: () => child.kill(), signal: (sig) => child.kill(sig), exited: () => child.exitCode !== null || child.signalCode !== null }
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
  const b = await startBridge({ TEST_SECRET_TOKEN: "s3cret", ANTHROPIC_API_KEY: "sk-test" })
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
    // under the bridge's temp directory, or (when that path has characters the CLI rewrites, as on macOS) under /tmp: see agentScratchRoot
    const real = path.join(fs.realpathSync(path.dirname(c.cwd)), path.basename(c.cwd)) // the directory itself is already gone
    assert.ok(fs.realpathSync(path.dirname(c.cwd)) === fs.realpathSync(tmp) || real.startsWith(fs.realpathSync("/tmp") + path.sep), `cwd ${c.cwd} is not under the bridge's temp directory ${tmp}`)
    assert.match(path.basename(c.cwd), /^leak-agent-/)
    // the CLI names a background command's output folder after the working directory with every non-alphanumeric character turned into "-",
    // so the directory's path must be only letters, digits, "-", "." and "/": there is then nothing for an agent to mis-undo
    assert.match(real, /^[A-Za-z0-9/.-]+$/, `the agent's working directory ${real} has characters the CLI rewrites`)
    assert.notEqual(path.resolve(c.cwd), path.resolve(here, "../.."))
    assert.equal(c.autoMemory, "1")
    assert.equal(c.claudeMds, "1")
    const st = JSON.parse(c.settings)
    assert.equal(st.autoMemoryEnabled, false)
    assert.ok(st.hooks?.PreToolUse, "the local-Lean block is still in the settings")
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(fs.existsSync(c.cwd), false, "scratch directory left behind")
  })
  await check("the agent is confined by default: the CLI's restricted mode with a sandboxed shell, no bypass of permissions, no secret in its environment", async () => {
    const c = b.calls()[0]
    assert.ok(c.argv.includes("--restricted"))
    assert.ok(!c.argv.includes("--dangerously-skip-permissions"), "the first version's open shell is not the default")
    const tools = c.argv.slice(c.argv.indexOf("--tools") + 1, c.argv.indexOf("--tools") + 7)
    assert.deepEqual(tools, ["Bash", "Read", "Write", "Edit", "Glob", "Grep"])
    const allowed = c.argv.slice(c.argv.indexOf("--allowedTools") + 1).filter((a) => !a.startsWith("--"))
    assert.ok(allowed.includes("mcp__Leak_IV") && allowed.includes("mcp__Leak_I"), `the agent's own servers are named: ${allowed}`)
    const sb = JSON.parse(c.settings).sandbox
    assert.equal(sb.enabled, true)
    assert.equal(sb.failIfUnavailable, true)
    assert.equal(sb.network.strictAllowlist, true)
    assert.deepEqual(sb.filesystem.allowRead, [fs.realpathSync(path.dirname(c.cwd)) + path.sep + path.basename(c.cwd)])
    assert.match(c.appendSystem, /RUNS IN A SANDBOX/)
    assert.equal(c.env.BRIDGE_TOKEN, null, "the bridge's own token must not reach the agent: it could then drive the bridge")
    assert.equal(c.env.TEST_SECRET_TOKEN, null)
    assert.equal(c.env.ANTHROPIC_API_KEY, "sk-test", "the CLI's own credentials are kept")
  })
  await check("restricted: no shell tool at all, Bash banned by name, and the agent is told it has none", async () => {
    const r = await startBridge({ FAKE_MODE: "ok", LEAK_AGENT_CONTAINMENT: "restricted" })
    try {
      const f = await r.frames("control-honoured", { memory: { entries: seed } })
      assert.equal(done(f)?.verified, true)
      const c = r.calls()[0]
      assert.ok(c.argv.includes("--restricted") && !c.argv.includes("--tools") && !c.argv.includes("--dangerously-skip-permissions"))
      const banned = c.argv.slice(c.argv.indexOf("--disallowedTools") + 1).filter((a) => !a.startsWith("--"))
      assert.ok(banned.includes("Bash") && banned.includes("Task"))
      assert.equal(JSON.parse(c.settings).sandbox, undefined)
      assert.match(c.appendSystem, /YOU HAVE NO SHELL/)
      assert.doesNotMatch(c.promptFull, /Your shell \(/, "the prompt does not describe a shell the agent does not have")
    } finally {
      r.stop()
    }
  })
  await check("shell (the first version, kept to compare an arm against): bypass of permissions, the hook, and the whole environment", async () => {
    const r = await startBridge({ FAKE_MODE: "ok", LEAK_AGENT_CONTAINMENT: "shell", TEST_SECRET_TOKEN: "s3cret" })
    try {
      const f = await r.frames("control-honoured", { memory: { entries: seed } })
      assert.equal(done(f)?.verified, true)
      const c = r.calls()[0]
      assert.ok(c.argv.includes("--dangerously-skip-permissions") && !c.argv.includes("--restricted"))
      assert.ok(JSON.parse(c.settings).hooks?.PreToolUse)
      assert.equal(c.env.TEST_SECRET_TOKEN, "s3cret")
    } finally {
      r.stop()
    }
  })
  await check("a bridge without its containment module starts no isolated agent: it never falls back to the open shell", async () => {
    const dir = fs.mkdtempSync(path.join(tmp, "nocontain-"))
    for (const f of ["local-claude-bridge.mjs", "leak-memory.mjs", "leak-min-imports.mjs"]) fs.copyFileSync(path.join(here, "../../public", f), path.join(dir, f))
    const r = await startBridge({ FAKE_MODE: "ok", __bridge: path.join(dir, "local-claude-bridge.mjs") })
    try {
      const f = await r.frames("control-honoured", { memory: { entries: seed } })
      assert.equal(r.calls().length, 0, "the CLI must not be started")
      assert.notEqual(done(f)?.verified, true)
      assert.match(r.log(), /leak-containment\.mjs not loaded/)
      assert.match(texts(f).join(" | ") + JSON.stringify(f), /could not be started three times/, "the run says why it stopped, instead of retrying until the clock runs out")
    } finally {
      r.stop()
    }
  })
  await check("a CLI that exits at once on a flag it does not know is stopped after three tries, and its message is shown", async () => {
    const r = await startBridge({ FAKE_MODE: "die" })
    try {
      const f = await r.frames("control-honoured", { memory: { entries: seed } })
      assert.equal(r.calls().length, 3, "three tries, not one per second until the clock ends")
      assert.notEqual(done(f)?.verified, true)
      const all = JSON.stringify(f)
      assert.match(all, /unknown option '--restricted'/, "the CLI's own words reach the transcript")
      assert.match(all, /could not be started three times/)
    } finally {
      r.stop()
    }
  })
  // the single-agent endpoint (/prove-stream; /prove and the worker share its launch) is confined like the isolated agents
  const proveStream = async (r, options = {}) => {
    const res = await fetch(`http://127.0.0.1:${r.port}/prove-stream`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-token": "test-token", origin: "http://localhost:3000" },
      body: JSON.stringify({ theorem: THEOREM, mcpServers, model: "sonnet", options }),
    })
    return res.text()
  }
  await check("/prove-stream is confined by default: a scratch directory of its own (the request's working directory is ignored), the sandbox, a scrubbed environment", async () => {
    const wanted = fs.mkdtempSync(path.join(tmp, "wanted-"))
    const r = await startBridge({ FAKE_MODE: "ok", TEST_SECRET_TOKEN: "s3cret" })
    try {
      await proveStream(r, { workingDirectory: wanted })
      const c = r.calls()[0]
      assert.ok(c.argv.includes("--restricted") && !c.argv.includes("--dangerously-skip-permissions"))
      assert.match(path.basename(c.cwd), /^leak-agent-/)
      assert.notEqual(fs.realpathSync(path.dirname(c.cwd)) + path.sep + path.basename(c.cwd), fs.realpathSync(wanted), "a page must not choose what the agent may write")
      const st = JSON.parse(c.settings)
      assert.equal(st.sandbox.enabled, true)
      assert.equal(st.sandbox.network.strictAllowlist, true)
      assert.ok(c.argv.slice(c.argv.indexOf("--disallowedTools") + 1).includes("WebSearch"))
      assert.equal(c.env.BRIDGE_TOKEN, null)
      assert.equal(c.env.TEST_SECRET_TOKEN, null)
      assert.match(c.appendSystem, /RUNS IN A SANDBOX/)
      await new Promise((x) => setTimeout(x, 400))
      assert.equal(fs.existsSync(c.cwd), false, "scratch directory left behind")
    } finally {
      r.stop()
    }
  })
  await check("/prove-stream in shell mode is what it always was: bypass of permissions, the requested working directory, the whole environment", async () => {
    const wanted = fs.mkdtempSync(path.join(tmp, "wanted-"))
    const r = await startBridge({ FAKE_MODE: "ok", LEAK_AGENT_CONTAINMENT: "shell", TEST_SECRET_TOKEN: "s3cret" })
    try {
      await proveStream(r, { workingDirectory: wanted })
      const c = r.calls()[0]
      assert.ok(c.argv.includes("--dangerously-skip-permissions") && !c.argv.includes("--restricted"))
      assert.equal(fs.realpathSync(c.cwd), fs.realpathSync(wanted))
      assert.equal(c.env.TEST_SECRET_TOKEN, "s3cret")
    } finally {
      r.stop()
    }
  })
  await check("/prove-stream without the containment module starts no agent and says why", async () => {
    const dir = fs.mkdtempSync(path.join(tmp, "nocontain-"))
    for (const f of ["local-claude-bridge.mjs", "leak-memory.mjs", "leak-min-imports.mjs"]) fs.copyFileSync(path.join(here, "../../public", f), path.join(dir, f))
    const r = await startBridge({ FAKE_MODE: "ok", __bridge: path.join(dir, "local-claude-bridge.mjs") })
    try {
      const text = await proveStream(r)
      assert.equal(r.calls().length, 0, "the CLI must not be started")
      assert.match(text, /leak-containment\.mjs is missing/)
    } finally {
      r.stop()
    }
  })
  await check("an agent that is not isolated (a strategy's node prover) is confined too, in its own scratch directory", async () => {
    const r = await startBridge({ FAKE_MODE: "ok", TEST_SECRET_TOKEN: "s3cret" })
    try {
      await r.frames("control-oneshot", {})
      const calls = r.calls()
      assert.ok(calls.length >= 1)
      for (const c of calls) {
        assert.ok(c.argv.includes("--restricted") && !c.argv.includes("--dangerously-skip-permissions"), JSON.stringify(c.argv.slice(0, 12)))
        assert.match(path.basename(c.cwd), /^leak-agent-/)
        assert.equal(c.env.TEST_SECRET_TOKEN, null)
        assert.equal(c.env.BRIDGE_TOKEN, null)
      }
    } finally {
      r.stop()
    }
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
  await check("the default voice is the curious one: the question is the agent's own, lab notes close each stretch, nothing calls it open", async () => {
    const b = await startBridge({ FAKE_MODE: "ok" })
    try {
      for (const v of ["control-honoured", "control-lucid-iv"]) {
        const p = promptOf(await b.frames(v, { memory: { entries: seed }, mcpServers: withLeakII })).prompt
        assert.match(p, /voice curious/, v)
        assert.match(p, /WHO YOU ARE HERE/, v)
        assert.match(p, /THE QUESTION IS YOURS NOW/, v)
        assert.match(p, /YOUR LAB NOTES[\s\S]*NOTE: <[\s\S]*NEXT: </, v)
        assert.match(p, /OUR INSTRUMENT IS PROOF, NOT SEARCH/, v)
        assert.match(p, /THE INSTRUMENTS, AND HOW STRONG THEY ARE/, v)
        assert.match(p, /NO NETWORK beyond the Leak servers/, v)
        assert.doesNotMatch(p, /STANDING ORDER|ORDER:|open problem|Never conclude the target is|Never stop on your own/, v)
        assert.ok(p.indexOf("WHO YOU ARE HERE") < p.indexOf("THE LOOP"), `${v}: the voice comes first`)
      }
    } finally {
      b.stop()
    }
  })
  await check("the order voice is still there when asked for (options.voice): standing order, stuck playbook, no-churning rule", async () => {
    const b = await startBridge({ FAKE_MODE: "ok" })
    try {
      for (const v of ["control-honoured", "control-flint", "control-paragon", "control-lucid", "control-flint-iv"]) {
        const p = promptOf(await b.frames(v, { memory: { entries: seed }, mcpServers: withLeakII, voice: "order" })).prompt
        assert.match(p, /voice order/, v)
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
      assert.match(mem, /OUR INSTRUMENT IS PROOF, NOT SEARCH[\s\S]*NO NETWORK[\s\S]*LOCAL LEAN IS NOT AVAILABLE/, "the rule comes before the machine note it overrides")
      assert.doesNotMatch(plain, /NO BRUTE FORCE|OUR INSTRUMENT IS PROOF/, "the baseline's system prompt is untouched")
      assert.match(plain, /blocks network fetches and installs/, "every isolated run is told about the network block")
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
      assert.match(first, /^PROMPT TO THE AGENT — \[CONTROL IV MEMORY — Control IV Honoured · voice curious · attempt 1\]/)
      assert.match(first, /WHO YOU ARE HERE/)
      assert.match(first, /Theorem \(its signature is immutable/)
      assert.match(first, /SYSTEM PROMPT ADDENDUM[\s\S]*OUR INSTRUMENT IS PROOF[\s\S]*LOCAL LEAN IS NOT AVAILABLE/)
      assert.ok(first.length > 6000, "the whole prompt, not an excerpt: " + first.length)
      const nudge = prompts.find((t) => /reminder 1 of 2/.test(t))
      assert.match(nudge, /^PROMPT TO THE AGENT \(follow-up\) — /)
      assert.match(nudge, /That was a short stretch/)
      assert.match(nudge, /Your NEXT was: fake next step/, "the agent's own note is handed back")
      assert.match(nudge, /Leak II/)
      assert.doesNotMatch(nudge, /ORDER|open/)
      const said = lines.map((o) => o.text).filter((t) => /^TEXT — 🧠 Not done/.test(t))
      assert.ok(said.length && said.every((t) => /NEXT: fake next step, try the small case\./.test(t)), "the agent's whole text is on disk, not an excerpt: " + JSON.stringify(said))
      assert.ok(!lines.some((o) => /run prompt captured/.test(o.text) && /memory/i.test(o.text)), "no stand-in line where a prompt should be")
    } finally {
      b.stop()
    }
  })
}

// ---- the verifier guard: a memory run's scripts pass through the bridge on their way to Leak IV ----
{
  const BIG = "open Nat in\ntheorem E396_k4 : (45153 : ℕ).descFactorial 5 ∣ (45153 : ℕ).centralBinom := by\n  decide +kernel"
  await check("a script that asks the kernel to evaluate a large numeral is refused by the bridge and never reaches the verifier", async () => {
    const before = leak.calls.length
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_VERIFY_VIA_MCP: "1", FAKE_TARGET_PROOF: BIG, FAKE_LEMMA: "0" })
    try {
      const f = await b.frames("control-honoured", { memory: { entries: [] }, computeBudgetMs: 4000 })
      const results = f.filter((x) => x.subtype === "tool_result").map((x) => String(x.output || ""))
      const refused = results.find((t) => /Refused before compiling/.test(t))
      assert.ok(refused, "the agent saw the refusal: " + results.join(" | ").slice(0, 400))
      assert.match(refused, /45153/)
      assert.match(refused, /\[tools: [^\]]*verify_full_script/, "the proxied verifier lists its tool")
      assert.notEqual(done(f)?.verified, true)
      const sent = leak.calls.slice(before).filter((c) => c.tool === "verify_full_script" && /45153/.test(JSON.stringify(c.args)))
      assert.equal(sent.length, 0, "nothing reached the fake Leak IV")
    } finally {
      b.stop()
    }
  })
  // what the guards refused is part of the run's record: how often an agent reaches for a kernel evaluation, a local toolchain or the network is
  // evidence for what each guard is worth
  const endLine = async (home) => {
    const dir = path.join(home, ".leak-runs")
    for (let i = 0; i < 60; i++) {
      const f = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl") && n !== "index.jsonl").sort().pop() : null
      const lines = f ? fs.readFileSync(path.join(dir, f), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []
      const end = lines.find((l) => l.kind === "end")
      if (end) return end
      await new Promise((r) => setTimeout(r, 100))
    }
    return null
  }
  await check("the run record counts what the verifier guard refused", async () => {
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_VERIFY_VIA_MCP: "1", FAKE_TARGET_PROOF: BIG, FAKE_LEMMA: "0" })
    try {
      await b.frames("control-honoured", { memory: { entries: [] }, computeBudgetMs: 4000 })
      const end = await endLine(b.home)
      assert.ok(end, "an end line")
      assert.ok(end.memory_run.guards.kernel_eval_refused >= 1, JSON.stringify(end.memory_run.guards))
    } finally {
      b.stop()
    }
  })
  await check("the run record counts what the hook blocked, by kind, and not what it let through", async () => {
    const tries = ["lake build", "cd x && lean f.lean", "curl https://example.com/a", "pip install sympy", "git clone https://x/y", "ls -la", "python3 -c 'print(2+2)'"]
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_BASH_TRY: JSON.stringify(tries), FAKE_LEMMA: "0" })
    try {
      await b.frames("control-honoured", { memory: { entries: [] }, computeBudgetMs: 4000 })
      const end = await endLine(b.home)
      assert.ok(end, "an end line")
      const blocked = end.memory_run.guards.hook_blocked
      assert.equal(blocked.lean, 2, JSON.stringify(blocked))
      assert.equal(blocked.network, 3, JSON.stringify(blocked))
      assert.deepEqual(Object.keys(blocked).sort(), ["lean", "network"], "ls and python are not blocked and not counted")
    } finally {
      b.stop()
    }
  })
  await check("a run that tried nothing says so", async () => {
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_LEMMA: "0" })
    try {
      await b.frames("control-honoured", { memory: { entries: [] } })
      const end = await endLine(b.home)
      assert.deepEqual(end.memory_run.guards, { kernel_eval_refused: 0, containment: "sandbox", hook_blocked: {} })
    } finally {
      b.stop()
    }
  })
  await check("an ordinary script goes through the proxy to the verifier and its answer comes back unchanged", async () => {
    const before = leak.calls.length
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_VERIFY_VIA_MCP: "1", FAKE_LEMMA: "0" })
    try {
      const f = await b.frames("control-honoured", { memory: { entries: [] } })
      const results = f.filter((x) => x.subtype === "tool_result").map((x) => String(x.output || ""))
      assert.ok(results.some((t) => /Compilation Successful/.test(t)), results.join(" | ").slice(0, 300))
      assert.equal(done(f)?.verified, true)
      const sent = leak.calls.slice(before).filter((c) => c.tool === "verify_full_script" && /target_fake/.test(JSON.stringify(c.args)))
      assert.ok(sent.length >= 1, "the fake Leak IV received the script through the proxy")
    } finally {
      b.stop()
    }
  })
  await check("plain Control II is not proxied: its verifier stays direct", async () => {
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_VERIFY_VIA_MCP: "1", FAKE_TARGET_PROOF: BIG, FAKE_LEMMA: "0" })
    try {
      const f = await b.frames("control-oneshot-2", { computeBudgetMs: 4000 })
      const results = f.filter((x) => x.subtype === "tool_result").map((x) => String(x.output || ""))
      assert.ok(!results.some((t) => /Refused before compiling/.test(t)), "the baseline is untouched")
    } finally {
      b.stop()
    }
  })
  // Leak IV appends the exact compiled bytes of a successful script as a base64 marker, for the proof gate. The agent has no use for it and
  // it stayed in its context for every later call (153 replies, about 300 kB, in a 3-hour run).
  await check("the agent gets Leak IV's reply without the base64 marker, and the proof gate still stores the bytes the daemon compiled", async () => {
    leak.setMarker(true)
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_VERIFY_VIA_MCP: "1", FAKE_LEMMA: "0" })
    try {
      const f = await b.frames("control-honoured", { memory: { entries: [] }, targetId: "fake-1" })
      const results = f.filter((x) => x.subtype === "tool_result").map((x) => String(x.output || ""))
      assert.ok(results.some((t) => /Compilation Successful/.test(t)), results.join(" | ").slice(0, 300))
      assert.ok(!results.some((t) => /LEAK_NORMALIZED|[A-Za-z0-9+\/=]{120,}/.test(t)), "base64 reached the agent: " + results.join(" | ").slice(0, 400))
      assert.equal(done(f)?.verified, true)
      const dir = path.join(b.home, ".leak-runs")
      let lean = ""
      for (let i = 0; i < 60 && !lean; i++) {
        const l = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => n.endsWith(".lean")) : null
        if (l) lean = fs.readFileSync(path.join(dir, l), "utf8")
        else await new Promise((r) => setTimeout(r, 100))
      }
      assert.match(lean, /^import Mathlib\n/, "the stored proof is what the daemon compiled (import-complete), taken from the proxy's copy: " + lean.slice(0, 80))
      assert.match(lean, /theorem target_fake/)
    } finally {
      b.stop()
      leak.setMarker(false)
    }
  })
}

// ---- what a reminder carries: the temperament card, the Leak I check-in, a question that rotates, the agent's own mid-stretch note ----
{
  const remindOnce = async (b, extra, want) => {
    const ctl = new AbortController()
    const p = b.post("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 2, ...extra }, { signal: ctl.signal }).then((r) => r.text()).catch(() => "")
    for (let i = 0; i < 100 && b.calls().length < want; i++) await new Promise((r) => setTimeout(r, 100))
    ctl.abort()
    await p
    assert.ok(b.calls().length >= want, `only ${b.calls().length} CLI calls`)
    return b.calls()
  }
  {
    const b = await startBridge({ FAKE_MODE: "stubborn", FAKE_MIDNOTE: "1" })
    await check("every reminder carries the temperament card and the Leak I check-in with the run's own count; the question changes each time though the library does not; a note written mid-stretch is handed back", async () => {
      const calls = await remindOnce(b, {}, 6)
      for (const i of [1, 2, 3, 4, 5]) {
        assert.ok(calls[i].promptFull.includes(TEMPERAMENT_CARD), `reminder ${i} lacks the card`)
        assert.match(calls[i].promptFull, /Leak I check-in: no searches so far this run\./, `reminder ${i}: nobody searched`)
        assert.match(calls[i].promptFull, /(Your NEXT was: |\nNEXT: )the mid-stretch next\./, `reminder ${i}: the note written before the last message of the stretch`)
      }
      const asked = calls.slice(1, 6).map((c) => (/let the compiler answer what it can: ([^\n]+?) Put what you find in Lean/.exec(c.promptFull) || /in case it is useful: ([^\n]+)/.exec(c.promptFull))[1])
      assert.equal(new Set(asked).size, 5, "five reminders, five different questions: " + JSON.stringify(asked))
      assert.doesNotMatch(calls[1].promptFull, /GUIDE|LINE OF ATTACK/, "a target without a guide carries none")
    })
    b.stop()
  }
  {
    const b = await startBridge({ FAKE_MODE: "stubborn", FAKE_SEARCHES: "3" })
    await check("an agent that has just searched Leak I is not told about it", async () => {
      const calls = await remindOnce(b, {}, 3)
      assert.doesNotMatch(calls[1].promptFull, /Leak I check-in/)
      assert.ok(calls[1].promptFull.includes(TEMPERAMENT_CARD))
    })
    b.stop()
  }
}

// ---- the agent stops early ----
{
  const b = await startBridge({ FAKE_MODE: "giveup" })
  await check("an agent that gives up in seconds is resumed in the same conversation, and then proves the target", async () => {
    const f = await b.frames("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 2 })
    const calls = b.calls()
    assert.equal(calls[0].resume, null)
    assert.equal(calls[1].resume, calls[0].session, "the nudge resumes the session that stopped")
    assert.match(calls[1].prompt, /That was a short stretch/)
    assert.match(calls[1].prompt, /verify_full_script/)
    assert.match(calls[1].prompt, /Your NEXT was: fake next step/)
    assert.ok(texts(f).some((t) => /stopped after .* minute/i.test(t)), "the run says it nudged: " + texts(f).join(" | "))
    assert.equal(done(f)?.verified, true)
    const stats = f.filter((x) => x.type === "memory" && x.op === "stats").pop()
    assert.equal(stats.stats.nudges, 1)
  })
  b.stop()
}
// ---- a target's guide (its written line of attack): only when the agent is reminded to keep going ----
const GUIDE = {
  intro: "GUIDE-INTRO.",
  notation: "GUIDE-NOTATION.",
  steps: [
    { id: "G1", tag: "holds", title: "Alpha", says: "GUIDE-SAYS-ONE.", why: "GUIDE-WHY-ONE.", lean: ["guide_seed_lemma"] },
    { id: "G2", tag: "hole", title: "Beta", says: "GUIDE-SAYS-TWO.", why: "GUIDE-WHY-TWO.", fill: "GUIDE-FILL-TWO." },
  ],
  next: ["GUIDE-MOVE-ONE."],
}
const GUIDE_SEED = "theorem guide_seed_lemma : 2 + 2 = 4 := by\n  norm_num"
{
  const b = await startBridge({ FAKE_MODE: "giveup" })
  await check("the guide is not in the opening prompt; the reminder after a short stretch carries it, with the Lean names the seeds make true", async () => {
    const f = await b.frames("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 2, guide: GUIDE, seeds: [GUIDE_SEED] })
    const calls = b.calls()
    assert.equal(calls[0].resume, null)
    assert.doesNotMatch(calls[0].promptFull, /GUIDE-|A LINE OF ATTACK/, "the opening prompt is the question and the agent's own ideas")
    assert.doesNotMatch(calls[0].appendSystem || "", /GUIDE-|A LINE OF ATTACK/)
    assert.equal(calls[1].resume, calls[0].session)
    for (const s of ["A LINE OF ATTACK", "NOTATION. GUIDE-NOTATION.", "G1 [holds] Alpha. GUIDE-SAYS-ONE. Why: GUIDE-WHY-ONE.", "Lean (in your library): guide_seed_lemma.", "G2 [hole] Beta. GUIDE-SAYS-TWO.", "What is settled, and what to try: GUIDE-FILL-TWO.", "MOVES THIS SUGGESTS. 1. GUIDE-MOVE-ONE."]) assert.ok(calls[1].promptFull.includes(s), `the reminder lacks: ${s}`)
    const prompts = f.filter((x) => x.type === "prompt")
    assert.ok(prompts.filter((x) => x.kind !== "followup").every((x) => !/GUIDE-/.test(x.prompt)), "the console's opening prompt has no guide")
    assert.ok(prompts.filter((x) => x.kind === "followup").some((x) => /GUIDE-SAYS-ONE/.test(x.prompt)), "the console shows the reminder with the guide")
    assert.equal(done(f)?.verified, true)
  })
  await check("a run started without the target's seeds gets the steps but not the Lean names that would not exist in its library", async () => {
    const before = b.calls().length
    await b.frames("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 2, guide: GUIDE })
    const c = b.calls()[before + 1]
    assert.match(c.promptFull, /G1 \[holds\] Alpha\. GUIDE-SAYS-ONE\./)
    assert.doesNotMatch(c.promptFull, /guide_seed_lemma|Lean \(in your library\)|Lean names under a step/)
  })
  await check("a malformed guide is not used, and the run says so", async () => {
    const before = b.calls().length
    const f = await b.frames("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 2, guide: { steps: "nonsense" } })
    assert.doesNotMatch(b.calls()[before + 1].promptFull, /A LINE OF ATTACK/)
    assert.ok(texts(f).some((t) => /target's guide was not used/.test(t)), texts(f).join(" | "))
  })
  b.stop()
}
{
  // A reminder carries the guide in full on the first reminder of a conversation and again every `guideEvery`-th; between them a short pointer
  // (a 3-hour run was reminded 202 times and half of everything in its conversation was the guide repeated in full).
  const remind = async (b, extra, want = 4) => {
    const ctl = new AbortController()
    const p = b.post("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 2, guide: GUIDE, seeds: [GUIDE_SEED], ...extra }, { signal: ctl.signal }).then((r) => r.text()).catch(() => "")
    for (let i = 0; i < 100 && b.calls().length < want; i++) await new Promise((r) => setTimeout(r, 100))
    ctl.abort()
    await p
    const calls = b.calls()
    assert.ok(calls.length >= want, `only ${calls.length} CLI calls`)
    return calls
  }
  const full = (c) => /A LINE OF ATTACK/.test(c.promptFull) && /GUIDE-SAYS-TWO/.test(c.promptFull)
  const pointer = (c) => /THE LINE OF ATTACK \(G1 to G2\), written out in full earlier in this conversation/.test(c.promptFull) && !/GUIDE-SAYS-/.test(c.promptFull) && !/A LINE OF ATTACK/.test(c.promptFull)
  {
    const b = await startBridge({ FAKE_MODE: "stubborn" })
    await check("by default the first reminder carries the guide in full and the ones after it a short pointer; the opening prompt never carries either", async () => {
      const calls = await remind(b, {})
      assert.doesNotMatch(calls[0].promptFull, /GUIDE-|LINE OF ATTACK/, "the opening prompt")
      assert.ok(full(calls[1]), "the first reminder: the guide in full")
      assert.ok(pointer(calls[2]), "the second reminder: the pointer, " + calls[2].promptFull.slice(-600))
      assert.ok(pointer(calls[3]), "the next resumed attempt: the pointer too")
      assert.match(calls[2].promptFull, /Where it needs work: G2 Beta\./, "the pointer says where the plan needs work")
      assert.ok(calls[2].promptFull.length < calls[1].promptFull.length, "and it is shorter")
    })
    b.stop()
  }
  {
    const b = await startBridge({ FAKE_MODE: "stubborn" })
    await check("guideEvery 2 sends the full text again at the third reminder; guideEvery 1 is the full text every time", async () => {
      const calls = await remind(b, { guideEvery: 2 })
      assert.deepEqual([1, 2, 3].map((i) => (full(calls[i]) ? "full" : pointer(calls[i]) ? "pointer" : "neither")), ["full", "pointer", "full"])
      await new Promise((r) => setTimeout(r, 500)) // the aborted run has stopped calling the CLI
      const before = b.calls().length
      const all = await remind(b, { guideEvery: 1 }, before + 4)
      for (const i of [1, 2, 3]) assert.ok(full(all[before + i]), `guideEvery 1: reminder ${i} carries the full guide`)
    })
    b.stop()
  }
}
{
  const b = await startBridge({ FAKE_MODE: "lose" })
  await check("a session that cannot be resumed starts a new conversation with the opening prompt, which has no guide: that is not a reminder", async () => {
    const ctl = new AbortController()
    const p = b.post("control-honoured", { memory: { entries: [] }, minAttemptMs: 600000, maxNudges: 1, guide: GUIDE, seeds: [GUIDE_SEED] }, { signal: ctl.signal }).then((r) => r.text()).catch(() => "")
    for (let i = 0; i < 100 && b.calls().length < 3; i++) await new Promise((r) => setTimeout(r, 100))
    ctl.abort()
    await p
    const calls = b.calls()
    assert.deepEqual(calls.slice(0, 3).map((c) => c.resume !== null), [false, true, false])
    assert.match(calls[1].promptFull, /GUIDE-SAYS-TWO/, "the reminder before it had the guide")
    assert.match(calls[2].promptFull, /could not be resumed/)
    assert.doesNotMatch(calls[2].promptFull, /GUIDE-|A LINE OF ATTACK/)
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
    assert.match(calls[3].prompt, /same session \(attempt 2\)|attempt 2 of the SAME session/)
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
    assert.match(calls[1].prompt, /same session \(attempt 2\)|attempt 2 of the SAME session/)
    assert.match(calls[2].prompt, /same session \(attempt 3\)|attempt 3 of the SAME session/)
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
  const json = JSON.stringify([{ name: "factorization_centralBinom_eq_card", script: SLEEP_SCRIPT_STRICT, subsumes: ids, why: "one counting identity" }])
  const b = await startBridge({ FAKE_MODE: "ok", FAKE_SLEEP_JSON: json, FAKE_LIST: "1" })
  await check("sleep: each merged entry is updated once, the new lemmas are saved once each, and the merged entries leave the list", async () => {
    const f = await b.frames("control-lucid", { memory: { entries: olds.map((e) => ({ ...e })) }, sleepEveryMs: 0, sleepMinNew: 1 })
    assert.ok(texts(f).some((t) => /Dream: 1 group\(s\) studied, 1 general lemma\(s\) added/.test(t)), texts(f).join(" | "))
    assert.ok(texts(f).some((t) => /Dream done in \d+ min: rated 1, merged 4 theorem\(s\) into 1 general lemma\(s\), put away 0 rated one or two stars\. The agent now sees 1 of 5 \(4 merged, 0 rated low\)/.test(t)), texts(f).join(" | "))
    const fullIds = olds.map((e) => e.id)
    for (const id of fullIds) {
      const n = f.filter((x) => x.type === "memory" && x.op === "update" && x.entry?.id === id).length
      assert.equal(n, 1, `entry ${id.slice(0, 8)} updated ${n} times`)
      assert.ok(f.find((x) => x.op === "update" && x.entry?.id === id).entry.subsumedBy, "and it says what replaced it")
    }
    const saves = f.filter((x) => x.type === "memory" && x.op === "save" && x.entry?.origin === "abstracted")
    assert.equal(saves.length, 1, "the general lemma is saved once, and its corollaries are not saved at all")
    assert.ok(!f.some((x) => x.type === "memory" && x.op === "save" && /_cor\b/.test(x.entry?.name || "")))
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

// ---- Lucid rates theorems as it sleeps ----
// The second job of the sleep stage: every theorem with no rating gets one (public/leak-quality.mjs): features, two questions put to Leak IV, and
// a model's reading. The rating rides in the entry, so the page saves it like any other update.
{
  const m = new Memory({})
  const easy = m.addScript("theorem easy_comm (a b : ℕ) : a + b = b + a := by\n  omega", { attempt: 1, keepTrivial: true })
  const real = OLD.flatMap((s) => m.addScript(s, { attempt: 1 }))
  const entries = [...easy, ...real].map((e) => ({ ...e }))
  const notes = (f) => f.filter((x) => x.type === "message-annotation" && x.thought).map((x) => x.thought) // status and error notes
  const quality = (f, id) => f.filter((x) => x.type === "memory" && x.op === "update" && x.entry?.id === id && x.entry.quality).map((x) => x.entry.quality)
  const b = await startBridge({ FAKE_MODE: "ok", FAKE_SLEEP_JSON: "[]" })
  let rated
  await check("sleep rates the theorems that have no rating: one update each, the easy one capped at one star, the rest read as solid lemmas", async () => {
    const f = await b.frames("control-lucid", { memory: { entries }, sleepEveryMs: 0, sleepMinNew: 1 })
    assert.ok(texts(f).some((t) => new RegExp(`Rated ${entries.length} of ${entries.length}`).test(t)), texts(f).join(" | "))
    for (const e of entries) assert.equal(quality(f, e.id).length, 1, `${e.name} was rated ${quality(f, e.id).length} times`)
    const easyQ = quality(f, easy[0].id)[0]
    assert.equal(easyQ.s, 1)
    assert.equal(easyQ.c, 1, "a one-line tactic closed it")
    for (const e of real) {
      const q = quality(f, e.id)[0]
      assert.ok(q.s >= 2 && q.s <= 3, `${e.name}: ${q.s}`)
      assert.ok(!q.c && !q.l)
      assert.equal(q.k, "general-lemma")
      assert.deepEqual([q.d, q.g, q.w], [3, 3, 2])
    }
    assert.match(quality(f, real[0].id)[0].r, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(quality(f, real[0].id)[0].rv, 1)
    // the reading was asked of a model with the target, and it was asked for no tool
    assert.ok(b.calls().some((c) => /You are reviewing theorems that an automated prover banked/.test(c.prompt) && c.prompt.includes("target_fake")))
    rated = f.filter((x) => x.type === "memory" && x.op === "update" && x.entry?.quality).map((x) => x.entry)
  })
  await check("a theorem that already has a rating is not rated again", async () => {
    const f = await b.frames("control-lucid", { memory: { entries: rated }, sleepEveryMs: 0, sleepMinNew: 1 })
    assert.ok(!f.some((x) => x.type === "memory" && x.op === "update" && x.entry?.quality && x.entry.id === rated[0].id), "a rated entry was rated again")
    assert.ok(!texts(f).some((t) => /Rating \d+ saved/.test(t)))
  })
  b.stop()

  // what rates one or two stars is put away: the agent that runs after the dream does not see it, and the dream says so
  const bLow = await startBridge({ FAKE_MODE: "ok", FAKE_SLEEP_JSON: "[]", FAKE_LIST: "1", FAKE_READING: JSON.stringify({ depth: 1, generality: 1, role: 0 }) })
  await check("the dream puts away the theorems it rates one or two stars: the agent no longer sees them, and the run says how many", async () => {
    const f = await bLow.frames("control-lucid", { memory: { entries: real.map((e) => ({ ...e })) }, sleepEveryMs: 0, sleepMinNew: 1 })
    for (const e of real) assert.equal(quality(f, e.id)[0].s, 1, `${e.name} is rated one star`)
    assert.ok(texts(f).some((t) => /Dream done in \d+ min: rated 4, merged 0 theorem\(s\) into 0 general lemma\(s\), put away 4 rated one or two stars\. The agent now sees 0 of 4 \(0 merged, 4 rated low\)/.test(t)), texts(f).join(" | "))
    const listing = f.filter((x) => x.subtype === "tool_result" && /Memory is empty|verified theorem\(s\) saved/.test(x.output || "")).pop()?.output || ""
    assert.match(listing, /Memory is empty/, "nothing is left to list")
    assert.ok(!f.some((x) => x.type === "memory" && x.op === "save" && x.entry?.origin === "abstracted"), "and nothing was merged")
  })
  bLow.stop()

  // a numeric fact is rated at once, with no reading and no question to the verifier; the rest still wait for their reading
  const bMech = await startBridge({ FAKE_MODE: "ok", FAKE_SLEEP_JSON: "[]" })
  await check("a numeric fact is rated two stars at once, without being read; the others are read as before", async () => {
    const mm = new Memory({})
    const ground = mm.addScript("theorem ground_two_plus_two : 2 + 2 = 4 := by\n  norm_num", { attempt: 1, keepTrivial: true })
    const f = await bMech.frames("control-lucid", { memory: { entries: [...ground, ...real].map((e) => ({ ...e })) }, sleepEveryMs: 0, sleepMinNew: 1 })
    assert.ok(texts(f).some((t) => /1 numeric fact\(s\) and repeat\(s\) rated at once, without a reading/.test(t)), texts(f).join(" | "))
    const q = quality(f, ground[0].id)
    assert.equal(q.length, 1, "rated once")
    assert.equal(q[0].s, 2)
    assert.equal(q[0].n, 1, "and the rating says why: a numeric fact")
    assert.ok(!q[0].c && !q[0].l && q[0].d === undefined, "no probe and no reading stands behind it")
    const readings = bMech.calls().filter((c) => /You are reviewing theorems that an automated prover banked/.test(c.promptFull))
    assert.ok(readings.length > 0)
    assert.ok(readings.every((c) => !c.promptFull.includes(ground[0].id)), "it was never put to a reader")
    assert.ok(readings.some((c) => c.promptFull.includes(real[0].id)), "the others were")
    for (const e of real) assert.equal(quality(f, e.id).length, 1)
  })
  bMech.stop()

  // the tactic test is checked before it is trusted
  const leak2 = await startFakeLeak({ brokenBattery: true })
  const servers2 = [{ name: "Leak_IV", url: `http://127.0.0.1:${leak2.port}/iv/sse`, tools: ["verify_full_script"] }, { name: "Leak_I", url: `http://127.0.0.1:${leak2.port}/i/sse`, tools: [{ name: "moogle_search", args: ["concept"] }] }]
  const b2 = await startBridge({ FAKE_MODE: "ok", FAKE_SLEEP_JSON: "[]" })
  await check("a tactic test that closes nothing, not even an easy truth, stops the rating pass and says so; the run goes on", async () => {
    const f = await b2.frames("control-lucid", { memory: { entries }, mcpServers: servers2, sleepEveryMs: 0, sleepMinNew: 1 })
    assert.ok(notes(f).some((t) => /Rating skipped: the tactic test failed its own check/.test(t)), notes(f).join(" | "))
    assert.ok(!f.some((x) => x.type === "memory" && x.op === "update" && x.entry?.quality))
    assert.ok(f.some((x) => x.type === "done"), "the run still ended")
  })
  b2.stop()
  leak2.close()

  // a bridge without the module still sleeps
  const dir = fs.mkdtempSync(path.join(tmp, "noquality-"))
  for (const f of ["local-claude-bridge.mjs", "leak-memory.mjs", "leak-min-imports.mjs", "leak-containment.mjs"]) fs.copyFileSync(path.join(here, "../../public", f), path.join(dir, f))
  const b3 = await startBridge({ FAKE_MODE: "ok", FAKE_SLEEP_JSON: "[]", __bridge: path.join(dir, "local-claude-bridge.mjs") })
  await check("a bridge without leak-quality.mjs says the rating was skipped and carries on", async () => {
    const f = await b3.frames("control-lucid", { memory: { entries }, sleepEveryMs: 0, sleepMinNew: 1 })
    assert.ok(notes(f).some((t) => /Rating skipped: leak-quality\.mjs is missing/.test(t)), notes(f).join(" | "))
    assert.ok(!f.some((x) => x.type === "memory" && x.op === "update" && x.entry?.quality))
    assert.ok(f.some((x) => x.type === "done"))
  })
  b3.stop()
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
    assert.match(calls[2].promptFull, /THE LOOP/)
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

// ---- a yes-or-no question: the statement proves it, its negation proves it, nothing else counts ----
// The target is the plain statement P (formal-conjectures' @[question] form); the old free slot `(sorry : Prop) ↔ P` is repudiated.
{
  const QUESTION = "theorem question_fake : ∀ a : ℕ, a + 0 = a := by\n  sorry"
  const proofs = {
    yes: "theorem question_fake : ∀ a : ℕ, a + 0 = a := by\n  simp",
    yesParen: "theorem question_fake : (∀ a : ℕ, a + 0 = a) := by\n  simp",
    no: "theorem question_fake : ¬ (∀ a : ℕ, a + 0 = a) := by\n  intro h\n  sorry",
    noBare: "theorem question_fake : ¬ ∀ a : ℕ, a + 0 = a := by\n  intro h\n  sorry",
    noNamed: "theorem question_fake_neg : ¬ (∀ a : ℕ, a + 0 = a) := by\n  intro h\n  sorry",
    slotTrue: "theorem question_fake : True ↔ (∀ a : ℕ, a + 0 = a) := by\n  simp",
    slotFalse: "theorem question_fake : (False : Prop) ↔ (∀ a : ℕ, a + 0 = a) := by\n  simp",
    same: "theorem question_fake : (∀ a : ℕ, a + 0 = a) ↔ (∀ a : ℕ, a + 0 = a) := by\n  exact Iff.rfl",
    changed: "theorem question_fake : ∀ a : ℕ, a + 1 = a + 1 := by\n  simp",
    otherName: "theorem something_else : ∀ a : ℕ, a + 0 = a := by\n  simp",
  }
  const run = async (key, { strategy = "control-honoured", question = "yes-no", theorem = QUESTION } = {}) => {
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_TARGET_PROOF: proofs[key], FAKE_LEMMA: "0" })
    try {
      const f = await b.frames(strategy, { theorem, question, memory: { entries: [] }, computeBudgetMs: /^(yes|no)/.test(key) ? 120000 : 4000 })
      return { f, calls: b.calls(), t: texts(f), done: f.find((x) => x.type === "done"), home: b.home }
    } finally {
      b.stop()
    }
  }
  await check("a question: the statement as given counts as proved, and the run says so", async () => {
    const r = await run("yes")
    assert.ok(r.t.some((x) => /closed it on attempt 1.*Answer True: the statement is PROVED/.test(x)), r.t.join(" | "))
    assert.equal(r.done.verified, true)
  })
  await check("the statement in parentheses also counts", async () => {
    assert.equal((await run("yesParen")).done.verified, true)
  })
  for (const key of ["no", "noBare", "noNamed"]) {
    await check(`a question: its negation counts as proved, and the run says DISPROVED (${key})`, async () => {
      const r = await run(key)
      assert.ok(r.t.some((x) => /Answer False: the statement is DISPROVED/.test(x)), r.t.join(" | "))
      assert.equal(r.done.verified, true)
    })
  }
  await check("plain Control II takes either answer too", async () => {
    const r = await run("no", { strategy: "control-oneshot-2" })
    assert.equal(r.done.verified, true, r.t.join(" | "))
  })
  for (const key of ["slotTrue", "slotFalse", "same", "changed", "otherName"]) {
    await check(`the repudiated slot form and other statements do not count (${key})`, async () => {
      const r = await run(key)
      assert.notEqual(r.done?.verified, true, "the gate accepted it")
      assert.ok(!r.t.some((x) => /closed it on attempt/.test(x)), r.t.join(" | "))
    })
  }
  await check("a negation without parentheses counts only for a quantified statement: ¬ A ∧ B is (¬ A) ∧ B", async () => {
    const stmt = "theorem conj_fake : (1 = 1) ∧ (2 = 2) := by\n  sorry"
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_TARGET_PROOF: "theorem conj_fake : ¬ (1 = 1) ∧ (2 = 2) := by\n  sorry", FAKE_LEMMA: "0" })
    try {
      const f = await b.frames("control-honoured", { theorem: stmt, question: "yes-no", memory: { entries: [] }, computeBudgetMs: 4000 })
      assert.notEqual(f.find((x) => x.type === "done")?.verified, true, "(¬ A) ∧ B was taken for ¬ (A ∧ B)")
    } finally {
      b.stop()
    }
  })
  await check("the agent is shown the plain statement and told its negation also settles it; the slot form never reaches it", async () => {
    const r = await run("yes")
    const tail = r.calls[0].promptTail
    assert.match(tail, /THIS TARGET IS A YES-OR-NO QUESTION[\s\S]*its negation[\s\S]*Leak IV rejects that form/)
    assert.match(tail, /Theorem \(its signature is immutable, but its negation settles it as well\):\s*theorem question_fake : ∀ a : ℕ, a \+ 0 = a/)
    assert.ok(!/\(sorry : Prop\)/.test(r.calls[0].promptFull.replace(/\(… : Prop\)/g, "")), "the internal tag reached the agent")
    const b = await startBridge({ FAKE_MODE: "ok" })
    try {
      await b.frames("control-honoured", { memory: { entries: [] } })
      assert.ok(!/YES-OR-NO QUESTION/.test(b.calls()[0].promptTail), "a plain target got the question note")
    } finally {
      b.stop()
    }
  })
  await check("a request that asks for a question with binders before the colon is refused", async () => {
    const b = await startBridge({ FAKE_MODE: "ok" })
    try {
      await assert.rejects(b.post("control-honoured", { theorem: "theorem needs_binders (n : ℕ) : n = n := by\n  sorry", question: "yes-no" }), /HTTP 400[\s\S]*question_target_needs_a_closed_statement/)
    } finally {
      b.stop()
    }
  })
  await check("the run record says what was asked and that it was a question, not the internal tag", async () => {
    const r = await run("yes")
    const dir = path.join(r.home, ".leak-runs")
    const file = fs.readdirSync(dir).sort().filter((f) => f.endsWith(".jsonl") && f !== "index.jsonl").pop()
    const start = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8").split("\n")[0])
    assert.equal(start.question, "yes-no")
    assert.ok(!/sorry : Prop/.test(start.theorem), start.theorem)
    assert.match(start.theorem, /theorem question_fake : ∀ a : ℕ, a \+ 0 = a/)
    const index = fs.readFileSync(path.join(dir, "index.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).pop()
    assert.ok(!/sorry : Prop/.test(index.theorem), "the internal tag reached the run index: " + index.theorem)
    assert.ok(r.done)
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
  // The CLI reports cost once per call of the CLI, so a long run's bill could not be taken apart afterwards. The bridge now reads the usage of
  // every API call, prices the parts (an estimate: total_cost_usd stays the figure), and keeps one line per call in the run's record only.
  await check("a run's record has one usage line per API call and the totals on its end line, counts a compaction, and the console never sees them", async () => {
    const b = await startBridge({ FAKE_MODE: "ok", FAKE_USAGE: "1", FAKE_USAGE_DROP_AT: "3" })
    try {
      const f = await b.frames("control-honoured", { memory: { entries: [] }, targetId: "fake-1" })
      assert.equal(done(f).verified, true)
      assert.ok(!f.some((x) => x.type === "usage"), "no usage frame reached the client")
      const names = await waitFor(() => (runsOf(b.home).some((n) => n.endsWith(".memory.json")) ? runsOf(b.home) : null))
      const jsonl = names.find((n) => n.endsWith(".jsonl") && n !== "index.jsonl")
      const lines = readLines(path.join(b.home, ".leak-runs", jsonl))
      const usage = lines.filter((l) => l.kind === "event" && /^USAGE — /.test(l.text)).map((l) => l.text)
      assert.ok(usage.length >= 3, "one line per API call of the fake: " + usage.join(" | "))
      assert.match(usage[0], /^USAGE — ctx 120,512 \(read 120,000 · written 500 · new 12\) · out 301 · est \$0\.\d+ \(read 0\.036 · write 0\.002 · new 0\.000 · out 0\.005\)$/)
      assert.match(usage[1], /ctx 140,512/)
      assert.match(usage[2], /ctx 30,512 .* · COMPACTED \(the context before it was 140,512\)$/)
      assert.equal(usage.filter((l) => /COMPACTED/.test(l)).length, 1, "only the call that read 30 000 after 140 000 is a compaction")
      const num = (l, re) => Number(re.exec(l)[1].replace(/,/g, ""))
      const n = usage.length
      const reads = usage.map((l) => num(l, /\(read ([\d,]+) ·/))
      const ctxs = usage.map((l) => num(l, /^USAGE — ctx ([\d,]+) /))
      const u = lines.at(-1).metrics.usage
      assert.equal(u.calls, n)
      assert.equal(u.input_tokens, 12 * n)
      assert.equal(u.cache_read_tokens, reads.reduce((a, b) => a + b, 0))
      assert.equal(u.cache_write_tokens, 500 * n)
      assert.equal(u.output_tokens, Array.from({ length: n }, (_, i) => 301 + i).reduce((a, b) => a + b, 0))
      assert.equal(u.max_context_tokens, Math.max(...ctxs))
      assert.equal(u.compactions, 1)
      assert.ok(Math.abs(u.est_usd.cache_read - (u.cache_read_tokens * 0.3) / 1e6) < 1e-5 && u.est_usd.cache_write > 0 && u.est_usd.output > 0, JSON.stringify(u.est_usd))
    } finally {
      b.stop()
    }
  })
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
