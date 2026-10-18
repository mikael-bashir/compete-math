// public/leak-memory.mjs — theorem memory for the experimental Leak Control II variants.
//
// No network, no model: pure functions and one class, so the whole thing is tested without Leak. The bridge
// (public/local-claude-bridge.mjs) loads this file next to itself, exactly as it loads leak-min-imports.mjs.
//
// What is stored: only theorems that Leak IV has verified (a script that compiled with no error, no warning, no sorry).
// Every entry keeps compile-ready text (the declaration plus the local definitions and lemmas it needs), so a recalled
// entry can be pasted into a script and checked again: a wrong or stale memory costs one failed compile and cannot
// make a run claim something false.
//
// Whose memory: this module never knows a user. The browser (which has the session) sends the signed-in user's saved
// entries for the chosen target with the run request, and persists the entries this module reports back. The bridge
// holds nothing between runs, so nothing can leak from one account to another through it.
//
// The designs are the memory variants of the agentic-prover literature (DreamProver's sleep stage, LEGO-Prover's
// growing lemma set, lemma adjunction, SGCD's closure under subterms, Sledgehammer-style relevance, MemRL's episodic
// buffer), one Control II variant per design, so they can be compared on the same target.
import { createHash } from "node:crypto"

export const MAX_NOMINATED = 10 // what may go to Jinshi: three to ten, nominated by the author or the driver
export const MIN_NOMINATED = 3
export const MAX_ENTRIES = 600

// ---- variants -------------------------------------------------------------------------------------------------
// `key` is the strategy name the page sends. Everything else is configuration read by the bridge.
export const VARIANTS = {
  "control-honoured": {
    name: "Control II Honoured",
    blurb: "Append-only library with a recall tool. Every verified theorem is saved; the driver decides when to look.",
    tools: ["memory_recall", "memory_list", "memory_nominate"],
    episodic: 0,
    augmentSearch: false,
    sleep: null,
    attemptMs: 45 * 60_000,
  },
  "control-flint": {
    name: "Control II Flint",
    blurb: "Episodic replay. No tool: each fresh attempt opens with the theorems proved so far, put there by the harness.",
    tools: [],
    episodic: 10,
    augmentSearch: false,
    sleep: null,
    attemptMs: 30 * 60_000,
  },
  "control-paragon": {
    name: "Control II Paragon",
    blurb: "Library as part of search. Every Leak I search also returns the best matching verified theorems; plus the recall tool.",
    tools: ["memory_recall", "memory_list", "memory_nominate"],
    episodic: 0,
    augmentSearch: true,
    sleep: null,
    attemptMs: 45 * 60_000,
  },
  "control-lucid": {
    name: "Control II Lucid",
    blurb: "Sleep stage. Like Honoured, plus an hourly consolidation pass that generalises clusters of lemmas into abstract ones.",
    tools: ["memory_recall", "memory_list", "memory_nominate"],
    episodic: 0,
    augmentSearch: false,
    sleep: { everyMs: 60 * 60_000, minNew: 6, timeboxMs: 10 * 60_000 },
    attemptMs: 45 * 60_000,
  },
}
export const isMemoryVariant = (name) => Object.prototype.hasOwnProperty.call(VARIANTS, String(name))

// ---- reading a Lean script ------------------------------------------------------------------------------------
const MODS = "(?:private|protected|noncomputable|unsafe|partial|nonrec|scoped|local)"
const DECL_KW = "(?:theorem|lemma|def|abbrev|instance|structure|inductive|class|opaque|example)"
const START = new RegExp(`^(?:@\\[|/--|/-!|${MODS}\\s|${DECL_KW}(?=[\\s(\\[{:]|$)|open\\b|namespace\\b|section\\b|end\\b|variable\\b|universe\\b|set_option\\b|attribute\\b|notation\\b|macro\\b|syntax\\b|infix\\b|#)`)

const stripComments = (s) => String(s || "").replace(/\/-[\s\S]*?-\//g, " ").replace(/--[^\n]*/g, " ")
const hasSorry = (s) => /\b(?:sorry|admit)\b/.test(stripComments(s)) || /\bnative_decide\b/.test(stripComments(s))
export const canon = (s) => String(s || "").replace(/\s+/g, " ").trim()
const sha1 = (s) => createHash("sha1").update(s).digest("hex")

// Split a script into top-level blocks. A docstring or an attribute line belongs to the declaration after it.
export function splitDeclarations(script) {
  const lines = String(script || "").replace(/\r/g, "").split("\n")
  const blocks = []
  let cur = []
  let inDoc = false
  let pending = false // the current block holds only doc/attribute lines so far
  const flush = () => {
    if (cur.join("").trim()) blocks.push(cur.join("\n").replace(/\s+$/, ""))
    cur = []
    pending = false
  }
  for (const ln of lines) {
    const col0 = ln.length > 0 && !/^\s/.test(ln)
    if (inDoc) {
      cur.push(ln)
      if (/-\//.test(ln)) inDoc = false
      continue
    }
    if (col0 && START.test(ln)) {
      const isDoc = /^\/--/.test(ln) || /^@\[/.test(ln)
      if (!(pending && cur.length)) flush()
      cur.push(ln)
      if (/^\/--/.test(ln) && !/-\//.test(ln.slice(3))) inDoc = true
      pending = isDoc || /^open\b.*\bin\s*$/.test(ln.trim()) || /^(?:private|protected|noncomputable|unsafe|partial|nonrec|scoped|local)\s*$/.test(ln.trim())
      continue
    }
    if (col0 && ln.trim() === "") {
      cur.push(ln)
      continue
    }
    cur.push(ln)
    pending = false
  }
  flush()
  return blocks
}

const KW_RE = new RegExp(`\\b(${DECL_KW})\\b`)
// "theorem" | "lemma" | "def" | ... | "open" | "namespace" | ... for one block
export function blockHead(block) {
  // `open Nat in` before a declaration belongs to that declaration
  const body = stripComments(block).replace(/@\[[^\]]*\]/g, " ").replace(/^\s*open\b[^\n]*\bin\s*/, "").trim()
  const first = body.split(/\s+/).filter((w) => !new RegExp(`^${MODS}$`).test(w))[0] || ""
  if (new RegExp(`^${DECL_KW}$`).test(first)) return first
  return first.replace(/[^a-z_]/gi, "") || "other"
}
export function blockName(block) {
  const m = stripComments(block).match(new RegExp(`\\b${DECL_KW}\\s+([^\\s({\\[:]+)`))
  return m ? m[1] : ""
}

// The statement of a theorem/lemma: from its keyword to the first `:=` (or `where`) outside brackets.
export function statementOf(block) {
  const text = String(block || "")
  const m = text.match(/\b(?:theorem|lemma)\b/)
  if (!m) return ""
  let i = m.index
  const start = i
  let depth = 0
  for (; i < text.length; i++) {
    const c = text[i]
    if ("([{⟨⦃".includes(c)) depth++
    else if (")]}⟩⦄".includes(c)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && text.startsWith(":=", i)) break
    else if (depth === 0 && /^where\b/.test(text.slice(i, i + 6)) && /\s/.test(text[i - 1] || " ")) break
  }
  return text.slice(start, i).trim()
}
export const proofOf = (block) => {
  const s = statementOf(block)
  if (!s) return ""
  const at = String(block).indexOf(s)
  return String(block).slice(at + s.length).trim()
}

// Words that a block mentions, for finding which earlier declarations it needs.
const words = (s) => new Set((stripComments(s).match(/[A-Za-z_][A-Za-z0-9_'.]*/g) || []).flatMap((w) => [w, ...w.split(".")]))

const TRIVIAL_PROOF = /^:=\s*(?:by\s+)?(?:rfl|simp|simp_all|simp only \[[^\]]*\]|norm_num|decide|omega|trivial|ring|linarith|nlinarith|positivity|tauto|aesop)\s*$/

export function isTrivial(statement, proof, opts = {}) {
  const minStatement = opts.minStatement ?? 24
  const p = canon(proof)
  if (canon(statement).length < minStatement) return true
  if (TRIVIAL_PROOF.test(p) && canon(statement).length < 70) return true
  return false
}

// ---- scoring --------------------------------------------------------------------------------------------------
export function tokens(s) {
  const out = []
  const t = stripComments(String(s || ""))
  for (const w of t.match(/[A-Za-z_][A-Za-z0-9_']*(?:\.[A-Za-z_][A-Za-z0-9_']*)*/g) || []) {
    for (const part of w.split(".")) {
      for (const seg of part.split("_")) {
        if (seg.length > 1) out.push(seg.toLowerCase())
        const camel = seg.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        if (camel !== seg) for (const x of camel.toLowerCase().split(/\s+/)) if (x.length > 1) out.push(x)
      }
    }
  }
  for (const sym of t.match(/[∣∑∏∀∃≤≥<>=≠∈∉⊆⊂∪∩→↔∧∨¬≡∞√ℕℤℚℝℂ]/g) || []) out.push(sym)
  const nums = t.match(/\b\d+\b/g) || []
  for (const n of nums) out.push(`#${n}`)
  return out
}
const STOP = new Set(["theorem", "lemma", "by", "the", "of", "and", "at", "fun", "sorry", "example", "nat", "real", "int"])

// ---- the memory -----------------------------------------------------------------------------------------------
export class Memory {
  constructor({ targetId = "", variant = "", emit = () => {}, now = () => Date.now() } = {}) {
    this.targetId = targetId
    this.variant = variant
    this.emit = emit
    this.now = now
    this.entries = new Map() // id -> entry
    this.stats = { saves: 0, updates: 0, recalls: 0, recallHits: 0, injected: 0, sleeps: 0, abstracted: 0 }
  }

  get size() {
    return this.entries.size
  }

  // Entries from the browser: what this account has already saved for this target (and, if asked, the target's public seeds).
  load(list) {
    for (const e of Array.isArray(list) ? list : []) {
      if (!e || !e.id || !e.closure || !e.statement) continue
      this.entries.set(String(e.id), {
        id: String(e.id),
        name: String(e.name || ""),
        kind: e.kind || "theorem",
        statement: String(e.statement),
        closure: String(e.closure),
        origin: e.origin || "saved",
        savedAt: e.savedAt || null,
        attempt: e.attempt ?? null,
        isTarget: !!e.isTarget,
        nominated: !!e.nominated,
        subsumes: Array.isArray(e.subsumes) ? e.subsumes : [],
        subsumedBy: e.subsumedBy || null,
        hits: Number(e.hits) || 0,
        loaded: true,
      })
    }
    return this.entries.size
  }

  publicEntry(e) {
    return {
      id: e.id,
      name: e.name,
      kind: e.kind,
      statement: e.statement,
      closure: e.closure,
      origin: e.origin,
      savedAt: e.savedAt,
      attempt: e.attempt,
      isTarget: !!e.isTarget,
      nominated: !!e.nominated,
      subsumes: e.subsumes || [],
      subsumedBy: e.subsumedBy || null,
      hits: e.hits || 0,
      variant: this.variant,
      targetId: this.targetId,
    }
  }

  // A script that Leak IV has just verified. Returns the entries that are new or shorter than what was stored.
  addScript(script, meta = {}) {
    const blocks = splitDeclarations(script)
    const out = []
    // every block with the names it defines, for finding what a theorem needs
    const info = blocks.map((b, idx) => ({ idx, text: b, head: blockHead(b), name: blockName(b) }))
    const preamble = info.filter((b) => /^(?:open|universe|variable|set_option|attribute|notation|macro|syntax|infix|section|namespace)$/.test(b.head))
    const scopeAt = (idx) => {
      const stack = []
      for (const b of info.slice(0, idx)) {
        if (b.head === "namespace" || b.head === "section") stack.push(canon(stripComments(b.text)).replace(/^(?:namespace|section)\s*/, "").split(/\s/)[0] || "")
        else if (b.head === "end") stack.pop()
      }
      return stack
    }
    for (const b of info) {
      if (b.head !== "theorem" && b.head !== "lemma") continue
      if (hasSorry(b.text)) continue
      const statement = statementOf(b.text)
      if (!statement) continue
      const proof = proofOf(b.text)
      if (isTrivial(statement, proof, meta)) continue
      // everything earlier that this declaration needs, closed under "mentions"
      const need = new Set([b.idx])
      let grew = true
      while (grew) {
        grew = false
        for (const c of info.slice(0, b.idx)) {
          if (need.has(c.idx) || !c.name) continue
          for (const n of need) {
            if (words(info[n].text).has(c.name) || words(info[n].text).has(c.name.split(".").pop())) {
              need.add(c.idx)
              grew = true
              break
            }
          }
        }
      }
      const keep = new Set([...need, ...preamble.filter((p) => p.idx < b.idx && p.head !== "namespace" && p.head !== "section").map((p) => p.idx)])
      const scope = scopeAt(b.idx)
      const pieces = []
      for (const s of scope) pieces.push(`namespace ${s}`)
      for (const c of info) if (keep.has(c.idx) && c.idx <= b.idx) pieces.push(c.text)
      for (const s of [...scope].reverse()) pieces.push(`end ${s}`)
      const closure = pieces.join("\n\n").trim()
      const id = sha1(canon(statement).replace(/^(?:theorem|lemma)\s+\S+\s*/, ""))
      const prior = this.entries.get(id)
      const entry = {
        id,
        name: b.name || id.slice(0, 8),
        kind: b.head,
        statement: canon(statement),
        closure,
        origin: meta.origin || "verified",
        savedAt: new Date(this.now()).toISOString(),
        attempt: meta.attempt ?? null,
        isTarget: !!meta.isTarget,
        nominated: prior?.nominated || false,
        subsumes: meta.subsumes || [],
        subsumedBy: prior?.subsumedBy || null,
        hits: prior?.hits || 0,
      }
      if (prior && prior.closure.length <= closure.length) continue // keep the shorter proof
      if (!prior && this.entries.size >= MAX_ENTRIES) continue
      this.entries.set(id, entry)
      if (prior) this.stats.updates++
      else this.stats.saves++
      out.push(entry)
      this.emit({ type: "memory", op: prior ? "update" : "save", entry: this.publicEntry(entry) })
    }
    return out
  }

  // Generalised lemmas from the sleep stage. The bridge has already re-verified `script` with Leak IV.
  addAbstract(script, subsumes = [], meta = {}) {
    const added = this.addScript(script, { ...meta, origin: "abstracted", subsumes, minStatement: 12 })
    for (const e of added) {
      this.stats.abstracted++
      for (const id of subsumes) {
        const old = this.entries.get(id)
        if (old && old.id !== e.id) {
          old.subsumedBy = e.id
          this.emit({ type: "memory", op: "update", entry: this.publicEntry(old) })
        }
      }
    }
    return added
  }

  nominate(idOrName, on = true) {
    const e = this.find(idOrName)
    if (!e) return { ok: false, why: `no saved theorem matches "${idOrName}"` }
    if (on && !e.nominated && this.nominated().length >= MAX_NOMINATED)
      return { ok: false, why: `${MAX_NOMINATED} theorems are already nominated (the most Jinshi takes); un-nominate one first` }
    e.nominated = !!on
    this.emit({ type: "memory", op: "nominate", id: e.id, nominated: e.nominated })
    return { ok: true, entry: e }
  }

  nominated() {
    return [...this.entries.values()].filter((e) => e.nominated)
  }

  find(idOrName) {
    const q = String(idOrName || "").trim()
    if (!q) return null
    for (const e of this.entries.values()) if (e.id === q || e.id.startsWith(q) || e.name === q) return e
    return null
  }

  list({ limit = 30, nominatedOnly = false } = {}) {
    const all = [...this.entries.values()].filter((e) => !nominatedOnly || e.nominated)
    return all.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))).slice(0, limit)
  }

  recent(n) {
    return this.list({ limit: n }).filter((e) => !e.subsumedBy)
  }

  // BM25 over name + statement tokens, with a bonus for symbols the query shares and a small one for entries that were
  // useful before. Subsumed entries rank below the abstract lemma that replaced them.
  recall(query, { limit = 5, markHit = true } = {}) {
    const qt = [...new Set(tokens(query).filter((t) => !STOP.has(t)))]
    const docs = [...this.entries.values()].map((e) => ({ e, t: tokens(`${e.name} ${e.statement}`).filter((x) => !STOP.has(x)) }))
    const N = docs.length || 1
    const avg = docs.reduce((a, d) => a + d.t.length, 0) / N || 1
    const df = new Map()
    for (const d of docs) for (const w of new Set(d.t)) df.set(w, (df.get(w) || 0) + 1)
    const scored = []
    for (const d of docs) {
      const tf = new Map()
      for (const w of d.t) tf.set(w, (tf.get(w) || 0) + 1)
      let s = 0
      for (const w of qt) {
        const f = tf.get(w)
        if (!f) continue
        const idf = Math.log(1 + (N - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5))
        s += (idf * f * 2.2) / (f + 1.2 * (1 - 0.75 + (0.75 * d.t.length) / avg))
      }
      if (s <= 0) continue
      if (d.e.subsumedBy) s *= 0.5
      s *= 1 + Math.min(0.3, 0.05 * (d.e.hits || 0))
      scored.push({ e: d.e, s })
    }
    scored.sort((a, b) => b.s - a.s || String(b.e.savedAt || "").localeCompare(String(a.e.savedAt || "")))
    const top = scored.slice(0, limit).map((x) => x.e)
    this.stats.recalls++
    if (top.length) this.stats.recallHits++
    if (markHit) for (const e of top) e.hits = (e.hits || 0) + 1
    return top
  }
}

// ---- text for the driver --------------------------------------------------------------------------------------
export function renderEntry(e, { withProof = true } = {}) {
  const head = `-- [${e.id.slice(0, 8)}] ${e.name}${e.origin === "abstracted" ? " (abstract lemma)" : ""}${e.nominated ? " (nominated)" : ""}${e.isTarget ? " (this proves the target)" : ""}`
  return withProof ? `${head}\n${e.closure}` : `${head}\n${e.statement}`
}

export function renderRecall(entries, memory) {
  if (!entries.length) return `No saved theorem matches that query. Memory holds ${memory?.size ?? 0} verified theorem(s); memory_list shows the most recent.`
  return (
    `${entries.length} verified theorem(s) from this target's memory, best match first. Each block is compile-ready (it includes the definitions and lemmas it needs) and was accepted by Leak IV when saved; paste it into a script and verify_full_script it before you rely on it.\n\n` +
    entries.map((e) => renderEntry(e)).join("\n\n")
  )
}

export function renderList(entries, memory) {
  if (!entries.length) return "Memory is empty for this target so far."
  return (
    `${memory?.size ?? entries.length} verified theorem(s) saved (showing ${entries.length}, newest first):\n` +
    entries.map((e) => `- [${e.id.slice(0, 8)}] ${e.name}${e.nominated ? " *nominated*" : ""}: ${e.statement.slice(0, 220)}`).join("\n")
  )
}

// Flint: what the harness puts at the top of every fresh attempt.
export function episodicBlock(memory, n, { maxChars = 7000 } = {}) {
  const items = memory.recent(n)
  if (!items.length) return ""
  let used = 0
  const parts = []
  for (const e of items) {
    const t = renderEntry(e)
    if (used + t.length > maxChars) break
    used += t.length
    parts.push(t)
  }
  memory.stats.injected += parts.length
  return `\nVERIFIED THEOREMS FROM EARLIER ATTEMPTS ON THIS TARGET (newest first; each was accepted by Leak IV, each block is compile-ready). They are established: build on them instead of re-deriving them, and verify any block you rely on in your own script.\n${parts.join("\n\n")}\n`
}

// Paragon: memory as part of search. Appended to what Leak I returned for the same query.
export function augmentSearchText(memory, query, resultText, { limit = 3 } = {}) {
  if (!memory.size) return resultText
  const hits = memory.recall(query, { limit })
  if (!hits.length) return resultText
  memory.stats.injected += hits.length
  return `${resultText}\n\n— MEMORY: verified theorems saved earlier on this target that match your query (compile-ready, not library names; paste into a script) —\n\n${hits.map((e) => renderEntry(e)).join("\n\n")}`
}

// The tools the driver sees, served by the bridge through its governor.
export function makeHandlers(memory, variantKey) {
  const cfg = VARIANTS[variantKey]
  const all = {
    memory_recall: {
      description:
        "Search the verified theorems saved on THIS target (by you earlier in this run, in earlier attempts, and in earlier runs). Give a goal, a statement, or a few key words (names, symbols, numbers). Returns compile-ready verified blocks, best match first. Use it when you think you may have proved something related before, and before you spend an hour re-deriving a lemma.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "a Lean statement, a goal, or key words" }, limit: { type: "number", description: "how many (default 5, at most 8)" } },
        required: ["query"],
      },
      run: (args) => renderRecall(memory.recall(String(args?.query || ""), { limit: Math.min(8, Math.max(1, Number(args?.limit) || 5)) }), memory),
    },
    memory_list: {
      description: "List the verified theorems saved on this target, newest first (names and statements only).",
      inputSchema: { type: "object", properties: { limit: { type: "number" }, nominatedOnly: { type: "boolean" } } },
      run: (args) => renderList(memory.list({ limit: Math.min(60, Math.max(1, Number(args?.limit) || 30)), nominatedOnly: !!args?.nominatedOnly }), memory),
    },
    memory_nominate: {
      description: `Nominate saved theorems for review (at most ${MAX_NOMINATED}; three to ten are needed before anything can be submitted to Tengoku). Nominate the ones with real reuse value: general, minimal hypotheses, well named, not already in Mathlib. Pass names or ids; on=false removes a nomination.`,
      inputSchema: {
        type: "object",
        properties: { names: { type: "array", items: { type: "string" } }, on: { type: "boolean" } },
        required: ["names"],
      },
      run: (args) => {
        const lines = []
        for (const n of Array.isArray(args?.names) ? args.names : []) {
          const r = memory.nominate(n, args?.on !== false)
          lines.push(r.ok ? `${r.entry.name}: ${r.entry.nominated ? "nominated" : "no longer nominated"}` : `${n}: ${r.why}`)
        }
        return `${lines.join("\n")}\n${memory.nominated().length} nominated now (${MIN_NOMINATED} to ${MAX_NOMINATED} are needed to submit).`
      },
    },
  }
  const m = new Map()
  for (const t of cfg?.tools || []) if (all[t]) m.set(t, all[t])
  return m
}

// The sentences added to Control II's prompt for a variant. The baseline forbids top-level helper lemmas; a memory
// variant allows them, because a lemma that verifies on its own is the unit of progress that memory keeps.
export function memoryRules(variantKey) {
  const cfg = VARIANTS[variantKey]
  const tools = cfg.tools.length
  const lines = [
    "- You MAY prove helper theorems/lemmas as separate top-level declarations and verify them with verify_full_script (a helper must compile with no sorry). Every verified, non-trivial theorem is saved automatically to this target's memory, for you and for later attempts: a verified lemma is progress even if the target is still open. The target itself stays exactly as given.",
  ]
  lines.push("- Verify early and often. Python or other numeric probing is fine for finding a candidate, but a number or a pattern is only a fact once Leak IV has checked it (`decide +kernel`, `rfl`, `norm_num`), and a plan is not progress. Within your first few minutes submit something to verify_full_script, even a small lemma or a concrete instance; a submission that fails teaches more than another stretch of thinking.")
  lines.push("- Look up what the library already has (loogle_search for a type pattern, moogle_search for a concept) before you prove a helper that may exist; use what you find in a real script.")
  if (tools) lines.push("- Before you re-derive something, call memory_recall: you may already have proved it. Save effort for what is genuinely new.")
  if (cfg.augmentSearch) lines.push("- Your library searches also return matching theorems from this memory under a MEMORY heading; they are compile-ready.")
  if (tools) lines.push(`- When a saved theorem is general, minimally assumed and well named, nominate it with memory_nominate (at most ${MAX_NOMINATED}). Nominated theorems are the ones that can later be submitted to the Tengoku library, so nominate only what you would be proud to have others reuse.`)
  if (cfg.sleep) lines.push("- From time to time the system consolidates the memory in the background and adds more general lemmas; you will see them in memory_recall results marked (abstract lemma).")
  return lines.join("\n")
}

// ---- the sleep stage (Lucid) ----------------------------------------------------------------------------------
export function sleepDue(memory, state, cfg, now = Date.now()) {
  if (!cfg) return false
  const fresh = [...memory.entries.values()].filter((e) => !e.subsumedBy && e.origin !== "abstracted" && (e.savedAt || "") > (state.lastSleepIso || "")).length
  return fresh >= cfg.minNew && now - (state.lastSleepAt || 0) >= cfg.everyMs
}

export function sleepPrompt(memory, target, { maxEntries = 40, maxChars = 14000 } = {}) {
  const items = [...memory.entries.values()].filter((e) => !e.subsumedBy).slice(0, maxEntries)
  let used = 0
  const shown = []
  for (const e of items) {
    const t = `### [${e.id.slice(0, 8)}] ${e.name}\n${e.closure.slice(0, 1400)}`
    if (used + t.length > maxChars) break
    used += t.length
    shown.push(t)
  }
  return `You are the consolidation ("sleep") stage of a long theorem-proving run. You are NOT proving the target. The run has verified the theorems below; they are all correct Lean 4 + Mathlib. Your job is to make this library more reusable.

TARGET (for context only):
${target}

THE LIBRARY:
${shown.join("\n\n")}

DO THIS:
1. Group the theorems that are variants of one idea (same shape with different constants or hypotheses, a chain of special cases, near-duplicates).
2. For each group worth it, write ONE more general lemma that implies the members (parametrise constants, weaken hypotheses to what the proof really uses, state it at the natural generality), and prove it. Prefer a lemma whose statement is short and whose hypotheses are minimal. Do not invent facts that are not supported by the library.
3. Check every candidate with verify_full_script (your only tool). A candidate that does not compile with no error, no warning and no sorry is discarded. The system re-verifies everything you return.
4. Ignore trivial restatements and anything already in Mathlib.

Finish with ONE fenced json block and nothing after it:
\`\`\`json
[{"name": "lemma_name", "script": "the complete compile-ready Lean text (the lemma and anything it needs)", "subsumes": ["8-char ids from the library"], "why": "one sentence"}]
\`\`\`
If nothing is worth consolidating, return [].`
}

export function parseSleep(text) {
  const m = String(text || "").match(/```json\s*([\s\S]*?)```/i)
  if (!m) return []
  let arr
  try {
    arr = JSON.parse(m[1])
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter((x) => x && typeof x.script === "string" && x.script.trim() && !hasSorry(x.script))
    .map((x) => ({ name: String(x.name || ""), script: x.script, subsumes: Array.isArray(x.subsumes) ? x.subsumes.map(String) : [], why: String(x.why || "") }))
    .slice(0, 12)
}

export const resolveSubsumes = (memory, shortIds) =>
  (shortIds || []).map((s) => memory.find(s)?.id).filter(Boolean)
