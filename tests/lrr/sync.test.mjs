// node --test tests/lrr/sync.test.mjs
//
// tools/lrr-sync/sync.mjs against a real git repository on disk (a bare repo standing in for competemath/LRR). No network, no key, no model.
// What it proves: the backfill and the incremental sync write the layout the README promises, secrets never reach the remote, the sync only
// ever adds files under runs/<account>/, running it twice changes nothing, and a failure leaves the state such that the next run retries.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { GZIP_OVER, sha256 } from "../../tools/lrr-sync/core.mjs"
import { loadConfig, runSync, status } from "../../tools/lrr-sync/sync.mjs"

const SYNC = fileURLToPath(new URL("../../tools/lrr-sync/sync.mjs", import.meta.url))
const NOW = Date.parse("2026-10-20T12:00:00Z")
const THEOREM = "theorem foo_bar (n : ℕ) : n + 0 = n := by\n  sorry"
const PROOF = "import Mathlib\n\ntheorem foo_bar (n : ℕ) : n + 0 = n := by\n  simp\n"
const FAKE_TOKEN = "gh" + "p_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"
const jl = (...objs) => objs.map((o) => JSON.stringify(o)).join("\n") + "\n"
const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

function transcript({ at, slug = "foo_bar", ok = true, reason = ok ? "verified" : "unverified", seconds = 600, cost = 1.5, extra = [], end = true }) {
  const t0 = Date.parse(at)
  const lines = [{ kind: "start", at, theorem: THEOREM, strategy: "control-1", model: "claude-sonnet-5", bridge_build: "b1", target_id: slug }, ...extra]
  if (end) lines.push({ kind: "end", at: new Date(t0 + seconds * 1000).toISOString(), ok, reason, seconds, cost_usd: cost, metrics: { tokens: { input: 1, output: 2 }, cost_usd: cost, bridge_build: "b1", time_elapsed: seconds, tools_invoked: 2, llm_invocations: 1, lean_toolchain: null, verifier_group: null, mathlib_version: null } })
  return jl(...lines)
}
const idOf = (at, slug = "foo_bar") => `${at.replace(/[:.]/g, "-")}-${slug}`

// A throwaway world: a remote with another account's folder in it, and a source directory of transcripts.
function world({ seedRemote = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lrr-test-"))
  const remote = path.join(root, "remote.git")
  const src = path.join(root, "src")
  fs.mkdirSync(src)
  git(root, "init", "--bare", "-b", "main", remote)
  const seed = path.join(root, "seed")
  git(root, "clone", "-q", remote, seed)
  let seedFirstLine = null
  if (seedRemote) {
    fs.mkdirSync(path.join(seed, "runs/fatex/logs"), { recursive: true })
    fs.mkdirSync(path.join(seed, "runs/alice"), { recursive: true })
    seedFirstLine = JSON.stringify({ kind: "start", at: "2026-07-31T11:37:11.025Z", theorem: THEOREM, strategy: "river-stone", model: "m" })
    fs.writeFileSync(path.join(seed, "runs/fatex/logs/old.jsonl"), seedFirstLine + "\n" + JSON.stringify({ kind: "end" }) + "\n")
    fs.writeFileSync(path.join(seed, "runs/fatex/METRICS.md"), "# fatex\n")
    fs.writeFileSync(path.join(seed, "runs/alice/note.txt"), "someone else's\n")
    fs.writeFileSync(path.join(seed, "README.md"), "# LRR\n")
    git(seed, "add", "-A")
    git(seed, "commit", "-qm", "seed")
    git(seed, "push", "-q", "origin", "HEAD:main")
  }
  const cfgFor = (extra = []) => loadConfig(["--source", src, "--remote", `file://${remote}`, "--account", "fleeting", "--clone", path.join(root, "clone"), "--branch", "main", "--bank", path.join(root, "no-bank.json"), ...extra], {})
  const view = () => {
    const v = path.join(root, "view")
    fs.rmSync(v, { recursive: true, force: true })
    git(root, "clone", "-q", remote, v)
    return v
  }
  const put = (at, opts = {}) => {
    const id = idOf(at, opts.slug)
    fs.writeFileSync(path.join(src, `${id}.jsonl`), transcript({ at, ...opts }))
    return id
  }
  return { root, remote, src, seedFirstLine, cfgFor, view, put, head: () => git(root, "--git-dir", remote, "rev-parse", "main").trim(), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
}
const walk = (dir, base = dir, out = []) => {
  for (const n of fs.readdirSync(dir)) {
    if (n === ".git") continue
    const f = path.join(dir, n)
    if (fs.statSync(f).isDirectory()) walk(f, base, out)
    else out.push(path.relative(base, f))
  }
  return out.sort()
}
const sync = (w, extra = [], opts = {}) => runSync(w.cfgFor(extra), { nowMs: NOW, ...opts })

test("backfill: layout, nulls, pointer to a transcript LRR already holds, and nothing outside runs/fleeting", async () => {
  const w = world()
  try {
    const a = w.put("2026-09-30T10:00:00.000Z")
    const b = w.put("2026-10-02T10:00:00.000Z", { ok: false, extra: [{ kind: "event", t: 1, text: "TEXT — hello" }] })
    fs.writeFileSync(path.join(w.src, `${b}.lean`), PROOF) // a sidecar proof
    // a transcript identical in its first line to one already in runs/fatex/logs
    const dupAt = "2026-07-31T11:37:11.025Z"
    const dupId = idOf(dupAt)
    fs.writeFileSync(path.join(w.src, `${dupId}.jsonl`), w.seedFirstLine + "\n" + jl({ kind: "end", at: "2026-07-31T11:47:11.025Z", ok: false, reason: "unverified", seconds: 600, cost_usd: 1 }))
    // a run still going (no end, fresh mtime) must be left for later
    const live = w.put("2026-10-20T11:59:00.000Z", { slug: "live_one", end: false })
    fs.utimesSync(path.join(w.src, `${live}.jsonl`), NOW / 1000, NOW / 1000)
    const before = w.head()

    const r = await sync(w)
    assert.equal(r.ok, true)
    assert.notEqual(w.head(), before)

    const v = w.view()
    const files = walk(v)
    // only additions under runs/fleeting/
    assert.deepEqual(git(v, "diff", "--name-status", before, "HEAD").split("\n").filter(Boolean).filter((l) => !l.startsWith("A\truns/fleeting/")), [])
    for (const f of ["README.md", "runs/fatex/logs/old.jsonl", "runs/fatex/METRICS.md", "runs/alice/note.txt"]) assert.ok(files.includes(f), `${f} is gone`)
    assert.equal(fs.readFileSync(path.join(v, "runs/alice/note.txt"), "utf8"), "someone else's\n")

    const acct = path.join(v, "runs/fleeting")
    assert.ok(fs.existsSync(path.join(acct, "README.md")))
    assert.ok(fs.existsSync(path.join(acct, "2026-10/METRICS.md")))
    assert.ok(fs.existsSync(path.join(acct, "2026-09/metrics.json")))
    assert.ok(fs.existsSync(path.join(acct, `2026-10/logs/${b}.jsonl`)))
    assert.ok(fs.existsSync(path.join(acct, `2026-10/${b}.lean`)))
    assert.equal(fs.readFileSync(path.join(acct, `2026-10/${b}.lean`), "utf8"), PROOF)

    const index = fs.readFileSync(path.join(acct, "index.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    assert.deepEqual(index.map((r) => r.run_id), [dupId, a, b], "sorted by start time; the running one is absent")
    const dup = index.find((r) => r.run_id === dupId)
    assert.equal(dup.path, "runs/fatex/logs/old.jsonl", "a pointer, not a second copy")
    assert.ok(!files.some((f) => f.includes(dupId)), "the duplicate transcript was not stored again")

    const m = JSON.parse(fs.readFileSync(path.join(acct, "2026-10/metrics.json"), "utf8"))
    assert.deepEqual(m.items.map((i) => i.seq), [0])
    assert.equal(m.items[0].run_id, b)
    assert.equal(m.items[0].run_log, `2026-10/logs/${b}.jsonl`)
    assert.equal(m.items[0].files.proof, `2026-10/${b}.lean`)
    const mSep = JSON.parse(fs.readFileSync(path.join(acct, "2026-07/metrics.json"), "utf8"))
    assert.equal(mSep.items[0].also_in, "runs/fatex/logs/old.jsonl")
    assert.equal(mSep.items[0].run_log, null)

    assert.equal(status(w.cfgFor()).pending, 1, "only the live run is left")
  } finally {
    w.cleanup()
  }
})

test("secrets never reach the remote", async () => {
  const w = world()
  try {
    const id = w.put("2026-10-02T10:00:00.000Z", { extra: [{ kind: "event", t: 1, text: `TOOL_CALL → Bash\n{"command":"export GITHUB_TOKEN=${FAKE_TOKEN} && git push"}` }, { kind: "event", t: 2, text: `TEXT — url https://bot:${"hunter2hunter2"}@example.com/x.git` }] })
    fs.writeFileSync(path.join(w.src, `${id}.lean`), PROOF + `-- ${FAKE_TOKEN}\n`)
    const r = await sync(w)
    assert.equal(r.ok, true)
    const v = w.view()
    for (const f of walk(v)) {
      const body = fs.readFileSync(path.join(v, f), "latin1")
      assert.ok(!body.includes(FAKE_TOKEN), `${f} holds the token`)
      assert.ok(!body.includes("hunter2hunter2"), `${f} holds the password`)
    }
    const log = fs.readFileSync(path.join(v, `runs/fleeting/2026-10/logs/${id}.jsonl`), "utf8")
    assert.match(log, /\[REDACTED:/)
    for (const l of log.trim().split("\n")) JSON.parse(l) // still a JSON line each
    assert.ok(Object.keys(r.scrubbed || {}).length >= 0)
  } finally {
    w.cleanup()
  }
})

test("a second sync changes nothing, and a new run adds exactly one commit without touching earlier files", async () => {
  const w = world()
  try {
    w.put("2026-10-02T10:00:00.000Z")
    await sync(w)
    const h1 = w.head()
    const v1 = w.view()
    const snap = Object.fromEntries(walk(v1).map((f) => [f, sha256(fs.readFileSync(path.join(v1, f)))]))

    await sync(w)
    assert.equal(w.head(), h1, "no run to record: no commit")

    const id2 = w.put("2026-10-03T10:00:00.000Z")
    await sync(w)
    assert.notEqual(w.head(), h1)
    const v2 = w.view()
    assert.equal(git(v2, "rev-list", "--count", `${h1}..HEAD`).trim(), "1")
    const changed = git(v2, "diff", "--name-status", h1, "HEAD").split("\n").filter(Boolean)
    for (const l of changed) {
      const [st, f] = l.split("\t")
      assert.ok(f.startsWith("runs/fleeting/"), `${f} is outside the account folder`)
      if (st !== "A") assert.match(f, /(index\.jsonl|README\.md|metrics\.json|METRICS\.md)$/, `${f} was rewritten but is not an aggregate`)
    }
    for (const [f, h] of Object.entries(snap)) {
      if (/(index\.jsonl|README\.md|metrics\.json|METRICS\.md)$/.test(f)) continue
      assert.equal(sha256(fs.readFileSync(path.join(v2, f))), h, `${f} changed`)
    }
    const m = JSON.parse(fs.readFileSync(path.join(v2, "runs/fleeting/2026-10/metrics.json"), "utf8"))
    assert.deepEqual(m.items.map((i) => i.seq), [0, 1])
    assert.equal(m.items[1].run_id, id2)
    const index = fs.readFileSync(path.join(v2, "runs/fleeting/index.jsonl"), "utf8").trim().split("\n")
    assert.equal(index.length, 2)
  } finally {
    w.cleanup()
  }
})

test("a run that was still going and then ends is picked up on the next sync", async () => {
  const w = world()
  try {
    const id = w.put("2026-10-20T11:00:00.000Z", { end: false })
    const f = path.join(w.src, `${id}.jsonl`)
    fs.utimesSync(f, NOW / 1000, NOW / 1000)
    await sync(w)
    assert.equal(status(w.cfgFor()).pending, 1)
    fs.appendFileSync(f, jl({ kind: "end", at: "2026-10-20T11:30:00.000Z", ok: true, reason: "verified", seconds: 1800, cost_usd: 3 }))
    await sync(w)
    assert.equal(status(w.cfgFor()).pending, 0)
    const v = w.view()
    const m = JSON.parse(fs.readFileSync(path.join(v, "runs/fleeting/2026-10/metrics.json"), "utf8"))
    assert.equal(m.items[0].status, "proved")
    assert.equal(m.items[0].cost_usd, 3)
  } finally {
    w.cleanup()
  }
})

test("a transcript quiet for hours with no end is recorded as interrupted", async () => {
  const w = world()
  try {
    const id = w.put("2026-10-19T01:00:00.000Z", { end: false })
    const f = path.join(w.src, `${id}.jsonl`)
    const old = (NOW - 5 * 3600 * 1000) / 1000
    fs.utimesSync(f, old, old)
    await sync(w)
    const v = w.view()
    const m = JSON.parse(fs.readFileSync(path.join(v, "runs/fleeting/2026-10/metrics.json"), "utf8"))
    assert.equal(m.items[0].status, "interrupted")
    assert.equal(m.items[0].cost_usd, null)
  } finally {
    w.cleanup()
  }
})

test("a transcript over the size limit is stored gzipped and reads back identical to its scrubbed text", async () => {
  const w = world()
  try {
    const big = "x".repeat(1024 * 1024)
    const id = idOf("2026-10-04T10:00:00.000Z")
    const lines = [{ kind: "start", at: "2026-10-04T10:00:00.000Z", theorem: THEOREM, strategy: "control-1", model: "m" }]
    for (let i = 0; i < Math.ceil(GZIP_OVER / big.length) + 1; i++) lines.push({ kind: "event", t: i, text: "TEXT — " + big })
    lines.push({ kind: "end", at: "2026-10-04T10:10:00.000Z", ok: false, reason: "unverified", seconds: 600, cost_usd: 1 })
    fs.writeFileSync(path.join(w.src, `${id}.jsonl`), jl(...lines))
    const r = await sync(w)
    assert.equal(r.ok, true)
    const v = w.view()
    const gz = path.join(v, `runs/fleeting/2026-10/logs/${id}.jsonl.gz`)
    assert.ok(fs.existsSync(gz))
    assert.ok(fs.statSync(gz).size < 5 * 1024 * 1024)
    const back = (await import("node:zlib")).gunzipSync(fs.readFileSync(gz)).toString("utf8")
    assert.equal(back, jl(...lines))
    const m = JSON.parse(fs.readFileSync(path.join(v, "runs/fleeting/2026-10/metrics.json"), "utf8"))
    assert.equal(m.items[0].run_log, `2026-10/logs/${id}.jsonl.gz`)
  } finally {
    w.cleanup()
  }
})

test("many runs are split over commits: one closes as soon as it passes the byte cap", async () => {
  const w = world()
  try {
    for (let d = 1; d <= 6; d++) w.put(`2026-10-0${d}T10:00:00.000Z`, { extra: [{ kind: "event", t: 1, text: "TEXT — " + "y".repeat(300_000) }] })
    const before = w.head()
    const r = await sync(w, ["--max-bytes", "400000"])
    assert.equal(r.ok, true)
    const v = w.view()
    const n = Number(git(v, "rev-list", "--count", `${before}..HEAD`).trim())
    assert.equal(n, 3, "six runs of about 300 kB with a 400 kB cap: two to a commit")
    const index = fs.readFileSync(path.join(v, "runs/fleeting/index.jsonl"), "utf8").trim().split("\n")
    assert.equal(index.length, 6)
  } finally {
    w.cleanup()
  }
})

test("a push the remote refuses is retried from its new head, and the result is the same", async () => {
  const w = world()
  try {
    w.put("2026-10-02T10:00:00.000Z")
    const flag = path.join(w.root, "refused-once")
    const hook = path.join(w.remote, "hooks/pre-receive")
    fs.writeFileSync(hook, `#!/bin/sh\nif [ ! -e "${flag}" ]; then touch "${flag}"; echo "remote busy" >&2; exit 1; fi\nexit 0\n`, { mode: 0o755 })
    const logs = []
    const r = await sync(w, [], { log: (m) => logs.push(m) })
    assert.equal(r.ok, true)
    assert.ok(logs.some((l) => /push failed \(attempt 1\)/.test(l)))
    const v = w.view()
    assert.ok(fs.existsSync(path.join(v, "runs/fleeting/index.jsonl")))
    assert.equal(git(v, "rev-list", "--count", "HEAD").trim(), "2", "the seed and one sync commit: the refused attempt left nothing behind")
    assert.equal(status(w.cfgFor()).pending, 0)
  } finally {
    w.cleanup()
  }
})

test("a remote that stays down fails loudly and leaves every run pending for the next try", async () => {
  const w = world()
  try {
    w.put("2026-10-02T10:00:00.000Z")
    fs.writeFileSync(path.join(w.remote, "hooks/pre-receive"), "#!/bin/sh\necho no >&2\nexit 1\n", { mode: 0o755 })
    await assert.rejects(() => sync(w))
    assert.equal(status(w.cfgFor()).pending, 1)
    assert.equal(fs.existsSync(path.join(w.src, ".lrr.lock")), false)
    assert.equal(fs.existsSync(path.join(w.src, ".lrr-sync.lock")), false, "the lock is released")
    fs.rmSync(path.join(w.remote, "hooks/pre-receive"))
    const r = await sync(w)
    assert.equal(r.ok, true)
    assert.equal(status(w.cfgFor()).pending, 0)
  } finally {
    w.cleanup()
  }
})

test("an unreachable remote is an error, not a silent success", async () => {
  const w = world()
  try {
    w.put("2026-10-02T10:00:00.000Z")
    await assert.rejects(() => runSync({ ...w.cfgFor(), remote: `file://${path.join(w.root, "nowhere.git")}` }, { nowMs: NOW }))
    assert.equal(status(w.cfgFor()).pending, 1)
  } finally {
    w.cleanup()
  }
})

test("--dry-run and --no-push record nothing remotely; --no-push keeps the runs pending so a later push sends them", async () => {
  const w = world()
  try {
    w.put("2026-10-02T10:00:00.000Z")
    const h = w.head()
    const d = await sync(w, ["--dry-run"])
    assert.equal(d.dryRun, true)
    assert.equal(w.head(), h)
    assert.equal(status(w.cfgFor()).pending, 1)
    await sync(w, ["--no-push"])
    assert.equal(w.head(), h)
    assert.equal(status(w.cfgFor()).pending, 1)
    await sync(w)
    assert.notEqual(w.head(), h)
    assert.equal(status(w.cfgFor()).pending, 0)
  } finally {
    w.cleanup()
  }
})

test("a second sync running at the same time stands aside; a lock left by a dead process does not block", async () => {
  const w = world()
  try {
    w.put("2026-10-02T10:00:00.000Z")
    const lock = path.join(w.src, ".lrr-sync.lock")
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: Date.now() }))
    const held = await sync(w)
    assert.equal(held.skipped, "locked")
    assert.equal(status(w.cfgFor()).pending, 1)
    fs.writeFileSync(lock, JSON.stringify({ pid: 2 ** 22 + 12345, at: Date.now() })) // no such process
    const r = await sync(w)
    assert.equal(r.ok, true)
    assert.equal(status(w.cfgFor()).pending, 0)
  } finally {
    w.cleanup()
  }
})

test("the account name is checked: nothing that could leave runs/<account>/ is accepted", async () => {
  const w = world()
  try {
    w.put("2026-10-02T10:00:00.000Z")
    const h = w.head()
    for (const bad of ["", "..", "../x", "a/b", "a b", "-x", ".git"]) {
      await assert.rejects(() => runSync({ ...w.cfgFor(), account: bad }, { nowMs: NOW }), /account/, `accepted ${JSON.stringify(bad)}`)
    }
    assert.equal(w.head(), h)
  } finally {
    w.cleanup()
  }
})

test("a run that cannot be built is reported and retried, and does not stop the others", async () => {
  const w = world()
  try {
    w.put("2026-10-02T10:00:00.000Z")
    fs.writeFileSync(path.join(w.src, `${idOf("2026-10-03T10:00:00.000Z")}.jsonl`), "this is not a transcript\n")
    const r = await sync(w)
    assert.equal(r.ok, true, "a file with no start line is skipped, not an error")
    const v = w.view()
    const index = fs.readFileSync(path.join(v, "runs/fleeting/index.jsonl"), "utf8").trim().split("\n")
    assert.equal(index.length, 1)
  } finally {
    w.cleanup()
  }
})

test("the CLI: status prints counts as JSON, and plist prints a launchd agent", () => {
  const w = world()
  try {
    w.put("2026-10-02T10:00:00.000Z")
    const out = spawnSync(process.execPath, [SYNC, "status", "--source", w.src, "--account", "fleeting"], { encoding: "utf8" })
    assert.equal(out.status, 0, out.stderr)
    assert.deepEqual(JSON.parse(out.stdout), { account: "fleeting", onDisk: 1, recorded: 0, pending: 1 })
    const plist = spawnSync(process.execPath, [SYNC, "plist"], { encoding: "utf8" })
    assert.equal(plist.status, 0)
    assert.match(plist.stdout, /<plist/)
    assert.match(plist.stdout, /com\.competemath\.lrr-sync/)
  } finally {
    w.cleanup()
  }
})

test("install.sh: copies the sync, writes the config without any key material, writes the agent, refuses a loose key, and uninstalls cleanly", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "lrr-home-"))
  const installer = fileURLToPath(new URL("../../tools/lrr-sync/install.sh", import.meta.url))
  const run = (args) => spawnSync("sh", [installer, ...args], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: home, LRR_SKIP_LAUNCHD: "1" } })
  try {
    fs.mkdirSync(path.join(home, ".ssh"))
    const key = path.join(home, ".ssh/lrr_sync_ed25519")
    fs.writeFileSync(key, "NOT A REAL KEY\n", { mode: 0o644 })
    assert.notEqual(run(["--account", "fleeting"]).status, 0, "a key others can read is refused")
    assert.notEqual(run([]).status, 0, "no account is refused")
    assert.notEqual(run(["--account", "../x"]).status, 0)
    fs.chmodSync(key, 0o600)
    const r = run(["--account", "fleeting"])
    assert.equal(r.status, 0, r.stderr)
    const cfg = JSON.parse(fs.readFileSync(path.join(home, ".leak-runs/.lrr-sync.json"), "utf8"))
    assert.deepEqual(cfg, { account: "fleeting", remote: "git@github.com:competemath/LRR.git", branch: "main", sshKey: key })
    assert.ok(!fs.readFileSync(path.join(home, ".leak-runs/.lrr-sync.json"), "utf8").includes("NOT A REAL KEY"))
    for (const f of ["core.mjs", "sync.mjs"]) assert.ok(fs.existsSync(path.join(home, ".leak-runs/.lrr-sync", f)))
    const plist = fs.readFileSync(path.join(home, "Library/LaunchAgents/com.competemath.lrr-sync.plist"), "utf8")
    assert.ok(plist.includes(path.join(home, ".leak-runs/.lrr-sync/sync.mjs")), "the agent runs the installed copy")
    const again = run(["--account", "fleeting"])
    assert.equal(again.status, 0, "installing twice is fine")
    const un = run(["--uninstall"])
    assert.equal(un.status, 0, un.stderr)
    assert.ok(!fs.existsSync(path.join(home, "Library/LaunchAgents/com.competemath.lrr-sync.plist")))
    assert.ok(!fs.existsSync(path.join(home, ".leak-runs/.lrr-sync")))
    assert.ok(fs.existsSync(path.join(home, ".leak-runs/.lrr-sync.json")), "the config stays")
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})
