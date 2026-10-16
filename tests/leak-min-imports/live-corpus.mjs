// node tests/leak-min-imports/live-corpus.mjs [--dir tests/leak-min-imports/corpus] [--bank ~/.leak-proof-bank.json] [--step 3] [--limit 24] [--url https://barkingtree-leak-iv.hf.space] [--out out.jsonl]
// Runs minimizeImports on real banked proofs against the live Leak IV: each proof is verified as it is stored (that gives the daemon's normalised text), then narrowed.
// One JSON line per proof. Not part of `npm test`: it needs the network and a warm daemon, and takes minutes per proof.
import { readFileSync, appendFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { minimizeImports, isSuccess } from "../../public/leak-min-imports.mjs"
import { callTool } from "./mcp-client.mjs"

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i >= 0 ? process.argv[i + 1] : d
}
const bankPath = arg("bank", `${homedir()}/.leak-proof-bank.json`)
const step = Number(arg("step", "3"))
const limit = Number(arg("limit", "24"))
const url = arg("url", "https://barkingtree-leak-iv.hf.space")
const out = arg("out", "live-corpus.jsonl")
writeFileSync(out, "")

import { readdirSync } from "node:fs"
const dir = arg("dir", "")
const entries = dir
  ? readdirSync(dir).filter((f) => f.endsWith(".lean")).sort().map((f) => ({ name: f.replace(/\.lean$/, ""), toolchain: "corpus", proof: readFileSync(`${dir}/${f}`, "utf8") }))
  : Object.values(JSON.parse(readFileSync(bankPath, "utf8")).entries).filter((e) => /^import /m.test(e.proof))
const picked = entries.filter((_, i) => i % step === 0).slice(0, limit)
const verify = (s) => callTool(url, "verify_full_script", { script: s }, { timeoutMs: 600000 })
for (const e of picked) {
  const t0 = Date.now()
  const rec = { name: e.name, toolchain: e.toolchain }
  try {
    const v = await verify(e.proof)
    rec.rawOk = isSuccess(v.text)
    if (rec.rawOk) {
      const m = /\[\[LEAK_NORMALIZED_SCRIPT_B64:([A-Za-z0-9+/=]+)\]\]/.exec(v.text)
      const normalized = m ? Buffer.from(m[1], "base64").toString("utf8") : e.proof
      const t1 = Date.now()
      const r = await minimizeImports(normalized, verify)
      rec.narrowed = r.narrowed
      rec.reason = r.reason
      rec.from = r.from
      rec.imports = r.imports
      rec.detail = r.detail ? JSON.stringify(r.detail).slice(0, 200) : undefined
      rec.minimizeSecs = Math.round((Date.now() - t1) / 1000)
    } else rec.rawText = v.text.slice(0, 160)
  } catch (err) {
    rec.error = String(err?.message || err)
  }
  rec.secs = Math.round((Date.now() - t0) / 1000)
  appendFileSync(out, JSON.stringify(rec) + "\n")
  console.log(JSON.stringify({ name: rec.name, rawOk: rec.rawOk, narrowed: rec.narrowed, reason: rec.reason, n: rec.imports?.length, secs: rec.secs }))
}
