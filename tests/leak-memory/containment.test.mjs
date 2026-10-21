// What an isolated agent is allowed to be, read from the flags it would be launched with. Nothing is spawned here (the way TauCetiReview checks a
// reviewer's argv); containment-selftest.mjs hands the same flags to the real CLI and watches it refuse.
import test from "node:test"
import assert from "node:assert/strict"
import { containmentMode, containmentPlan, extraDenyRead, scrubbedEnv, DEFAULT_CONTAINMENT, FILE_TOOLS } from "../../public/leak-containment.mjs"

const WORK = "/private/var/folders/xx/leak-agent-abc"
const base = { workDir: WORK, serverNames: ["Leak_IV", "Leak_I"], disallowed: ["WebSearch", "WebFetch"], hookSettings: { hooks: { PreToolUse: [{ matcher: "Bash" }] } } }
const after = (flags, name) => {
  const i = flags.indexOf(name)
  const out = []
  for (let j = i + 1; i >= 0 && j < flags.length && !flags[j].startsWith("--"); j++) out.push(flags[j])
  return out
}

test("the default is the sandbox, and anything unknown falls back to it, never to the open shell", () => {
  assert.equal(DEFAULT_CONTAINMENT, "sandbox")
  for (const v of [undefined, "", "off", "none", "SHELL ", "bypass"]) assert.equal(containmentMode(v), v === "SHELL " ? "shell" : "sandbox")
  assert.equal(containmentMode("Restricted"), "restricted")
})

test("sandbox: the CLI's restricted mode, the shell named back in, no bypass of permissions, and an OS sandbox that fails closed", () => {
  const p = containmentPlan({ ...base, mode: "sandbox" })
  assert.ok(p.flags.includes("--restricted"))
  assert.ok(!p.flags.includes("--dangerously-skip-permissions"))
  assert.deepEqual(after(p.flags, "--tools"), ["Bash", ...FILE_TOOLS])
  // the file tools and the agent's own MCP servers are named as allowed; the shell is allowed only because the sandbox is on
  assert.deepEqual(after(p.flags, "--allowedTools"), [...FILE_TOOLS, "mcp__Leak_IV", "mcp__Leak_I"])
  const sb = p.settings.sandbox
  assert.equal(sb.enabled, true)
  assert.equal(sb.failIfUnavailable, true) // no sandbox, no shell: the CLI exits rather than run one unsandboxed
  assert.equal(sb.allowUnsandboxedCommands, false) // the agent cannot ask for a command outside it
  assert.deepEqual(sb.network, { allowedDomains: [], strictAllowlist: true }) // not "ask", not "allow": no host at all
  assert.ok(sb.filesystem.denyRead.includes("~/"))
  assert.deepEqual(sb.filesystem.allowRead, [WORK])
  assert.equal(sb.excludedCommands, undefined)
  for (const t of ["Task", "WebSearch", "WebFetch"]) assert.ok(p.disallowed.includes(t), t)
  assert.equal(p.settings.autoMemoryEnabled, false)
  assert.ok(p.settings.hooks, "the hook that counts what the agent reaches for stays")
  assert.match(p.note, /SANDBOX/)
})

test("restricted: no shell tool exists at all, and Bash is banned by name as well", () => {
  const p = containmentPlan({ ...base, mode: "restricted" })
  assert.ok(p.flags.includes("--restricted"))
  assert.equal(after(p.flags, "--tools").length, 0, "no tool list that could name Bash back in")
  assert.ok(p.disallowed.includes("Bash") && p.disallowed.includes("Task"))
  assert.equal(p.settings.sandbox, undefined)
  assert.equal(p.settings.hooks, undefined)
  assert.match(p.note, /NO SHELL/)
})

test("shell: exactly what shipped first (bypass of permissions, the hook, the caller's own bans), so an arm can be compared against it", () => {
  const p = containmentPlan({ ...base, mode: "shell", workDir: undefined })
  assert.deepEqual(p.flags, ["--dangerously-skip-permissions"])
  assert.deepEqual(p.disallowed, ["WebSearch", "WebFetch"])
  assert.ok(p.settings.hooks)
  assert.equal(p.note, "")
})

test("a contained agent needs a working directory of its own, and a relative one is not accepted", () => {
  for (const mode of ["sandbox", "restricted"]) {
    assert.throws(() => containmentPlan({ ...base, mode, workDir: undefined }), /working directory/)
    assert.throws(() => containmentPlan({ ...base, mode, workDir: "scratch" }), /working directory/)
  }
})

test("the operator can add directories a sandboxed shell may not read, and only absolute ones count", () => {
  assert.deepEqual(extraDenyRead("/opt/mathlib: /srv/lean :relative:/"), ["/opt/mathlib", "/srv/lean"])
  const p = containmentPlan({ ...base, mode: "sandbox", denyRead: extraDenyRead("/opt/mathlib") })
  assert.deepEqual(p.settings.sandbox.filesystem.denyRead, ["~/", "/opt/mathlib"])
})

test("a contained agent's environment drops what looks like a secret, and keeps the CLI's own credentials", () => {
  const env = { PATH: "/usr/bin", HOME: "/Users/x", GITHUB_TOKEN: "t", AWS_SECRET_ACCESS_KEY: "s", NPM_PASSWORD: "p", LEAK_BRIDGE_TOKEN: "b", SSH_PRIVATE_KEY: "k", MY_API_KEY: "a", ANTHROPIC_API_KEY: "ok", CLAUDE_CODE_OAUTH_TOKEN: "ok2", LANG: "en_GB.UTF-8" }
  const kept = Object.keys(scrubbedEnv(env, "sandbox")).sort()
  assert.deepEqual(kept, ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "HOME", "LANG", "PATH"])
  assert.deepEqual(Object.keys(scrubbedEnv(env, "restricted")).sort(), kept)
  assert.deepEqual(scrubbedEnv(env, "shell"), env)
})
