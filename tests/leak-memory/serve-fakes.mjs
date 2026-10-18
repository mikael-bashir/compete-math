// For looking at the playground by hand: a bridge with the fake claude CLI and fake Leak servers, in a throwaway HOME.
//   node tests/leak-memory/serve-fakes.mjs   →  prints the bridge URL, token and the two fake MCP urls
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import { startFakeLeak } from "./fake-leak.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "leak-memory-serve-"))
const leak = await startFakeLeak()
const PORT = 4890
spawn("node", [path.join(here, "../../public/local-claude-bridge.mjs")], {
  env: { ...process.env, HOME, LEAK_PROOF_BANK: path.join(HOME, "bank.json"), PORT: String(PORT), BRIDGE_TOKEN: "demo-token", CLAUDE_BIN: path.join(here, "fake-claude.mjs"), FAKE_SEARCH: "1" },
  stdio: "ignore",
})
console.log(JSON.stringify({ bridge: `http://localhost:${PORT}`, token: "demo-token", iv: `http://127.0.0.1:${leak.port}/iv/sse`, i: `http://127.0.0.1:${leak.port}/i/sse` }))
