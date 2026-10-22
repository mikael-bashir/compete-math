// Reads the memory sidecars a Leak run leaves (<run>.memory.json) and returns the distinct banked entries, each with the runs it appeared in.
import { readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { normalise } from "./rank-core.mjs"

export function loadEntries(dir, { targetId = "" } = {}) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".memory.json")).sort()
  const byKey = new Map()
  for (const f of files) {
    let d
    try {
      d = JSON.parse(readFileSync(join(dir, f), "utf8"))
    } catch {
      continue
    }
    if (targetId && d.target_id !== targetId) continue
    const run = basename(f).replace(/\.memory\.json$/, "")
    for (const e of d.entries || []) {
      if (!e || !e.closure || !e.name) continue
      const key = normalise(e.statement || e.closure)
      const prev = byKey.get(key)
      if (prev) prev.runs.push({ run, variant: d.variant, origin: e.origin })
      else byKey.set(key, { key, entry: e, runs: [{ run, variant: d.variant, origin: e.origin }] })
    }
  }
  return [...byKey.values()].map((x, i) => ({ ...x, id: `${x.entry.name}#${i}` }))
}
