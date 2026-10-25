// node scripts/dump-leak-prompts.mjs [variant] > docs/leak-misery-prompts.md
// Writes down everything the harness says to an agent of one memory variant (default: control-misery), from the code that says it:
//   - the system prompt addendum and the first prompt of a new conversation, as the real bridge hands them to a stand-in `claude`
//   - the reminders of a resumed conversation (continue, nudge), the sleep stage prompts (merging, rating)
//   - the description of every lab tool, read from the server files
// The bridge runs against the stand-in CLI and fake Leak servers of tests/leak-memory, so nothing real is called.
import { spawn, execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import { startFakeLeak } from "../tests/leak-memory/fake-leak.mjs"
import * as M from "../public/leak-memory.mjs"
import { readingPrompt } from "../public/leak-quality.mjs"

const variant = process.argv[2] || "control-misery"
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, "..")
const cfg = M.VARIANTS[variant]
if (!cfg) throw new Error(`unknown variant ${variant}`)
const lab = M.labOf(variant)
const fence = (t, lang = "") => "````" + lang + "\n" + String(t).replace(/\s+$/, "") + "\n````"

// ---- the first prompt, from the bridge itself
const leak = await startFakeLeak()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dump-prompts-"))
const HOME = fs.mkdtempSync(path.join(tmp, "home-"))
const PORT = 4700 + Math.floor(Math.random() * 200)
const bridge = spawn(process.execPath, [path.join(root, "public", "local-claude-bridge.mjs")], {
  env: {
    PATH: process.env.PATH, TMPDIR: tmp, HOME, PORT: String(PORT), BRIDGE_TOKEN: "t", LEAK_PROOF_BANK: path.join(HOME, "bank.json"),
    CLAUDE_BIN: path.join(root, "tests", "leak-memory", "fake-claude.mjs"), FAKE_SEARCH: "1", FAKE_MODE: "ok", FAKE_LAB: "1",
    FAKE_REPORT: path.join(HOME, "report.jsonl"),
    LEAK_LAB_CAS_URL: `http://127.0.0.1:${leak.port}/labcas/sse`, LEAK_LAB_ATP_URL: `http://127.0.0.1:${leak.port}/labatp/sse`,
  },
  stdio: ["ignore", "pipe", "pipe"],
})
let log = ""
bridge.stdout.on("data", (d) => (log += d))
bridge.stderr.on("data", (d) => (log += d))
for (let i = 0; i < 100 && !/127\.0\.0\.1|localhost/.test(log); i++) await new Promise((r) => setTimeout(r, 100))
const THEOREM = "theorem target_example (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0 := by\n  sorry"
const res = await fetch(`http://127.0.0.1:${PORT}/prove-tree`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-bridge-token": "t", origin: "http://localhost:3000" },
  body: JSON.stringify({
    theorem: THEOREM, model: "sonnet",
    mcpServers: [
      { name: "Leak_IV", url: `http://127.0.0.1:${leak.port}/iv/sse`, tools: ["verify_full_script"] },
      { name: "Leak_I", url: `http://127.0.0.1:${leak.port}/i/sse`, tools: [{ name: "moogle_search", args: ["concept"] }] },
      { name: "Leak_II", url: `http://127.0.0.1:${leak.port}/ii/sse`, tools: ["init_proof", "apply_tactic", "get_current_proof_state", "snapshot_state", "branch_tactics"] },
    ],
    options: { strategy: variant, computeBudgetMs: 120000, targetId: "dump-1", memory: { entries: [] } },
  }),
})
let buf = ""
const dec = new TextDecoder()
let firstPrompt = null
outer: for await (const chunk of res.body) {
  buf += dec.decode(chunk, { stream: true })
  let i
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const raw = buf.slice(0, i)
    buf = buf.slice(i + 2)
    const d = raw.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("")
    if (!d) continue
    try {
      const f = JSON.parse(d)
      if (f.type === "prompt" && /attempt 1/.test(f.prompt || "") && /SYSTEM PROMPT ADDENDUM/.test(f.prompt || "")) { firstPrompt = f.prompt; break outer }
    } catch {}
  }
}
bridge.kill()
leak.close?.()
if (!firstPrompt) throw new Error("the bridge never sent the first prompt:\n" + log.slice(-1500))
const [promptPart, addendumPart] = firstPrompt.split(/\n\n=== SYSTEM PROMPT ADDENDUM[^\n]*===\n/)

// ---- the lab tools, from the server files
const py = `
import ast, json, sys
out = {}
for server, path in (("Leak_Lab_CAS", "services/leak-lab/lab_cas/server.py"), ("Leak_Lab_ATP", "services/leak-lab/lab_atp/server.py")):
    tree = ast.parse(open(path, encoding="utf8").read())
    tools = []
    for n in tree.body:
        if isinstance(n, ast.FunctionDef) and any((isinstance(d, ast.Attribute) and d.attr == "tool") or (isinstance(d, ast.Name) and d.id == "tool") for d in n.decorator_list):
            params = []
            for a in n.args.args:
                desc = None
                if isinstance(a.annotation, ast.Subscript):
                    for sub in ast.walk(a.annotation):
                        if isinstance(sub, ast.Call) and getattr(sub.func, "id", "") == "Field":
                            for kw in sub.keywords:
                                if kw.arg == "description":
                                    desc = kw.value.value if isinstance(kw.value, ast.Constant) else "(given by a named constant)"
                params.append([a.arg, desc])
            tools.append({"name": n.name, "doc": ast.get_docstring(n) or "", "params": params})
    out[server] = tools
print(json.dumps(out))
`
const labTools = JSON.parse(execFileSync("python3", ["-I", "-c", py], { cwd: root }).toString())

// ---- put it together
const out = []
const h = (n, t) => out.push(`${"#".repeat(n)} ${t}\n`)
const p = (t) => out.push(t + "\n")
h(1, `Everything the harness says to an agent of ${cfg.name || variant}`)
p(`Generated by \`node scripts/dump-leak-prompts.mjs ${variant}\` from the code that says it; run it again after changing a prompt. The first prompt comes from the real bridge (stand-in \`claude\`, fake Leak servers); the rest are rendered by the functions that the bridge calls. Variant: \`${variant}\` — ${cfg.blurb || ""}`)
p(`Voice: \`${cfg.voice || "curious"}\`. Servers: Leak I (search), Leak IV (verify), ${cfg.pantograph ? "Leak II (Pantograph), " : ""}memory tools, ${lab.map((l) => l.label || l.key).join(" and ")}.`)
h(2, "Where each prompt goes")
p(`| # | prompt | when | who writes it |
|---|---|---|---|
| 1 | System prompt addendum | start of every new conversation (kept when resumed) | \`V.systemRule\` in public/leak-memory.mjs |
| 2 | First prompt | start of a new conversation (attempt 1, and after a restart) | \`controlMemoryPrompt\` in public/local-claude-bridge.mjs |
| 3 | Continue reminder | each time a stretch ends and the same conversation is resumed | \`V.continue\` |
| 4 | Nudge | a stretch that was short and verified nothing | \`V.nudge\` |
| 5 | Temperament card | in reminders, now and then | \`TEMPERAMENT_CARD\` |
| 6 | Sleep: merging | between stretches, over groups of related theorems (Lucid) | \`sleepPrompt\` |
| 7 | Sleep: rating | the same stage, one reading per theorem | \`readingPrompt\` in public/leak-quality.mjs |
| 8 | Tool descriptions | the model reads these in its tool list | the lab servers (section at the end) |

What the user sees but the agent does not: the 🩺 probe note and the "opening a new conversation" annotation when a conversation is restarted (the new conversation gets prompt 2 again, with the last submission carried forward).`)
h(2, "1. System prompt addendum")
p(fence(addendumPart ?? M.voiceFor(cfg.voice).systemRule))
h(2, "2. First prompt of a conversation")
p("The theorem at the bottom is an example. The tool section lists what the servers announce; with the stand-in servers used here that is a short list. Memory is empty in this example; with memory it adds a line with the count, and the last submission and the episodic notes when there are any.")
p(fence(promptPart))
const V = M.voiceFor(cfg.voice)
h(2, "3. Continue reminder (a resumed conversation)")
p("Rendered with sample values: second attempt, 12 minutes since the last stretch, 7 theorems in the library, Leak II connected. A question from the list in 5b is chosen each time.")
p(fence(V.continue({ attempt: 2, elapsedMs: 12 * 60000, libraryCount: 7, abstracted: ["general_lemma_example"], toolIds: ["mcp__Leak_IV__verify_full_script"], episodic: "", pantograph: !!cfg.pantograph, note: { next: "try the case n = 3 by interval_cases", found: "a residue pattern mod 8", stuck: "the induction step" }, rng: () => 1, turn: 0 })))
h(2, "4. Nudge (a short stretch with nothing new verified)")
p(fence(V.nudge({ elapsedMs: 90_000, libraryCount: 7, nudge: 1, of: 2, pantograph: !!cfg.pantograph, note: { next: "try the case n = 3 by interval_cases" }, toolIds: ["mcp__Leak_IV__verify_full_script"], turn: 0 })))
h(2, "5. Temperament card and the questions offered at reminders")
h(3, "5a. Temperament card")
p(fence(M.TEMPERAMENT_CARD))
h(3, "5b. The questions (one per reminder, in turn)")
M.CURIOSITY_PROMPTS.forEach((q, i) => out.push(`${i + 1}. ${q}`))
out.push("")
h(2, "6. Sleep stage: merging related theorems")
p("Sample with one group of two theorems.")
p(fence(M.sleepPrompt([
  { id: "aaaaaaaa11", name: "odd_add_odd_mod_two", closure: "theorem odd_add_odd_mod_two (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0 := by omega" },
  { id: "bbbbbbbb22", name: "odd_add_odd_mod_four", closure: "theorem odd_add_odd_mod_four (a b : ℕ) (ha : a % 4 = 1) (hb : b % 4 = 1) : (a + b) % 4 = 2 := by omega" },
], THEOREM)))
h(2, "7. Sleep stage: rating")
p(fence(readingPrompt([{ id: "aaaaaaaa", entry: { name: "odd_add_odd_mod_two", closure: "theorem odd_add_odd_mod_two (a b : ℕ) (ha : a % 2 = 1) (hb : b % 2 = 1) : (a + b) % 2 = 0 := by omega" }, features: { helpers: 0 } }], { target: THEOREM })))
h(2, "8. Tool descriptions (what the model reads in its tool list)")
p("Read from the server files, so they are exactly what the servers announce. Each tool's text is its docstring; parameters follow with their descriptions.")
for (const [server, tools] of Object.entries(labTools)) {
  if (!lab.some((l) => server.toLowerCase().includes(l.key))) continue
  h(3, `${server} (${tools.length} tools)`)
  for (const t of tools) {
    h(4, `\`${t.name}\``)
    p(fence(t.doc))
    if (t.params.length) p(t.params.map(([n, d]) => `- \`${n}\`${d ? `: ${d}` : ""}`).join("\n"))
  }
}
process.stdout.write(out.join("\n") + "\n")
process.exit(0)
