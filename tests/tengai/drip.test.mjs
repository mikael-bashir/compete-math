// The local drip starter: one fixed command, a clamped budget, one run at a time, and no bridge secret in the child's environment.
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import test from "node:test"

import { DEFAULT_BUDGET, MAX_BUDGET, MIN_BUDGET, _reset, dripEnv, handle, planDrip, start, status, stop, tengaiDir } from "../../public/tengai-drip.mjs"

const there = () => true
const env = { TENGAI_DIR: "/work/tengai" }

test("the command is fixed; the page chooses only a clamped budget and dry-run", () => {
  const p = planDrip({}, { env, exists: there })
  assert.deepEqual(p.argv, ["python3", "-m", "anomalous_archangel", "drip", "--budget", String(DEFAULT_BUDGET)])
  assert.equal(p.cwd, "/work/tengai")
  assert.equal(planDrip({ budget: 1e9 }, { env, exists: there }).budget, MAX_BUDGET)
  assert.equal(planDrip({ budget: -5 }, { env, exists: there }).budget, MIN_BUDGET)
  assert.ok(planDrip({ dryRun: true }, { env, exists: there }).argv.includes("--dry-run"))
  assert.ok(!planDrip({ dryRun: "yes" }, { env, exists: there }).argv.includes("--dry-run"), "only the boolean true is a dry run")
  // nothing else in the body reaches the command
  const evil = planDrip({ budget: 3, argv: ["rm", "-rf", "/"], cwd: "/", command: "x", flags: "--no-land" }, { env, exists: there })
  assert.deepEqual(evil.argv, ["python3", "-m", "anomalous_archangel", "drip", "--budget", "3"])
  assert.equal(evil.cwd, "/work/tengai")
  assert.equal(planDrip({ budget: "abc" }, { env, exists: there }).ok, false)
})

test("a missing checkout is said, with the command that makes one", () => {
  const p = planDrip({}, { env, exists: () => false })
  assert.equal(p.ok, false)
  assert.match(p.error, /git clone https:\/\/github.com\/competemath\/tengai \/work\/tengai/)
})

test("the checkout is $TENGAI_DIR when absolute, else ~/tengai", () => {
  assert.equal(tengaiDir({ TENGAI_DIR: "/a/b" }, "/home/u"), "/a/b")
  assert.equal(tengaiDir({ TENGAI_DIR: "relative" }, "/home/u"), "/home/u/tengai")
  assert.equal(tengaiDir({}, "/home/u"), "/home/u/tengai")
})

test("the child gets no bridge secret and keeps the CLI's login", () => {
  const out = dripEnv({ BRIDGE_TOKEN: "x", LEAK_BRIDGE_SECRET: "y", CLAUDE_CODE_OAUTH_TOKEN: "keep", PATH: "/bin", HOME: "/h" })
  assert.deepEqual(Object.keys(out).sort(), ["CLAUDE_CODE_OAUTH_TOKEN", "HOME", "PATH"])
})

function fakeSpawn() {
  const calls = []
  const spawn = (bin, args, opts) => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.killed = false
    child.kill = (sig) => ((child.killed = sig), child.emit("close", null))
    calls.push({ bin, args, opts, child })
    return child
  }
  return { spawn, calls }
}

test("one run at a time, its output kept, its exit recorded, and stoppable", () => {
  _reset()
  const f = fakeSpawn()
  const plan = planDrip({ budget: 4 }, { env, exists: there })
  assert.deepEqual(start(plan, { spawn: f.spawn, env: { BRIDGE_TOKEN: "t", PATH: "/bin" } }), { ok: true })
  assert.equal(f.calls[0].bin, "python3")
  assert.equal(f.calls[0].opts.cwd, "/work/tengai")
  assert.ok(!("BRIDGE_TOKEN" in f.calls[0].opts.env))
  assert.equal(status().running, true)
  assert.equal(start(plan, { spawn: f.spawn }).ok, false, "a second drip is refused while one runs")
  f.calls[0].child.stdout.emit("data", "line one\nline two\n")
  assert.deepEqual(status().tail, ["line one", "line two"])
  f.calls[0].child.emit("close", 0)
  assert.deepEqual([status().running, status().exitCode], [false, 0])
  start(plan, { spawn: f.spawn })
  assert.equal(stop(), true)
  assert.equal(f.calls[1].child.killed, "SIGTERM")
  assert.equal(stop(), false)
})

test("a spawn that throws leaves a finished, failed run, not a stuck one", () => {
  _reset()
  start(planDrip({}, { env, exists: there }), { spawn: () => { throw new Error("no python3") } })
  assert.equal(status().running, false)
  assert.equal(status().exitCode, -1)
  assert.match(status().tail[0], /no python3/)
})

test("the HTTP handler: bad JSON and a missing checkout are 400, GET is 200, any other method is 405", async () => {
  _reset()
  const sent = []
  const json = (_res, code, body) => sent.push([code, body])
  const post = (text) => handle({ method: "POST" }, {}, { json, readBody: async () => text })
  await post("{nope")
  assert.equal(sent.at(-1)[0], 400)
  const saved = process.env.TENGAI_DIR
  process.env.TENGAI_DIR = "/definitely/not/here"
  await post("{}")
  assert.equal(sent.at(-1)[0], 400)
  assert.match(sent.at(-1)[1].error, /no Tengai checkout/)
  process.env.TENGAI_DIR = saved ?? ""
  if (saved === undefined) delete process.env.TENGAI_DIR
  await handle({ method: "GET" }, {}, { json, readBody: async () => "" })
  assert.equal(sent.at(-1)[0], 200)
  await handle({ method: "PUT" }, {}, { json, readBody: async () => "" })
  assert.equal(sent.at(-1)[0], 405)
  await post('{"stop": true}')
  assert.deepEqual(sent.at(-1), [200, { stopped: false }])
})
