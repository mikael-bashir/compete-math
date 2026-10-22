#!/usr/bin/env node
// Vet every Leak target (or the ids named) against Leak IV before a run is paid for.
//   node tools/leak-vet/vet.mjs [target-id ...]            LEAK_IV_URL overrides https://barkingtree-leak-iv.hf.space/sse
// Exit status 1 if any check fails. Needs the network; it is not part of `pnpm test`.
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { CHEAP_TACTICS, asScript, judge, negation, splitStatement, withProof } from "./vet-core.mjs"
import { connect } from "./iv-client.mjs"

const URL_IV = process.env.LEAK_IV_URL || "https://barkingtree-leak-iv.hf.space/sse"
const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, "../../src/data/leak-targets")

const ids = process.argv.slice(2)
const targets = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8"))).filter((t) => !ids.length || ids.includes(t.id))
if (!targets.length) {
  console.error("no target matches")
  process.exit(2)
}
const iv = await connect(URL_IV, { timeoutMs: Number(process.env.LEAK_VET_TIMEOUT_MS) || 240000 })
let failed = 0
for (const t of targets) {
  console.log(`\n== ${t.id}: ${t.title}`)
  const parts = splitStatement(t.statement)
  const probes = { cheap: {} }
  probes.compile = await iv.verify(asScript(t.statement), "compile")
  probes.control = {
    easyTrue: (await iv.verify(asScript("theorem vet_true : 2 + 2 = 4 := by\n  decide\n"), "control true")).ok,
    easyFalse: (await iv.verify(asScript("theorem vet_false : 2 + 2 = 5 := by\n  decide\n"), "control false")).ok,
  }
  if (parts) {
    for (const [form, make] of [["statement", withProof], ["negation", negation]]) {
      probes.cheap[form] = {}
      for (const tac of CHEAP_TACTICS) probes.cheap[form][tac] = await iv.verify(asScript(make(parts, tac)), `${form} by ${tac}`)
    }
  }
  probes.seeds = []
  for (const [i, s] of (t.seeds || []).entries()) probes.seeds.push(await iv.verify(asScript(s), `seed ${i + 1}`))
  for (const v of judge(t, probes)) {
    console.log(`${v.pass ? "ok  " : "FAIL"} ${v.name}${v.detail ? `  [${v.detail}]` : ""}`)
    if (!v.pass) failed++
  }
}
console.log(failed ? `\n${failed} check(s) failed` : "\nevery target passed")
process.exit(failed ? 1 : 0)
