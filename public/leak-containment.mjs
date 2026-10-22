import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// How an isolated Leak agent is confined, as one pure function: given a mode, it returns the CLI flags, the settings and the note the agent is told.
// Nothing here spawns anything, so a test can read the flags a run would get (the way TauCetiReview's tests check a reviewer's argv) and
// containment-selftest.mjs can hand the same flags to the real CLI and watch it refuse.
//
//   shell      what the first version did: Bash and the whole machine, behind a hook that reads the text of a command and refuses `lake`,
//              `curl` and the like. A text filter cannot contain a shell (python -c, base64, $(...) all walk around it) and nothing stopped
//              the file tools reading ~/.ssh or a local Mathlib checkout. Kept only so an arm can be compared against it.
//   sandbox    Bash stays, inside the CLI's native macOS sandbox: writes only in the agent's own directory and the system temp directory,
//              no network at all (not even through the proxy), the home directory unreadable. The file tools (which the sandbox does not
//              cover) are confined to the same directory by the CLI's --restricted mode. Enforced by the operating system, not by reading
//              commands. failIfUnavailable makes the CLI refuse to start rather than run an unsandboxed shell.
//   restricted no shell at all: --restricted drops Bash and every other tool that runs code and confines Read/Write/Edit/Glob/Grep to the
//              working directory. What cannot run cannot be talked into running.
//
// A proof is true because Leak IV compiled it, so no program the agent runs can make one true: the shell is for numeric probing and notes.
// Measured against the real CLI 2.1.304 with decoy files (see the README): every read, search or write outside the directory refused,
// network refused, a background job's write refused, a Leak tool call allowed.

export const CONTAINMENT_MODES = ["sandbox", "restricted", "shell"]
export const DEFAULT_CONTAINMENT = "sandbox"
export const FILE_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"]
export const SANDBOX_TOOLS = ["Bash", ...FILE_TOOLS]

export const containmentMode = (value) => {
  const m = String(value ?? "").trim().toLowerCase()
  return CONTAINMENT_MODES.includes(m) ? m : DEFAULT_CONTAINMENT
}

// What a sandboxed shell may not read besides the whole home directory: the operator names more (colon separated), e.g. a Mathlib checkout
// that lives outside ~.
export const extraDenyRead = (value) => String(value ?? "").split(":").map((p) => p.trim()).filter((p) => p.startsWith("/") && p.length > 1)

export const NO_SHELL_NOTE = `YOU HAVE NO SHELL. Your tools are the Leak tools (verify_full_script, the searches, the memory) and Read, Write, Edit, Glob and Grep inside your own working directory, where your notes and scratch files live. Anything outside that directory is refused by the tool, and nothing you can reach runs a program. The reason is soundness, not bureaucracy: the only Lean that counts is your verifier's, and no program run here can make a proof true or tell you what that verifier would say. To test a numerical claim, state it as a Lean \`example\` and let \`decide\`, \`norm_num\` or \`simp\` check it through verify_full_script.`

export const SANDBOX_NOTE = `YOUR SHELL RUNS IN A SANDBOX. It can write only inside your own working directory and the system temp directory, it has no network at all, and your home directory is unreadable (so Python or tools installed under it will not run). Read, Write, Edit, Glob and Grep reach your working directory only. This is the operating system's rule, not a request: a command that tries anything else fails with "Operation not permitted" and nothing you try will change that, so do not spend turns on it. A shell is for scratch work and small numeric checks; the only Lean that counts is your verifier's, so state a numerical claim as a Lean \`example\` when it matters.`

// mode: sandbox | restricted | shell. workDir: the agent's own directory (required unless shell). serverNames: the MCP servers of its config.
// disallowed: tools the caller already bans (WebSearch/WebFetch). hookSettings: the settings object of the shell mode's hook (carried through,
// never rewritten, in sandbox mode, where it still counts what the agent reaches for).
// hasRestricted: whether the installed CLI knows --restricted (see cliHasRestricted). An older CLI rejects the flag and exits at once, so
// there the same confinement is built from permission rules: dontAsk refuses whatever no rule allows, and the file tools are allowed only
// inside the working directory (the shell, where there is one, stays inside the OS sandbox exactly as before).
export function containmentPlan({ mode, workDir, serverNames = [], disallowed = [], hookSettings = {}, denyRead = [], hasRestricted = true } = {}) {
  const m = containmentMode(mode)
  if (m === "shell") {
    return { mode: m, flags: ["--dangerously-skip-permissions"], disallowed: [...disallowed], settings: { ...hookSettings, autoMemoryEnabled: false }, note: "" }
  }
  if (typeof workDir !== "string" || !workDir.startsWith("/")) throw new Error("containment needs the agent's own absolute working directory")
  const servers = serverNames.map((n) => `mcp__${n}`)
  const flags = hasRestricted ? ["--restricted"] : ["--permission-mode", "dontAsk"]
  if (m === "sandbox") flags.push("--tools", ...SANDBOX_TOOLS)
  else if (!hasRestricted) flags.push("--tools", ...FILE_TOOLS)
  // the path rules: "//" starts an absolute path
  const inDir = FILE_TOOLS.filter((t) => t !== "Glob" && t !== "Grep").map((t) => `${t === "Write" || t === "Edit" ? t : "Read"}(/${workDir}/**)`)
  flags.push("--allowedTools", ...(hasRestricted ? FILE_TOOLS : [...new Set(inDir)]), ...(!hasRestricted && m === "sandbox" ? ["Bash"] : []), ...servers)
  const banned = [...new Set([...disallowed, "Task", "WebSearch", "WebFetch", ...(m === "restricted" ? ["Bash"] : [])])]
  if (m === "restricted") return { mode: m, flags, disallowed: banned, settings: { autoMemoryEnabled: false }, note: NO_SHELL_NOTE }
  return {
    mode: m,
    flags,
    disallowed: banned,
    settings: {
      ...hookSettings,
      autoMemoryEnabled: false,
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        allowUnsandboxedCommands: false,
        filesystem: { denyRead: ["~/", ...denyRead], allowRead: [workDir] },
        network: { allowedDomains: [], strictAllowlist: true },
      },
    },
    note: SANDBOX_NOTE,
  }
}

// Does the installed CLI know --restricted? Asked once, of the CLI's own help text (an unknown flag makes it exit before it does anything).
const _restrictedKnown = new Map()
export function cliHasRestricted(bin = "claude") {
  if (_restrictedKnown.has(bin)) return _restrictedKnown.get(bin)
  let known = true // if the help cannot be read, assume a current CLI: a refusal then shows up as the error it is
  try {
    // through a file: the CLI exits without flushing a pipe, and a long help text arrives cut at 8 KiB
    const dir = mkdtempSync(join(tmpdir(), "leak-help-"))
    const out = join(dir, "help.txt")
    try {
      spawnSync("sh", ["-c", '"$LEAK_BIN" --help > "$LEAK_OUT" 2>&1'], { env: { ...process.env, LEAK_BIN: bin, LEAK_OUT: out }, timeout: 20000, stdio: "ignore" })
      const text = readFileSync(out, "utf8")
      if (text.includes("--permission-mode")) known = text.includes("--restricted")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  } catch { /* keep the assumption */ }
  _restrictedKnown.set(bin, known)
  return known
}

// The environment an isolated agent's CLI starts with. The agent can print what a shell or a tool can see, and what it prints goes to the run's
// transcript, so a variable that looks like a secret is not passed on. The CLI's own credentials are kept (it cannot sign in without them); the
// sandbox has no network, so what remains can leave only as text the agent writes. Shell mode keeps the whole environment, as it always did.
const SECRET_NAME = /(TOKEN|SECRET|PASSW|CREDENTIAL|PRIVATE|API_?KEY|ACCESS_?KEY|SESSION_KEY|COOKIE|BRIDGE)/i
const CLI_OWN = /^(ANTHROPIC_|CLAUDE_CODE_)/
export function scrubbedEnv(env = {}, mode = DEFAULT_CONTAINMENT) {
  if (containmentMode(mode) === "shell") return { ...env }
  const out = {}
  for (const [k, v] of Object.entries(env)) if (CLI_OWN.test(k) || !SECRET_NAME.test(k)) out[k] = v
  return out
}
