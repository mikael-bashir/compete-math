// node --test tests/leak-min-imports/min-imports.test.mjs
//
// public/leak-min-imports.mjs: narrowing the imports of a verified proof from `Tengoku.All` to what it needs. No network: Leak IV is a fake that answers the way
// the real one was seen to (an error line per diagnostic, the probe's report inside an error message, a success carrying the normalised script).
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  WIDE_IMPORTS,
  MARKER_NAME,
  LINTER_TTL_MS,
  SYNC,
  registrationBlock,
  markerCommand,
  digestProbe,
  splitScript,
  isWide,
  importBlock,
  narrowScript,
  fullProbe,
  hashProbe,
  diagnostics,
  isSuccess,
  parseReport,
  newNonce,
  minimizeImports,
} from "../../public/leak-min-imports.mjs"

const PROOF = `import Tengoku.All

theorem t1 (a b : Nat) : a + b = b + a := by omega

theorem t2 (x : ℝ) (h : 0 < x) : 0 < x ^ 2 := by positivity
`

const b64 = (s) => Buffer.from(s, "utf8").toString("base64")
const ok = (script) => `✅ Compilation Successful! The proof is 100% verified.\n[[LEAK_NORMALIZED_SCRIPT_B64:${b64(script)}]]`
const fail = (...msgs) => `❌ Compilation Failed:\n${msgs.map((m, i) => `Line ${10 + i} (Error): ${m}`).join("\n")}`
const tagOf = (script) => /let tag : String := "([^"]+)"/.exec(script)?.[1]

/**
 * A fake Leak IV. It recognises the three kinds of script by what they contain, records every script it was given, and answers per `cfg`.
 *   cfg.imports  the modules the full probe reports        cfg.types / cfg.typesNarrow  the digests {hash, n} of the two probes
 *   cfg.fullExtra / cfg.hashExtra  extra diagnostics in the probe answers      cfg.plainOk / cfg.plainText  the plain verify's answer
 */
function fakeLeak(cfg = {}) {
  const calls = []
  const types = cfg.types || { hash: "111", n: 2 }
  const typesNarrow = cfg.typesNarrow || types
  const verify = async (script) => {
    calls.push(script)
    if (cfg.throwAt === calls.length) throw new Error("daemon went away")
    const tag = cfg.staleTag ? "stale" : tagOf(script)
    if (script.includes(`theorem ${MARKER_NAME}`)) {
      if (cfg.noReport) return { text: fail("some other error") }
      const extra = cfg.fullExtra || []
      return { text: fail(`linter tgMinImports failed: TG_RUN ${tag} TG_MIN_IMPORTS: ${(cfg.imports || []).join(" ")} TG_TYPES: ${types.hash} n=${types.n}`, ...extra) }
    }
    if (script.includes("TG_TYPES")) {
      if (cfg.noHashReport) return { text: fail("unknown identifier 'foo'") }
      const extra = cfg.hashExtra || []
      return { text: fail(`TG_RUN ${tag} TG_TYPES: ${typesNarrow.hash} n=${typesNarrow.n}`, ...extra) }
    }
    if (cfg.plainOk === false) return { text: fail("unknown constant 'Real.sqrt'") }
    return { text: cfg.plainText ? cfg.plainText(script) : ok(script) }
  }
  return { verify, calls }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the header
// ---------------------------------------------------------------------------------------------------------------------------------------------

test("splitScript: an injected header and its body", () => {
  const s = splitScript(PROOF)
  assert.deepEqual(s.imports, ["Tengoku.All"])
  assert.equal(s.header, "import Tengoku.All")
  assert.ok(s.body.startsWith("\ntheorem t1"))
  assert.equal(s.header + "\n" + s.body, PROOF)
  assert.equal(s.hasImports, true)
})

test("splitScript: several imports, comments and blank lines between them", () => {
  const src = "-- a comment\nimport Tengoku.Seed.A\n\n/- block\n import Fake.NotAnImport\n-/\nimport Tengoku.Seed.B -- trailing\n\ntheorem x : True := trivial\n"
  const s = splitScript(src)
  assert.deepEqual(s.imports, ["Tengoku.Seed.A", "Tengoku.Seed.B"])
  assert.ok(s.body.startsWith("\n\ntheorem x") || s.body.startsWith("\ntheorem x"))
  assert.equal(s.header + "\n" + s.body, src)
})

test("splitScript: nested block comments hide an import line", () => {
  const s = splitScript("/- outer /- inner -/\nimport Hidden.One\n-/\nimport Tengoku.Seed.A\n\ntheorem x : True := trivial\n")
  assert.deepEqual(s.imports, ["Tengoku.Seed.A"])
})

test("splitScript: a script without imports has an empty header and the whole script as body", () => {
  const src = "theorem x : True := trivial\n"
  const s = splitScript(src)
  assert.equal(s.hasImports, false)
  assert.deepEqual(s.imports, [])
  assert.equal(s.header, "")
  assert.equal(s.body, src)
})

test("splitScript: the header stops at the first command, and an import after a command is not one", () => {
  const s = splitScript("import Tengoku.Seed.A\n\ntheorem x : True := trivial\n\nimport Tengoku.Seed.B\n")
  assert.deepEqual(s.imports, ["Tengoku.Seed.A"])
})

test("splitScript: import modifiers are not plain imports and end the header", () => {
  const s = splitScript("import Tengoku.Seed.A\npublic import Tengoku.Seed.B\ntheorem x : True := trivial\n")
  assert.deepEqual(s.imports, ["Tengoku.Seed.A"])
})

test("splitScript: windows line endings and an empty script", () => {
  assert.deepEqual(splitScript("import Tengoku.All\r\n\r\ntheorem x : True := trivial\r\n").imports, ["Tengoku.All"])
  assert.deepEqual(splitScript("").imports, [])
  assert.deepEqual(splitScript(null).imports, [])
})

test("isWide: only the whole tree and its root", () => {
  assert.equal(isWide(["Tengoku.All"]), true)
  assert.equal(isWide(["Tengoku"]), true)
  assert.equal(isWide(["Tengoku.Seed.Data.Nat.Basic"]), false)
  assert.equal(isWide(["Tengoku.Seed.A", "Tengoku.All"]), true)
  assert.equal(isWide([]), false)
  assert.deepEqual(WIDE_IMPORTS, ["Tengoku.All", "Tengoku"])
})

test("importBlock: sorted, without repeats", () => {
  assert.equal(importBlock(["B.X", "A.Y", "B.X"]), "import A.Y\nimport B.X")
  assert.equal(importBlock([]), "")
})

test("narrowScript: the wide import is replaced, the body is untouched", () => {
  const out = narrowScript(PROOF, ["Tengoku.Seed.Tactic.Positivity", "Tengoku.Seed.Data.Real.Basic"])
  assert.ok(out.startsWith("import Tengoku.Seed.Data.Real.Basic\nimport Tengoku.Seed.Tactic.Positivity\n"))
  assert.equal(splitScript(out).body, splitScript(PROOF).body)
  assert.ok(!out.includes("Tengoku.All"))
})

test("narrowScript: a specific import of the old header stays, and a repeated one is written once", () => {
  const src = "import Tengoku.All\nimport Tengoku.Seed.Data.Nat.Basic\n\ntheorem x : True := trivial\n"
  const out = narrowScript(src, ["Tengoku.Seed.Data.Nat.Basic", "Tengoku.Seed.Order.Basic"])
  assert.deepEqual(splitScript(out).imports, ["Tengoku.Seed.Data.Nat.Basic", "Tengoku.Seed.Order.Basic"])
})

test("narrowScript: a body that starts on the line after the imports still gets a blank line", () => {
  const out = narrowScript("import Tengoku.All\ntheorem x : True := trivial\n", ["Tengoku.Seed.A"])
  assert.equal(out, "import Tengoku.Seed.A\n\ntheorem x : True := trivial\n")
})

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the probes
// ---------------------------------------------------------------------------------------------------------------------------------------------

test("fullProbe: header, synchronous elaboration, registration, the body exactly, the marker last", () => {
  const p = fullProbe(PROOF, "nonce1")
  const body = splitScript(PROOF).body
  assert.ok(p.startsWith("import Tengoku.All\n"))
  assert.ok(p.indexOf(SYNC) > 0)
  assert.ok(p.indexOf(SYNC) < p.indexOf("addLinter"), "the option comes before the linter is registered")
  assert.ok(p.indexOf("addLinter") < p.indexOf(body), "the linter is registered before the body")
  assert.ok(p.includes(body), "the body is in the probe byte for byte")
  assert.ok(p.endsWith(markerCommand()))
  assert.equal(p.split(`theorem ${MARKER_NAME}`).length, 2, "one marker")
})

test("fullProbe: the nonce is in the registration command and nowhere else", () => {
  const p = fullProbe(PROOF, "zzz999")
  assert.equal(p.split("zzz999").length, 2)
  assert.notEqual(fullProbe(PROOF, "a"), fullProbe(PROOF, "b"), "a different nonce is a different command: Lean's incremental elaboration must re-run it")
})

test("hashProbe: the narrowed header, synchronous elaboration, the body, then the digest; no linter and no extra import", () => {
  const narrowed = narrowScript(PROOF, ["Tengoku.Seed.Data.Real.Basic"])
  const p = hashProbe(narrowed, "n2")
  assert.ok(p.startsWith("import Tengoku.Seed.Data.Real.Basic\n"))
  assert.ok(p.includes(splitScript(narrowed).body.replace(/\s*$/, "")))
  assert.ok(!p.includes("addLinter") && !p.includes("MinImports") && !p.includes(MARKER_NAME))
  assert.equal(splitScript(p).imports.length, 1, "no import was added for the probe: the narrowed environment is what is measured")
  assert.ok(p.indexOf(SYNC) < p.indexOf("theorem t1"))
  assert.ok(p.trimEnd().endsWith("CommandElabM Unit)"))
})

test("both probes compute the digest with the same text", () => {
  const digestLines = (s) => s.split("\n").filter((l) => /let items|let h :=/.test(l)).map((l) => l.trim())
  assert.deepEqual(digestLines(registrationBlock("x")), digestLines(digestProbe("x")))
  assert.equal(digestLines(digestProbe("x")).length, 3)
})

test("the Lean text keeps the properties each bug taught", () => {
  const reg = registrationBlock("n")
  // a linter outlives the call in Leak IV's worker: removed at the start, at the marker, and when too old
  assert.match(reg, /lintersRef\.modify \(·\.filter \(·\.name != me\)\)\n {2}let acc/)
  assert.ok((reg.match(/lintersRef\.modify \(·\.filter \(·\.name != me\)\)/g) || []).length >= 3)
  assert.ok(reg.includes(String(LINTER_TTL_MS)))
  // single words are local names (`x`, `h`), not constants: only dotted names are looked at
  assert.ok(reg.includes("getNumParts ≥ 2"))
  // the probe's own constants stay out of the digest
  assert.ok(reg.includes('startsWith "tg_"'))
  // the report separates its lines with a real \n escape, not a doubled backslash
  assert.ok(reg.includes('\\nTG_MIN_IMPORTS:') && !reg.includes('\\\\nTG_MIN_IMPORTS:'))
  assert.ok(digestProbe("n").includes('\\nTG_TYPES:') && !digestProbe("n").includes('\\\\nTG_TYPES:'))
  // a tactic's extensions are registered by attribute: the family umbrella is added
  assert.ok(reg.includes("Name.mkSimple \"Tactic\"") && reg.includes("(cs.take 4)"))
  // no backquote name literals: a Lean `name` would end the JS template
  assert.ok(!reg.includes("`tg"))
})

test("SYNC switches asynchronous elaboration off", () => {
  assert.equal(SYNC, "set_option Elab.async false\n")
})

// ---------------------------------------------------------------------------------------------------------------------------------------------
// reading Leak IV's answer
// ---------------------------------------------------------------------------------------------------------------------------------------------

test("diagnostics: one entry per Line block, a success has none", () => {
  const d = diagnostics("❌ Compilation Failed:\nLine 3 (Error): bad thing\nmore of it\nLine 9 (Warning): `sorry`")
  assert.deepEqual(d.map((x) => [x.line, x.severity]), [[3, "Error"], [9, "Warning"]])
  assert.equal(d[0].message, "bad thing\nmore of it")
  assert.deepEqual(diagnostics(ok("x")), [])
  assert.deepEqual(diagnostics(""), [])
  assert.deepEqual(diagnostics(undefined), [])
})

test("isSuccess", () => {
  assert.equal(isSuccess("✅ Compilation Successful! The proof is 100% verified."), true)
  assert.equal(isSuccess("❌ Compilation Failed:\n"), false)
  assert.equal(isSuccess(""), false)
})

test("parseReport: the imports and the digest of this call's probe", () => {
  const text = fail("linter tgMinImports failed: TG_RUN abc TG_MIN_IMPORTS: Tengoku.Seed.A Tengoku.Seed.B TG_TYPES: 18446744073709551615 n=7")
  const r = parseReport(text, "abc")
  assert.equal(r.found, true)
  assert.deepEqual(r.imports, ["Tengoku.Seed.A", "Tengoku.Seed.B"])
  assert.deepEqual(r.types, { hash: "18446744073709551615", n: 7 })
  assert.deepEqual(r.others, [])
})

test("parseReport: the report with its lines kept apart parses the same", () => {
  const r = parseReport("❌ Compilation Failed:\nLine 5 (Error): linter tgMinImports failed: TG_RUN abc\nTG_MIN_IMPORTS: Tengoku.Seed.A\nTG_TYPES: 12 n=3", "abc")
  assert.deepEqual(r.imports, ["Tengoku.Seed.A"])
  assert.deepEqual(r.types, { hash: "12", n: 3 })
})

test("parseReport: an empty import list", () => {
  const r = parseReport(fail("linter tgMinImports failed: TG_RUN abc TG_MIN_IMPORTS: TG_TYPES: 5 n=0"), "abc")
  assert.deepEqual(r.imports, [])
  assert.deepEqual(r.types, { hash: "5", n: 0 })
})

test("parseReport: a report of another call (a linter left in the worker) is not this call's, and counts as dirt", () => {
  const r = parseReport(fail("linter tgMinImports failed: TG_RUN other TG_MIN_IMPORTS: A TG_TYPES: 1 n=1"), "abc")
  assert.equal(r.found, false)
  assert.equal(r.others.length, 1)
})

test("parseReport: other diagnostics are returned as such", () => {
  const text = fail("TG_RUN abc TG_TYPES: 1 n=1", "unused variable `x`")
  const r = parseReport(text, "abc")
  assert.equal(r.found, true)
  assert.equal(r.others.length, 1)
  assert.match(r.others[0].message, /unused variable/)
})

test("parseReport: a success is no report", () => {
  assert.equal(parseReport(ok("x"), "abc").found, false)
})

test("a digest of the two probes is told apart by the nonce they carry", () => {
  const n = newNonce()
  assert.notEqual(n, newNonce())
  const text = fail(`TG_RUN ${n}d TG_TYPES: 9 n=1`)
  assert.equal(parseReport(text, `${n}d`).found, true)
  assert.equal(parseReport(text, n).found, true, "the first call's tag is a prefix of the second's: the answer to the second must never be read as the first (they are separate texts)")
})

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the whole flow
// ---------------------------------------------------------------------------------------------------------------------------------------------

test("minimizeImports: the three checks pass and the narrowed script comes back", async () => {
  const leak = fakeLeak({ imports: ["Tengoku.Seed.Tactic.Positivity", "Tengoku.Seed.Data.Real.Basic"] })
  const logs = []
  const r = await minimizeImports(PROOF, leak.verify, { log: (m) => logs.push(m) })
  assert.equal(r.narrowed, true)
  assert.equal(r.reason, "ok")
  assert.deepEqual(r.imports, ["Tengoku.Seed.Tactic.Positivity", "Tengoku.Seed.Data.Real.Basic"])
  assert.deepEqual(r.from, ["Tengoku.All"])
  assert.deepEqual(splitScript(r.script).imports, ["Tengoku.Seed.Data.Real.Basic", "Tengoku.Seed.Tactic.Positivity"])
  assert.equal(splitScript(r.script).body, splitScript(PROOF).body)
  assert.equal(leak.calls.length, 3)
  assert.ok(leak.calls[0].includes(MARKER_NAME) && !leak.calls[1].includes(MARKER_NAME))
  assert.equal(leak.calls[2], r.script, "the plain verification is of exactly the text that is returned")
  assert.ok(!leak.calls[2].includes("TG_"), "no probe in the certificate")
  assert.match(logs[0], /narrowed/)
})

test("minimizeImports: the text the daemon normalised is what is returned", async () => {
  const leak = fakeLeak({ imports: ["Tengoku.Seed.A"], plainText: (s) => ok(s.replace("import Tengoku.Seed.A", "import Tengoku.Seed.A") + "\n-- normalised") })
  const r = await minimizeImports(PROOF, leak.verify)
  assert.equal(r.narrowed, true)
  assert.ok(r.script.endsWith("-- normalised"))
})

test("minimizeImports: the root import is narrowed too", async () => {
  const leak = fakeLeak({ imports: ["Tengoku.Seed.A"] })
  const r = await minimizeImports(PROOF.replace("Tengoku.All", "Tengoku"), leak.verify)
  assert.equal(r.narrowed, true)
  assert.deepEqual(r.from, ["Tengoku"])
})

test("minimizeImports: every outcome that is not a full success returns the input script byte for byte", async () => {
  const cases = [
    ["the probe did not report", { noReport: true }],
    ["the probe did not report", { staleTag: true, imports: ["Tengoku.Seed.A"] }], // a linter left in the worker by an earlier call answered with its own tag
    ["the script is not clean under the probe", { imports: ["Tengoku.Seed.A"], fullExtra: ["declaration uses `sorry`"] }],
    ["no module of the tree is needed", { imports: ["Lean.Data.Name"] }],
    ["no module of the tree is needed", { imports: [] }],
    ["the narrowed script does not compile", { imports: ["Tengoku.Seed.A"], noHashReport: true }],
    ["the narrowed script does not compile cleanly", { imports: ["Tengoku.Seed.A"], hashExtra: ["unused variable `h`"] }],
    ["the types differ under the narrowed imports", { imports: ["Tengoku.Seed.A"], typesNarrow: { hash: "222", n: 2 } }],
    ["the narrowed script was not accepted", { imports: ["Tengoku.Seed.A"], plainOk: false }],
    ["the daemon put the whole tree back", { imports: ["Tengoku.Seed.A"], plainText: (s) => ok(s.replace("import Tengoku.Seed.A", "import Tengoku.All")) }],
  ]
  for (const [reason, cfg] of cases) {
    const leak = fakeLeak(cfg)
    const r = await minimizeImports(PROOF, leak.verify)
    assert.equal(r.narrowed, false, reason)
    assert.equal(r.reason, reason, JSON.stringify(cfg))
    assert.equal(r.script, PROOF, reason)
  }
})

test("minimizeImports: a report that lacks the imports line or the digest is no report", async () => {
  for (const text of [
    (tag) => fail(`linter tgMinImports failed: TG_RUN ${tag} TG_TYPES: 1 n=1`), // no TG_MIN_IMPORTS
    (tag) => fail(`linter tgMinImports failed: TG_RUN ${tag} TG_MIN_IMPORTS: Tengoku.Seed.A`), // no TG_TYPES
  ]) {
    const verify = async (script) => ({ text: text(tagOf(script)) })
    const r = await minimizeImports(PROOF, verify)
    assert.equal(r.narrowed, false)
    assert.equal(r.reason, "the probe did not report")
  }
})

test("minimizeImports: the narrowed header keeps every module of the report, the ones outside the tree too", async () => {
  const leak = fakeLeak({ imports: ["Tengoku.Seed.A", "Std.Data.HashMap.Basic"] })
  const r = await minimizeImports(PROOF, leak.verify)
  assert.equal(r.narrowed, true)
  assert.deepEqual(splitScript(r.script).imports, ["Std.Data.HashMap.Basic", "Tengoku.Seed.A"])
})

test("minimizeImports: the number of types counts too", async () => {
  const leak = fakeLeak({ imports: ["Tengoku.Seed.A"], typesNarrow: { hash: "111", n: 3 } })
  const r = await minimizeImports(PROOF, leak.verify)
  assert.equal(r.narrowed, false)
  assert.equal(r.reason, "the types differ under the narrowed imports")
})

test("minimizeImports: a daemon that fails at any of the three calls leaves the script as it was", async () => {
  for (const at of [1, 2, 3]) {
    const leak = fakeLeak({ imports: ["Tengoku.Seed.A"], throwAt: at })
    const r = await minimizeImports(PROOF, leak.verify)
    assert.equal(r.narrowed, false, `call ${at}`)
    assert.match(r.reason, /^error: daemon went away/)
    assert.equal(r.script, PROOF)
  }
})

test("minimizeImports: a script that already names its modules, or has no header, is not touched and nothing is asked of the daemon", async () => {
  const leak = fakeLeak({ imports: ["Tengoku.Seed.A"] })
  const specific = "import Tengoku.Seed.Data.Nat.Basic\n\ntheorem x : True := trivial\n"
  assert.equal((await minimizeImports(specific, leak.verify)).reason, "the imports are already specific")
  assert.equal((await minimizeImports("theorem x : True := trivial\n", leak.verify)).reason, "the script has no import header")
  assert.equal((await minimizeImports("", leak.verify)).narrowed, false)
  assert.equal((await minimizeImports(null, leak.verify)).narrowed, false)
  assert.equal(leak.calls.length, 0)
})

test("minimizeImports: the first call is the probe of the original script, the second runs without the linter", async () => {
  const leak = fakeLeak({ imports: ["Tengoku.Seed.A"] })
  await minimizeImports(PROOF, leak.verify, { nonce: "fixed" })
  assert.equal(leak.calls[0], fullProbe(PROOF, "fixed"))
  assert.equal(leak.calls[1], hashProbe(narrowScript(PROOF, ["Tengoku.Seed.A"]), "fixedd"))
})

test("minimizeImports: a log function that throws changes nothing", async () => {
  const leak = fakeLeak({ imports: ["Tengoku.Seed.A"] })
  const r = await minimizeImports(PROOF, leak.verify, { log: () => { throw new Error("log broke") } })
  assert.equal(r.narrowed, true)
})

test("minimizeImports: a header with an extra specific import keeps it", async () => {
  const src = "import Tengoku.All\nimport Tengoku.Seed.Data.Nat.Basic\n\ntheorem x : True := trivial\n"
  const leak = fakeLeak({ imports: ["Tengoku.Seed.Order.Basic"] })
  const r = await minimizeImports(src, leak.verify)
  assert.equal(r.narrowed, true)
  assert.deepEqual(splitScript(r.script).imports, ["Tengoku.Seed.Data.Nat.Basic", "Tengoku.Seed.Order.Basic"])
})

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the wiring in the bridge
// ---------------------------------------------------------------------------------------------------------------------------------------------

const bridge = readFileSync(new URL("../../public/local-claude-bridge.mjs", import.meta.url), "utf8")

test("the bridge loads the module from its own directory, and the feature has an off switch", () => {
  assert.match(bridge, /import\(new URL\("\.\/leak-min-imports\.mjs", import\.meta\.url\)\.href\)/)
  assert.match(bridge, /LEAK_MIN_IMPORTS === "0"/)
})

test("the bridge narrows the proof of both /prove-tree styles before it is shown, banked and returned", () => {
  const calls = [...bridge.matchAll(/proof = await narrowFinalProof\(proof, ctx, emit\)/g)]
  assert.equal(calls.length, 2)
  for (const c of calls) {
    const before = bridge.slice(Math.max(0, c.index - 400), c.index)
    assert.match(before, /proof = r\.proof|proof = ok \? root\.proof : ""/)
    const after = bridge.slice(c.index, c.index + 900)
    assert.match(after, /Verified proof/)
  }
})
