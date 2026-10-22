// The model's reading of a batch of banked entries: the prompt, and parsing what comes back. No network here.
import { splitClosure } from "./rank-core.mjs"

export const KINDS = ["numeric-instance", "special-case", "reformulation", "general-lemma", "structural", "reduction", "other"]

const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n) + " …" : String(s))

export function readingPrompt(items, { target, informal }) {
  const shown = items
    .map((it, i) => {
      const parts = splitClosure(it.entry.closure, it.entry.name)
      const header = parts ? parts.header : it.entry.statement
      const proof = parts ? parts.proof : it.entry.closure
      const helpers = it.features?.helpers || 0
      return `### ${it.id}\n${cut(header, 700)}\n-- proof (${proof.split("\n").length} lines${helpers ? `, resting on ${helpers} helper declarations shown to the compiler first` : ""}):\n${cut(proof, 900)}`
    })
    .join("\n\n")
  return `You are reviewing theorems that an automated prover banked while working on a target. Every one of them compiles in Lean 4 with Mathlib and has no sorry, so DO NOT judge correctness. Judge what each one is worth. Be blunt and use the whole of every scale: most banked theorems are routine, and saying so is the useful answer.

TARGET (the problem the prover was working on):
${target}
In words: ${informal}

For each theorem below return one object with these fields:
- "says": one plain sentence, what the statement says (not what the proof does).
- "kind": one of ${KINDS.map((k) => `"${k}"`).join(", ")}. numeric-instance = holds of particular numbers only; special-case = a particular case of something more general; reformulation = the same content in another form or a definition unfolded; general-lemma = a reusable statement with parameters; structural = a theorem about the structure of the objects (carries, factorisations, divisibility patterns); reduction = reduces the target, or a big piece of it, to something smaller or checkable.
- "depth": 1 to 5, how hard the argument is. 1 = one automatic tactic or an unfolding; 3 = a routine multi-step argument any competent Lean user writes; 5 = a genuinely clever or long argument.
- "generality": 1 to 5. 1 = one specific instance; 3 = a family with parameters; 5 = the natural general form of a classical fact.
- "role": 0 to 3, worth to the target. 0 = unrelated or a dead end; 1 = true background on the right topic; 2 = a stepping stone a proof of the target would plausibly use; 3 = a key reduction, one that makes real progress.
- "inMathlib": "yes", "likely" or "no", as far as you know, is this (or something that gives it in one line) already in Mathlib.
- "vacuous": "no", "doubtful" or "likely": can the hypotheses all hold at once, so the statement says something. "likely" only if they plainly cannot.

Return ONE fenced json block containing an array with one object per theorem, each with the "id" given below, and nothing after it.

THEOREMS:
${shown}`
}

const num = (x, lo, hi) => {
  const n = Number(x)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null
}

export function parseReading(text) {
  const t = String(text || "")
  const m = /```json\s*([\s\S]*?)```/i.exec(t) || /(\[[\s\S]*\])/.exec(t)
  if (!m) return []
  let arr
  try {
    arr = JSON.parse(m[1])
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out = []
  for (const x of arr) {
    if (!x || typeof x.id !== "string") continue
    const depth = num(x.depth, 1, 5)
    const generality = num(x.generality, 1, 5)
    const role = num(x.role, 0, 3)
    if (depth == null || generality == null || role == null) continue
    out.push({
      id: x.id,
      says: String(x.says || "").slice(0, 300),
      kind: KINDS.includes(x.kind) ? x.kind : "other",
      depth,
      generality,
      role,
      inMathlib: ["yes", "likely", "no"].includes(x.inMathlib) ? x.inMathlib : "no",
      vacuous: ["no", "doubtful", "likely"].includes(x.vacuous) ? x.vacuous : "no",
    })
  }
  return out
}
