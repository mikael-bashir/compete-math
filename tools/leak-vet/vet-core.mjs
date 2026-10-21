// Vetting a Leak target before any run is paid for: pure helpers (no network), tested in tests/leak-vet/. The checks are the part of Tau Ceti's
// roadmap-time gate that can be done mechanically against Leak IV: the statement compiles with only the expected sorry, neither it nor its
// negation falls to a cheap tactic (a "hard" problem that `decide` or `simp` closes is a misformalisation or a triviality), the tactic battery
// itself is not broken (it closes an easy truth and fails on an easy falsehood), and the seeds that back the target's `checks` really compile.

// The cheap closers tried on the statement and on its negation. A real open problem must survive every one.
export const CHEAP_TACTICS = ["decide", "simp", "omega", "norm_num", "aesop", "tauto", "positivity", "exact?"]

// `[open … in] theorem NAME : P := by sorry` with no binders before the colon (the form a question target must have).
export function splitStatement(statement) {
  const m = /^((?:open[^\n]*?\bin\s*\n)*)\s*theorem\s+([A-Za-z0-9_'.]+)\s*:\s*([\s\S]*?)\s*:=\s*by\s*(?:\n\s*)?sorry\s*$/.exec(String(statement).trim())
  if (!m) return null
  return { prefix: m[1], name: m[2], prop: m[3].trim() }
}

// the same statement with a different closing tactic, or as its negation
export function withProof(parts, tactic) {
  return `${parts.prefix}theorem ${parts.name} : ${parts.prop} := by\n  ${tactic}\n`
}
export function negation(parts, tactic) {
  return `${parts.prefix}theorem ${parts.name}_neg : ¬ (${parts.prop}) := by\n  ${tactic}\n`
}

const withImport = (script) => (/^\s*import\s/m.test(script) ? script : `import Mathlib\n${script}`)
export const asScript = withImport

// what Leak IV said, read the way the bridge reads it (a failure header anywhere means failure)
export function outcome(text) {
  const t = String(text || "")
  const failed = /compilation failed|❌/i.test(t)
  const ok = /compilation successful|100% verified/i.test(t) && !failed
  const errors = [...t.matchAll(/^\s*Line\s+\d+\s*\(Error\)\s*:\s*(.*)$/gim)].map((m) => m[1].trim())
  const sorry = /declaration uses `?sorry`?/i.test(t)
  const repudiated = /statement form repudiated/i.test(t)
  return { ok, failed, errors, sorry, repudiated, onlySorry: failed && errors.length === 0 && sorry }
}

// the verdicts of one target, from what the verifier returned for each probe. Each entry is {name, pass, detail}.
export function judge(target, probes) {
  const out = []
  const add = (name, pass, detail = "") => out.push({ name, pass, detail })
  const parts = splitStatement(target.statement)
  add("the statement has the plain form `theorem NAME : P := by sorry`", Boolean(parts), parts ? "" : "binders before the colon or another shape: the question forms cannot be built")
  if (target.question === "yes-no") add("a yes-no target is a closed statement", Boolean(parts), "")
  const c = probes.compile
  add("the statement compiles on Leak IV with only the expected sorry", Boolean(c) && (c.ok || c.onlySorry) && !c.repudiated, c ? c.errors.slice(0, 2).join(" | ") || (c.repudiated ? "answer-slot form" : "") : "no result")
  const ctl = probes.control
  add("the tactic battery is not broken (it closes `2 + 2 = 4` and not `2 + 2 = 5`)", Boolean(ctl) && ctl.easyTrue && !ctl.easyFalse, ctl ? `closes true: ${ctl.easyTrue}, closes false: ${ctl.easyFalse}` : "not run")
  for (const [form, results] of Object.entries(probes.cheap || {})) {
    const closed = Object.entries(results).filter(([, o]) => o && o.ok).map(([t]) => t)
    add(`no cheap tactic closes the ${form}`, closed.length === 0, closed.length ? `closed by: ${closed.join(", ")}` : "")
  }
  const seeds = probes.seeds || []
  const seedCount = Array.isArray(target.seeds) ? target.seeds.length : 0
  add("the seeds backing the target's checks compile with no sorry", seeds.length === seedCount && seeds.every((o) => o && o.ok), seeds.map((o, i) => (o && o.ok ? "" : `seed ${i + 1}: ${(o?.errors || []).slice(0, 1).join("") || "failed"}`)).filter(Boolean).join(" | "))
  add("the informal reading and the provenance are written down", Boolean(String(target.informal || "").trim()) && Boolean(target.provenance && Object.keys(target.provenance).length), "")
  return out
}

// Server-sent events out of a growing text buffer. The Leak servers end their events with CRLF; a parser that only knows "\n\n" waits for ever.
// Returns the events found ({event, data}) and the rest of the buffer.
export function takeEvents(buffer) {
  let buf = String(buffer).replace(/\r\n/g, "\n")
  const events = []
  let i
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const raw = buf.slice(0, i)
    buf = buf.slice(i + 2)
    const event = /^event:\s*(.*)$/m.exec(raw)?.[1] || ""
    const data = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n")
    events.push({ event, data })
  }
  return { events, rest: buf }
}
