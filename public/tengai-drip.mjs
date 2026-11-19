import { spawn as nodeSpawn } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

// The local side of the "Run a drip" button on the Tengai page (/tengai): start anomalous-archangel's drip in the operator's own checkout of
// competemath/tengai, and say how it is going. It runs one fixed command and nothing the page sends can change it: the page chooses only a budget
// (clamped) and whether the run is a dry run. Next to the bridge; the setup command downloads it. Pure where it can be, so a test can read the command.
//
//   POST /tengai-drip {budget?: number, dryRun?: boolean}   start (409 when one is running, 400 when the checkout is not there)
//   GET  /tengai-drip                                       {running, startedAt, finishedAt, exitCode, dryRun, budget, dir, tail: [last lines]}
//   POST /tengai-drip {stop: true}                          stop the running drip (a POST, because the bridge's CORS answer allows GET and POST only)
//
// The checkout is $TENGAI_DIR, or ~/tengai. A drip needs what the Tengai README lists (python 3.11+, the claude CLI logged in, and for the Lean gate
// scripts/tengoku-setup.sh run once there); this module only starts it.

export const MIN_BUDGET = 1
export const MAX_BUDGET = 50
export const DEFAULT_BUDGET = 8
const TAIL_LINES = 200

export const tengaiDir = (env = process.env, home = homedir()) => (env.TENGAI_DIR && env.TENGAI_DIR.startsWith("/") ? env.TENGAI_DIR : join(home, "tengai"))

// The drip's environment: everything but the bridge's own secrets (the CLI's login, which the drip's agents need, is kept).
export function dripEnv(env = process.env) {
  const out = {}
  for (const [k, v] of Object.entries(env)) if (!/^BRIDGE|LEAK_.*(TOKEN|SECRET)/i.test(k)) out[k] = v
  return out
}

// Validate the request and build the command. Returns {ok:true, argv, cwd, budget, dryRun} or {ok:false, error}.
export function planDrip(body = {}, { env = process.env, exists = existsSync, home = homedir() } = {}) {
  const dryRun = body.dryRun === true
  const asked = body.budget === undefined || body.budget === null ? DEFAULT_BUDGET : Number(body.budget)
  if (!Number.isFinite(asked)) return { ok: false, error: "budget must be a number" }
  const budget = Math.min(Math.max(asked, MIN_BUDGET), MAX_BUDGET)
  const cwd = tengaiDir(env, home)
  if (!exists(join(cwd, "anomalous_archangel", "__main__.py"))) {
    return { ok: false, error: `no Tengai checkout at ${cwd} (git clone https://github.com/competemath/tengai ${cwd}, or set TENGAI_DIR)` }
  }
  const argv = ["python3", "-m", "anomalous_archangel", "drip", "--budget", String(budget), ...(dryRun ? ["--dry-run"] : [])]
  return { ok: true, argv, cwd, budget, dryRun }
}

const state = { running: false, startedAt: null, finishedAt: null, exitCode: null, dryRun: false, budget: 0, dir: "", tail: [], child: null }

export const status = () => ({ ...state, child: undefined, tail: [...state.tail] })

function push(chunk) {
  for (const line of String(chunk).split("\n")) if (line.trim()) state.tail.push(line.slice(0, 400))
  if (state.tail.length > TAIL_LINES) state.tail.splice(0, state.tail.length - TAIL_LINES)
}

export function start(plan, { spawn = nodeSpawn, env = process.env, now = () => new Date() } = {}) {
  if (state.running) return { ok: false, error: "a drip is already running" }
  Object.assign(state, { running: true, startedAt: now().toISOString(), finishedAt: null, exitCode: null, dryRun: plan.dryRun, budget: plan.budget, dir: plan.cwd, tail: [] })
  const [bin, ...args] = plan.argv
  let child
  try {
    child = spawn(bin, args, { cwd: plan.cwd, env: dripEnv(env), stdio: ["ignore", "pipe", "pipe"] })
  } catch (e) {
    Object.assign(state, { running: false, finishedAt: now().toISOString(), exitCode: -1 })
    push(`could not start: ${String(e?.message || e)}`)
    return { ok: true }
  }
  state.child = child
  child.stdout?.on("data", push)
  child.stderr?.on("data", push)
  child.on("error", (e) => {
    push(`could not run ${bin}: ${String(e?.message || e)}`)
    Object.assign(state, { running: false, finishedAt: now().toISOString(), exitCode: -1, child: null })
  })
  child.on("close", (code) => Object.assign(state, { running: false, finishedAt: now().toISOString(), exitCode: code ?? -1, child: null }))
  return { ok: true }
}

export function stop() {
  if (!state.running || !state.child) return false
  state.child.kill("SIGTERM")
  return true
}

export async function handle(req, res, { json, readBody }) {
  if (req.method === "GET") return json(res, 200, status())
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" })
  let body
  try {
    body = JSON.parse((await readBody(req)) || "{}")
  } catch {
    return json(res, 400, { error: "invalid_json" })
  }
  if (body && body.stop === true) return json(res, 200, { stopped: stop() })
  const plan = planDrip(body)
  if (!plan.ok) return json(res, 400, { error: plan.error })
  const r = start(plan)
  if (!r.ok) return json(res, 409, { error: r.error })
  return json(res, 202, status())
}

// for tests: forget the last run
export const _reset = () => Object.assign(state, { running: false, startedAt: null, finishedAt: null, exitCode: null, dryRun: false, budget: 0, dir: "", tail: [], child: null })
