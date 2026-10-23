// The REAL Claude CLI and the bridge's notices hook (not part of `pnpm test`: it spends a few cents on one small-model call).
//   node tests/leak-memory/real-cli-notices.mjs
// Proves the one thing the fake CLI cannot: that text a PostToolUse hook returns as `additionalContext` reaches the model after its next tool call, so an agent
// in the middle of a long attempt is told about new intake notices (public/local-claude-bridge.mjs, NOTICES_HOOK).
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import assert from "node:assert/strict"

const here = path.dirname(fileURLToPath(import.meta.url))
const bridge = path.join(here, "../../public/local-claude-bridge.mjs")
const work = fs.mkdtempSync(path.join(os.tmpdir(), "notices-real-"))

// start the bridge only to have it write its hooks, copy the notices hook out, stop it
const home = fs.mkdtempSync(path.join(work, "home-"))
const b = spawn(process.execPath, [bridge], { env: { PATH: process.env.PATH, TMPDIR: work, HOME: home, PORT: "4997" }, stdio: "ignore" })
await new Promise((r) => setTimeout(r, 3000))
const hookDir = fs.readdirSync(work).find((d) => d.startsWith("leak-hook-"))
assert.ok(hookDir, "the bridge wrote its hooks")
const hook = path.join(work, "notices-hook.mjs")
fs.copyFileSync(path.join(work, hookDir, "notices.mjs"), hook)
b.kill()

const file = path.join(work, "notices.json")
fs.writeFileSync(file, JSON.stringify({ hash: "e5e5e5e5e5e5e5e5", text: "INTAKE NOTICES for this target.\n[1] error · Already in Tengoku · lemma_zeta\n    What to do: Use the existing theorem." }))
const settings = JSON.stringify({ hooks: { PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: `node ${hook}` }] }] } })
const r = spawnSync(
  "claude",
  ["-p", "Use the Bash tool to run: echo hello. After it finishes, tell me, verbatim, the lemma name mentioned in any NEW INTAKE NOTICES text you were given after the tool call, or say NONE if you were given no such text. Answer with just the name or NONE.",
    "--model", "haiku", "--settings", settings, "--dangerously-skip-permissions", "--max-turns", "4", "--output-format", "text"],
  { cwd: work, env: { ...process.env, LEAK_AGENT_NOTICES: file }, encoding: "utf8", timeout: 150_000 },
)
console.log("the model said:", r.stdout.trim())
assert.match(r.stdout, /lemma_zeta/, "the hook's additionalContext reached the model")
assert.equal(fs.readFileSync(file + ".seen", "utf8").trim(), "e5e5e5e5e5e5e5e5", "and the hook marked it as given")
fs.rmSync(work, { recursive: true, force: true })
console.log("ok: the real CLI hands a PostToolUse hook's context to the model")
