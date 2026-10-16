// leak-min-imports.mjs — give a verified proof the imports it needs, not `Tengoku.All`.
//
// Leak IV compiles every script against the whole tree (its Dockerfile injects `import Tengoku.All`), so a banked proof says "import everything"
// although it needs a few dozen modules. This turns the header of a verified proof into the smallest import list that compiles it to the SAME
// statements, using nothing but `verify_full_script` (no change to Leak IV):
//
//   1. PROBE   the verified script, with a linter registered after its imports and a marker declaration after its last command. Lean's linters run
//              after every command, so the linter sees each command's syntax and the declaration it added. For each one it collects the modules of
//              (a) the constants the declaration TRANSITIVELY uses, (b) the syntax kinds written (tactics, notation, macros: they need the module that
//              defines them although no proof term mentions it) and (c) the dotted names written, and (d) the attributes. At the marker it reduces that
//              set to its irredundant core (Mathlib's `getIrredundantImports`: a module another one imports is dropped) and reports it, together with a
//              digest of the type of every constant the script declared. The report comes back as an error message, the one channel Leak IV returns.
//              A tactic's extensions (positivity's `evalPow`, norm_num's evaluators, linarith's preprocessors) are registered by attribute in modules no
//              proof term mentions, so for every module found under `Tengoku.Seed.Tactic.<Family>` the family's umbrella module `…Tactic.<Family>` is
//              required too (about 140 modules for positivity).
//              Single-word identifiers are NOT looked at: `x`, `h`, `a` are local names in a proof, and a library of the tree that declares a root
//              constant `x` would be taken for a dependency.
//   2. CHECK   the script with only those imports and a probe that reports the digest alone (no linter, no extra import): the digest of the types
//              must be the one of step 1 (the statements are the same terms) and nothing else may be reported (no error, no warning).
//   3. VERIFY  the narrowed script, plain: `verify_full_script` must succeed. That text, as Leak IV normalised it, is what is returned.
// Any other outcome returns the script unchanged: the result is never worse than the input.
//
// A registered linter lives as long as Leak IV's Lean worker, so the probe removes its own linter at the marker, and again when it is older than
// LINTER_TTL_MS; its registration command carries a fresh nonce, so Lean's incremental elaboration re-runs it on every call.

export const WIDE_IMPORTS = ["Tengoku.All", "Tengoku"]
export const MARKER_NAME = "tg_min_imports_report"
export const LINTER_TTL_MS = 20 * 60 * 1000

// The digest of the types of the constants a script declared, shared by the linter and the digest-only probe (they must compute the same thing).
const DIGEST = String.raw`
        let items := env.constants.map₂.foldl (fun (a : Array (Name × UInt64)) n ci => if n.isInternal || n.getRoot.toString.startsWith "tg_" then a else a.push (n, ci.type.hash)) #[]
        let items := items.qsort (fun a b => Name.lt a.1 b.1)
        let h := items.foldl (fun h (n, t) => mixHash (mixHash h (hash n)) t) (7 : UInt64)`

/** The Lean text registered right after the imports. `nonce` makes the command differ on every call. */
export function registrationBlock(nonce) {
  return String.raw`
open Lean in
partial def tg_nodeKinds : Syntax → NameSet
  | .node _ k args => args.foldl (fun s a => s.append (tg_nodeKinds a)) (NameSet.empty.insert k)
  | .ident _ _ n _ => if n.getNumParts ≥ 2 then NameSet.empty.insert n else {}
  | _ => {}

open Lean Elab Command in
run_cmd do
  let tag : String := "${nonce}"
  let me := Name.mkSimple "tgMinImports"
  lintersRef.modify (·.filter (·.name != me))
  let acc ← IO.mkRef ({} : NameSet)
  let seen ← IO.mkRef false
  let t0 ← IO.monoMsNow
  addLinter {
    name := me
    run := fun stx => do
      unless (← seen.get) do
        seen.set true
        return
      if (← IO.monoMsNow) - t0 > ${LINTER_TTL_MS} then
        lintersRef.modify (·.filter (·.name != me))
        return
      let env ← getEnv
      if (stx.find? fun s => s.isIdent && s.getId == Name.mkSimple "${MARKER_NAME}").isSome then
        lintersRef.modify (·.filter (·.name != me))
        let mut tot0 := (← acc.get)
        for m in (← acc.get) do
          let cs := m.components
          if cs.length ≥ 4 && cs[0]! == Name.mkSimple "Tengoku" && cs[1]! == Name.mkSimple "Seed" && cs[2]! == Name.mkSimple "Tactic" then
            let fam := (cs.take 4).foldl (· ++ ·) Name.anonymous
            if (env.getModuleIdx? fam).isSome then tot0 := tot0.insert fam
        let tot := Mathlib.Command.MinImports.getIrredundantImports env tot0
        let names := (tot.toArray.filter (!Mathlib.Command.MinImports.isInitImport ·)).qsort Name.lt
${DIGEST}
        throwError "TG_RUN {tag}\nTG_MIN_IMPORTS: {" ".intercalate (names.map toString).toList}\nTG_TYPES: {h} n={items.size}"
      else
        let nm ← try Mathlib.Command.MinImports.getDeclName stx catch _ => pure default
        let ts := (← Mathlib.Command.MinImports.getVisited nm).append (tg_nodeKinds stx) |>.append (Mathlib.Command.MinImports.getAttrs env stx)
        let mut hm : Std.HashMap Nat Name := {}
        for imp in env.header.moduleNames do
          hm := hm.insert ((env.getModuleIdx? imp).getD default) imp
        let mut fins : NameSet := {}
        for t in ts do
          match env.getModuleIdxFor? t with
          | some i => fins := fins.insert ((hm.get? i).getD .anonymous)
          | none => pure ()
        acc.modify (·.append (fins.erase .anonymous))
  }
`
}

/** The last command of the first probe: the linter reports when it sees it. */
export function markerCommand() {
  return `\ntheorem ${MARKER_NAME} : True := trivial\n`
}

/** The last command of the second probe: reports the digest of the types, nothing else. */
export function digestProbe(nonce) {
  return String.raw`
open Lean Elab Command in
run_cmd do
  let tag : String := "${nonce}"
  let env ← getEnv
${DIGEST.replace(/^        /gm, "  ")}
  (throwError "TG_RUN {tag}\nTG_TYPES: {h} n={items.size}" : CommandElabM Unit)
`
}

const IMPORT_LINE = /^\s*import\s+([^\s]+)\s*(?:--.*)?$/

/** Split a script into its import header and its body. The header ends with its last import line; comments and blanks after it belong to the body. */
export function splitScript(script) {
  const lines = String(script).split("\n")
  let depth = 0
  let lastImport = -1
  const imports = []
  let i = 0
  for (; i < lines.length; i++) {
    const l = lines[i]
    const t = l.trim()
    if (depth > 0) {
      depth += (l.match(/\/-/g) || []).length - (l.match(/-\//g) || []).length
      if (depth < 0) depth = 0
      continue
    }
    if (t === "" || t.startsWith("--")) continue
    if (t.startsWith("/-")) {
      depth += (l.match(/\/-/g) || []).length - (l.match(/-\//g) || []).length
      if (depth < 0) depth = 0
      continue
    }
    const m = IMPORT_LINE.exec(l)
    if (m) {
      imports.push(m[1])
      lastImport = i
      continue
    }
    break
  }
  const cut = lastImport + 1
  return { imports, header: lines.slice(0, cut).join("\n"), body: lines.slice(cut).join("\n"), hasImports: lastImport >= 0 }
}

/** Does the header import the whole tree (or its root) — the only headers worth narrowing? */
export function isWide(imports) {
  return imports.some((m) => WIDE_IMPORTS.includes(m))
}

/** `import A\nimport B` for a module list, sorted and without repeats. */
export function importBlock(mods) {
  return [...new Set(mods)].sort().map((m) => `import ${m}`).join("\n")
}

/** The script with the header replaced: the modules in `mods`, plus the imports of the old header that were not wide. */
export function narrowScript(script, mods) {
  const { imports, body } = splitScript(script)
  const keep = imports.filter((m) => !WIDE_IMPORTS.includes(m))
  return `${importBlock([...keep, ...mods])}\n${body.startsWith("\n") ? body : "\n" + body}`
}

// Both probes elaborate synchronously. Lean elaborates theorems asynchronously by default, and a linter then runs for a theorem after the NEXT
// command has started: the marker's linter can report before the linter of an earlier theorem has run (seen on Leak IV: the same script gave
// 1, 2 or 3 commands seen, depending on how long `positivity` took). With the option off, linters run in order and the digest sees every constant.
export const SYNC = "set_option Elab.async false\n"

/** The first probe: the script's own header, the registration, the body, the marker. */
export function fullProbe(script, nonce) {
  const { header, body } = splitScript(script)
  return `${header}\n\n${SYNC}${registrationBlock(nonce)}${body}${markerCommand()}`
}

/** The second probe: the narrowed script, then the digest of its types. */
export function hashProbe(narrowed, nonce) {
  const { header, body } = splitScript(narrowed)
  return `${header}\n\n${SYNC}${body.replace(/\s*$/, "\n")}${digestProbe(nonce)}`
}

/** Leak IV's answer as a list of diagnostics: [{ line, severity, message }]. A success has none. */
export function diagnostics(text) {
  const t = String(text == null ? "" : text)
  const out = []
  const re = /(?:^|\n)Line (\d+) \((Error|Warning|Info)\):/g
  const hits = [...t.matchAll(re)]
  for (let k = 0; k < hits.length; k++) {
    const end = k + 1 < hits.length ? hits[k + 1].index : t.length
    out.push({ line: Number(hits[k][1]), severity: hits[k][2], message: t.slice(hits[k].index + hits[k][0].length, end).trim() })
  }
  return out
}

export function isSuccess(text) {
  return /^\s*✅\s*Compilation Successful/.test(String(text == null ? "" : text))
}

/**
 * Read a probe's report. `nonce` ties it to this call (a linter left by an earlier call would answer with its own tag).
 * Returns { found, imports, types, others } — `others` are the diagnostics that are not the probe's own, so a clean script has none.
 */
export function parseReport(text, nonce) {
  const diags = diagnostics(text)
  const mine = []
  const others = []
  for (const d of diags) (d.message.includes(`TG_RUN ${nonce}`) ? mine : others).push(d)
  if (mine.length === 0) return { found: false, imports: [], types: null, others }
  const msg = mine.map((d) => d.message).join(" ")
  const imp = /TG_MIN_IMPORTS:\s*(.*?)\s*TG_TYPES:/.exec(msg)
  const ty = /TG_TYPES:\s*(\d+)\s+n=(\d+)/.exec(msg)
  return {
    found: true,
    imports: imp ? imp[1].split(/\s+/).filter(Boolean) : null,
    types: ty ? { hash: ty[1], n: Number(ty[2]) } : null,
    others,
  }
}

export function newNonce() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function say(log, msg) {
  try {
    log && log(msg)
  } catch {
    /* logging never decides anything */
  }
}

/**
 * Narrow the imports of a verified script.
 *
 *   script   the verified text, as Leak IV normalised it (its header names the whole tree)
 *   verify   async (script) => ({ text }) — `verify_full_script`
 *   opts     { log(msg), nonce }
 *
 * Returns { script, narrowed, reason, imports, from }. `script` is the input unless every check passed.
 */
export async function minimizeImports(script, verify, opts = {}) {
  const log = opts.log
  const original = String(script == null ? "" : script)
  const keep = (reason, extra = {}) => ({ script: original, narrowed: false, reason, ...extra })
  const parts = splitScript(original)
  if (!parts.hasImports) return keep("the script has no import header")
  if (!isWide(parts.imports)) return keep("the imports are already specific")
  const nonce = opts.nonce || newNonce()
  try {
    const r1 = parseReport((await verify(fullProbe(original, nonce))).text, nonce)
    if (!r1.found || !r1.imports || !r1.types) return keep("the probe did not report", { detail: r1.others.slice(0, 2) })
    if (r1.others.length) return keep("the script is not clean under the probe", { detail: r1.others.slice(0, 2) })
    const needed = r1.imports.filter((m) => m.startsWith("Tengoku."))
    if (needed.length === 0) return keep("no module of the tree is needed")
    const narrowed = narrowScript(original, r1.imports)
    const r2 = parseReport((await verify(hashProbe(narrowed, nonce + "d"))).text, nonce + "d")
    if (!r2.found || !r2.types) return keep("the narrowed script does not compile", { detail: r2.others.slice(0, 2), imports: r1.imports })
    if (r2.others.length) return keep("the narrowed script does not compile cleanly", { detail: r2.others.slice(0, 2), imports: r1.imports })
    if (r2.types.hash !== r1.types.hash || r2.types.n !== r1.types.n)
      return keep("the types differ under the narrowed imports", { imports: r1.imports, types: [r1.types, r2.types] })
    const v = await verify(narrowed)
    const text = String(v && v.text != null ? v.text : "")
    if (!isSuccess(text)) return keep("the narrowed script was not accepted", { imports: r1.imports })
    const m = /\[\[LEAK_NORMALIZED_SCRIPT_B64:([A-Za-z0-9+/=]+)\]\]/.exec(text)
    let final = narrowed
    if (m) {
      const decoded = Buffer.from(m[1], "base64").toString("utf8")
      if (decoded.trim()) final = decoded
    }
    if (splitScript(final).imports.some((x) => WIDE_IMPORTS.includes(x))) return keep("the daemon put the whole tree back", { imports: r1.imports })
    say(log, `imports narrowed: ${parts.imports.join(", ")} -> ${r1.imports.length} module(s)`)
    return { script: final, narrowed: true, reason: "ok", imports: r1.imports, from: parts.imports }
  } catch (e) {
    say(log, `import narrowing failed: ${String((e && e.message) || e)}`)
    return keep(`error: ${String((e && e.message) || e)}`)
  }
}
