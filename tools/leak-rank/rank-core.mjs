// Ranking the theorems a Leak run banked, one to five stars. Pure (no network, no files), so the rules can be read and tested.
//
// Three sources of evidence, kept apart so a reader can see which one moved a rating:
//   features   what the entry itself shows: how big the proof is, whether the statement has any variable at all, how many other banked entries
//              rest on it, whether it states the target given something smaller.
//   probes     two questions put to Leak IV about the statement alone: does a one-line automatic tactic prove it ("cheap"), and does a single
//              existing lemma prove it (`exact?`, "library"). Either answer says the entry added little.
//   reading    a model's reading of the theorem (what it says, how deep the proof is, how general, what it is worth to the target, whether it is
//              probably in Mathlib already, whether its hypotheses look unsatisfiable). Several independent draws; where they disagree the
//              rating says so.
// The rule that turns them into stars is `stars()` and is short on purpose: caps first (what the mechanical evidence rules out), then a weighted
// score of the reading and the reuse. Every rating carries its reasons.

const DECL = /^[ \t]*(?:@\[[^\]]*\][ \t\r\n]*)*(?:private[ \t]+)?(theorem|lemma|def|abbrev|instance|structure|inductive|class)[ \t]+([A-Za-z0-9_'.]+)/gm

export const normalise = (s) => String(s || "").replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim()

// names declared in a closure, in order
export function declaredNames(closure) {
  const out = []
  for (const m of String(closure).matchAll(DECL)) out.push({ kind: m[1], name: m[2], at: m.index })
  return out
}

// the position of the first `:=` outside brackets after `from`: the end of a declaration's statement
function statementEnd(text, from) {
  let depth = 0
  for (let i = from; i < text.length - 1; i++) {
    const c = text[i]
    if ("([{⟨".includes(c)) depth++
    else if (")]}⟩".includes(c)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && c === ":" && text[i + 1] === "=") return i
  }
  return -1
}

// the entry's own declaration inside its closure: what comes before it (helpers), its statement, and its proof
export function splitClosure(closure, name) {
  const decls = declaredNames(closure)
  const d = [...decls].reverse().find((x) => x.name === name && (x.kind === "theorem" || x.kind === "lemma")) || [...decls].reverse().find((x) => x.kind === "theorem" || x.kind === "lemma")
  if (!d) return null
  // an `open … in` line directly above belongs to the declaration
  let start = d.at
  const before = closure.slice(0, start)
  const m = /((?:^|\n)[ \t]*open[^\n]*\bin[ \t]*\n)$/.exec(before)
  if (m) start = before.length - m[1].length + (m[1].startsWith("\n") ? 1 : 0)
  const end = statementEnd(closure, d.at)
  if (end < 0) return null
  return { helpers: closure.slice(0, start), header: closure.slice(start, end).trim(), proof: closure.slice(end + 2).trim(), name: d.name }
}

// the proposition of a header, after the binders: `theorem n (x : A) : P` -> { binders, prop }
export function splitHeader(header) {
  const m = /^(?:open[^\n]*\bin\s*)*(?:@\[[^\]]*\]\s*)?(?:private\s+)?(?:theorem|lemma)\s+[A-Za-z0-9_'.]+/.exec(header)
  if (!m) return null
  const rest = header.slice(m[0].length)
  let depth = 0
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i]
    if ("([{⟨".includes(c)) depth++
    else if (")]}⟩".includes(c)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && c === ":" && rest[i + 1] !== "=") return { binders: rest.slice(0, i).trim(), prop: rest.slice(i + 1).trim() }
  }
  return null
}

const PROP_VARIABLES = /[∀∃]|\bfun\b|λ|\bΠ\b/

// a numeric fact: no binder before the colon and nothing quantified inside, so it holds of particular numbers and of nothing else
export function isGround(header) {
  const h = splitHeader(header)
  if (!h) return false
  return h.binders === "" && !PROP_VARIABLES.test(h.prop)
}

const ONE_LINERS = new Set(["decide", "simp", "omega", "norm_num", "rfl", "aesop", "positivity", "ring", "linarith", "nlinarith", "tauto", "trivial", "exact?"])
export function proofShape(proof) {
  const p = String(proof || "").trim()
  const lines = p.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).length
  const m = /^by\s+([^\n]*)$/.exec(p)
  const first = m ? m[1].trim().split(/[\s;]/)[0] : ""
  const oneLiner = lines <= 1 && (ONE_LINERS.has(first) || /^decide\b/.test(first) || /^by\s+decide/.test(p))
  return { lines, oneLiner, tactic: first }
}

// features for every distinct entry. `entries` are {key, entry, runs}; `target` is the target's proposition (the part after the colon).
export function features(entries, target = "") {
  const byName = new Map()
  const decls = entries.map((e) => declaredNames(e.entry.closure))
  entries.forEach((e, i) => {
    if (!byName.has(e.entry.name)) byName.set(e.entry.name, [])
    byName.get(e.entry.name).push(i)
  })
  const usedBy = new Map()
  entries.forEach((e, i) => {
    for (const d of decls[i]) {
      if (d.name === e.entry.name) continue
      for (const j of byName.get(d.name) || []) if (j !== i) usedBy.set(j, (usedBy.get(j) || new Set()).add(i))
    }
  })
  const tgt = normalise(target).replace(/^open Nat in\s*/, "")
  const seen = new Map()
  return entries.map((e, i) => {
    const parts = splitClosure(e.entry.closure, e.entry.name)
    const header = parts ? parts.header : e.entry.statement
    const h = parts ? splitHeader(parts.header) : null
    const shape = proofShape(parts ? parts.proof : "")
    const prop = h ? normalise(h.prop) : ""
    const dupKey = normalise(header).replace(/^(?:open[^\n]*\bin\s*)*(?:theorem|lemma)\s+[A-Za-z0-9_'.]+/, "")
    const duplicateOf = seen.get(dupKey) || null
    if (!seen.has(dupKey)) seen.set(dupKey, e.entry.name)
    return {
      name: e.entry.name,
      origin: e.entry.origin,
      split: Boolean(parts),
      ground: parts ? isGround(parts.header) : false,
      proofLines: shape.lines,
      oneLiner: shape.oneLiner,
      helpers: parts ? declaredNames(parts.helpers).length : 0,
      usedBy: usedBy.get(i)?.size || 0,
      keystone: Boolean(tgt && prop && (prop === tgt || (prop.includes(tgt) && prop.length < tgt.length * 3))),
      subsumed: Boolean(e.entry.subsumedBy),
      abstracted: e.entry.origin === "abstracted",
      seed: e.entry.origin === "seed",
      recalled: Number(e.entry.hits || 0),
      duplicateOf,
      runs: e.runs,
    }
  })
}

// the two questions put to the verifier about one entry's statement: the closure with its proof replaced by a tactic
export const CHEAP = "first | decide | simp | omega | norm_num | aesop | positivity"
// `first` leaves its later alternatives unexecuted, and Lean's linter says so in a warning; Leak IV counts a warning as a failed compile, so
// without this line the battery could never succeed (the first full run found nothing cheap in 566 entries because of exactly that)
export const QUIET = "set_option linter.unreachableTactic false in\nset_option linter.unusedTactic false in\n"
export function probeScripts(entry) {
  const parts = splitClosure(entry.closure, entry.name)
  if (!parts) return null
  const build = (tactic) => {
    const body = `${parts.helpers}${QUIET}${parts.header} := by\n  ${tactic}\n`
    return /^\s*import\s/m.test(body) ? body : `import Mathlib\n${body}`
  }
  return { cheap: build(CHEAP), library: build("exact?") }
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const reuseScore = (n) => (n >= 4 ? 5 : n >= 2 ? 3.5 : n === 1 ? 2.5 : 1)

// combine the draws of the reading: means for the scales, the most common answer for the labels, and how far the draws spread
export function summariseReading(draws) {
  const ds = (draws || []).filter(Boolean)
  if (!ds.length) return null
  const num = (k) => mean(ds.map((d) => Number(d[k])).filter((x) => Number.isFinite(x)))
  const mode = (k) => {
    const c = new Map()
    for (const d of ds) if (d[k] != null) c.set(d[k], (c.get(d[k]) || 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const spread = Math.max(...["depth", "generality", "role"].map((k) => {
    const v = ds.map((d) => Number(d[k])).filter((x) => Number.isFinite(x))
    return v.length ? Math.max(...v) - Math.min(...v) : 0
  }))
  return { draws: ds.length, depth: num("depth"), generality: num("generality"), role: num("role"), kind: mode("kind"), inMathlib: mode("inMathlib"), vacuous: mode("vacuous"), says: ds[0].says || "", spread }
}

// stars (1-5) and the reasons for them. `probes` is {cheap, library} booleans or null (not run); `reading` is summariseReading()'s output or null.
export function stars(f, probes, reading) {
  const reasons = []
  let cap = 5
  const capAt = (n, why) => {
    if (n < cap) cap = n
    reasons.push(`capped at ${n}: ${why}`)
  }
  if (f.duplicateOf) {
    return { stars: 1, reasons: [`the same statement as ${f.duplicateOf}`], rated: true }
  }
  if (probes?.cheap) capAt(1, "a one-line automatic tactic proves it")
  if (probes?.library) capAt(2, "a single existing lemma proves it")
  if (f.ground) capAt(2, "a numeric fact, with no variable in it")
  if (reading?.inMathlib === "yes") capAt(2, "the reader says Mathlib already has it")
  if (reading?.vacuous === "likely") capAt(1, "the hypotheses look unsatisfiable")
  if (!reading) return { stars: null, reasons: reasons.length ? reasons : ["not read yet"], rated: false, cap }
  const role = 1 + (clamp(reading.role ?? 0, 0, 3) * 4) / 3
  const score = 0.35 * clamp(reading.depth ?? 1, 1, 5) + 0.25 * clamp(reading.generality ?? 1, 1, 5) + 0.25 * role + 0.15 * reuseScore(f.usedBy)
  let s = clamp(Math.round(score), 1, 5)
  reasons.push(`score ${score.toFixed(2)} from depth ${fmt(reading.depth)}, generality ${fmt(reading.generality)}, worth to the target ${fmt(reading.role)} of 3, used by ${f.usedBy} other entries`)
  if (f.keystone && (reading.role ?? 0) >= 2.5 && !probes?.library && !probes?.cheap) {
    if (s < 4) reasons.push("raised to 4: it states the target from smaller hypotheses")
    s = Math.max(s, 4)
  }
  if (f.usedBy >= 4 && s < 3 && cap >= 3) {
    reasons.push("raised to 3: four or more other entries rest on it")
    s = 3
  }
  return { stars: Math.min(s, cap), reasons, rated: true, cap, spread: reading.spread }
}

const fmt = (x) => (Number.isFinite(x) ? x.toFixed(1) : "?")

export function distribution(rows) {
  const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unrated: 0 }
  for (const r of rows) d[r.stars == null ? "unrated" : r.stars]++
  return d
}

// the battery is checked before it is trusted: it must close an easy truth and not an easy falsehood, with each of the two tactics used
export const CONTROLS = [
  { name: "cheap closes a truth", script: `import Mathlib\n${QUIET}theorem c1 : 2 + 2 = 4 := by\n  ${CHEAP}\n`, expect: true },
  { name: "cheap does not close a falsehood", script: `import Mathlib\n${QUIET}theorem c2 : 2 + 2 = 5 := by\n  ${CHEAP}\n`, expect: false },
  { name: "exact? closes a truth", script: "import Mathlib\ntheorem c3 (a b : ℕ) : a + b = b + a := by\n  exact?\n", expect: true },
  { name: "exact? does not close a falsehood", script: "import Mathlib\ntheorem c4 (a b : ℕ) : a + b = b + b := by\n  exact?\n", expect: false },
]
