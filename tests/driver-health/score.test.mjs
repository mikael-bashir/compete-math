// node --test tests/driver-health/score.test.mjs
//
// tools/driver-health/score.mjs: what counts as a healthy sign and what as a red flag, on transcripts written for the purpose.
import test from "node:test"
import assert from "node:assert/strict"
import { scoreTranscript, renderReport } from "../../tools/driver-health/score.mjs"

const START = { kind: "start", at: "2026-10-20T10:00:00.000Z", theorem: "theorem erdos_396 : True := by\n  sorry", strategy: "control-honoured-iv", model: "claude-sonnet-5-5" }
const jl = (...objs) => objs.map((o) => JSON.stringify(o)).join("\n") + "\n"
const ev = (t, text) => ({ kind: "event", t, text })
const call = (t, tool, input) => ev(t, `TOOL_CALL → ${tool}\n${JSON.stringify(input)}`)
const result = (t, text) => ev(t, `TOOL_RESULT\n${text}`)
const say = (t, text) => ev(t, `TEXT — 🧠 ${text}`)

test("a curious, verifying, note-keeping stretch is healthy", () => {
  const lines = [START, ev(0, "PROMPT TO THE AGENT — [CONTROL IV MEMORY — Control IV Honoured · voice curious · attempt 1]\n\n…")]
  let t = 10
  for (let i = 0; i < 6; i++) {
    lines.push(call(t, "mcp__Leak_I__loogle_search", { query: "Nat.centralBinom" }), result(t + 2, "found 3"))
    lines.push(say(t + 5, `I suspect the carries are the whole story. Why does the p = 2 case work? Let me state a conjecture and ask the compiler.`))
    lines.push(call(t + 10, "mcp__Leak_IV__verify_full_script", { script: `theorem carry_lemma_${i} (p n k : ℕ) (hp : p.Prime) : n % p ≤ k → True := by\n  intro _; trivial` }), result(t + 30, "✅ Compilation Successful!"))
    lines.push(ev(t + 31, `SYSTEM — Saved to memory: carry_lemma_${i}\ntheorem carry_lemma_${i} (p n k : ℕ) (hp : p.Prime) : n % p ≤ k → True := by\n  intro _; trivial`))
    lines.push(call(t + 40, "mcp__Leak_II__init_proof", { goal: "x" }), result(t + 41, "state 1"))
    lines.push(ev(t + 42, "THINKING — what if the second digit matters more than the first?"))
    t += 120
  }
  lines.push(say(t, "Interesting: the obstruction is only ever at the second digit.\nNOTE: the first-digit case is closed for every prime.\nNEXT: state the second-digit lemma for p = 2."))
  lines.push(ev(t + 1, "TEXT — ↩️ The agent stopped after 12 minute(s) without a verified proof: continuing the same conversation (1 of 2)."))
  lines.push(ev(t + 2, "PROMPT TO THE AGENT (follow-up) — …"))
  lines.push(say(t + 60, "Back to it. The second-digit lemma:"), call(t + 70, "mcp__Leak_IV__verify_full_script", { script: "theorem second_digit (p n : ℕ) : True := trivial" }), result(t + 90, "✅ Compilation Successful!"))
  lines.push(ev(t + 91, "SYSTEM — Saved to memory: second_digit\ntheorem second_digit (p n : ℕ) : True := trivial"))
  lines.push(say(t + 100, "NOTE: done for now.\nNEXT: generalise second_digit to all digits."))
  lines.push({ kind: "end", at: "2026-10-20T10:15:00.000Z", ok: false, reason: "time", seconds: t + 100 })
  const r = scoreTranscript(jl(...lines))
  if (process.env.DEBUG_SCORE) console.log(renderReport(r))
  assert.equal(r.verdict, "healthy", renderReport(r))
  assert.equal(r.voice, "curious")
  assert.equal(r.verify.calls, 7)
  assert.equal(r.verify.ok, 7)
  assert.equal(r.memory.saved, 7)
  assert.equal(r.memory.general, 7)
  assert.equal(r.memory.instances, 0)
  assert.equal(r.search.calls, 6)
  assert.equal(r.leakII.calls, 6)
  assert.ok(r.text.curiosity >= 6)
  assert.ok(r.text.questions >= 6)
  assert.equal(r.text.nexts, 2)
  assert.equal(r.harness.stops, 1)
  assert.equal(r.thinking.blocks, 6)
  assert.deepEqual(r.flags, [])
})

test("web lookups, brute force, polling, defeatism and bare instances are red flags", () => {
  const lines = [START]
  lines.push(call(5, "Bash", { command: "curl -s https://www.erdosproblems.com/396 | head" }), result(6, "<html>"))
  lines.push(say(10, "erdosproblems.com lists this as an open problem, and I have no route to it. I'm stopping here rather than claim otherwise."))
  lines.push(call(20, "Bash", { command: "nohup ./s 11 500000000000 600000000000 > out.txt &" }), result(21, "started"))
  lines.push(call(30, "Bash", { command: "for i in $(seq 1 58); do [ -s flag ] && break; sleep 10; done; cat out.txt" }), result(600, ""))
  lines.push(call(700, "mcp__Leak_IV__verify_full_script", { script: "theorem E396_k10 : (17609764994 : ℕ).descFactorial 11 ∣ (17609764994 : ℕ).centralBinom := by decide" }), result(720, "✅ Compilation Successful!"))
  lines.push(ev(721, "SYSTEM — Saved to memory: E396_k10\ntheorem E396_k10 : (17609764994 : ℕ).descFactorial 11 ∣ (17609764994 : ℕ).centralBinom := by decide"))
  lines.push(say(730, "That settles k = 10, but the target is still open."))
  lines.push(ev(731, "TEXT — ↩️ The agent stopped after 12 minute(s) without a verified proof: continuing the same conversation (1 of 2)."))
  lines.push({ kind: "end", at: "2026-10-20T10:15:00.000Z", ok: false, reason: "time", seconds: 900 })
  const r = scoreTranscript(jl(...lines))
  assert.equal(r.verdict, "red")
  assert.equal(r.bash.web, 1)
  assert.equal(r.bash.background, 1)
  assert.equal(r.bash.poll, 1)
  assert.equal(r.bash.sweep, 1)
  assert.equal(r.bash.over2min, 1)
  assert.ok(r.text.defeat >= 3, `defeat ${r.text.defeat}`)
  assert.ok(r.text.authority >= 1)
  assert.equal(r.memory.instances, 1)
  assert.equal(r.memory.general, 0)
  assert.equal(r.text.nexts, 0)
  const flags = r.flags.join(" | ")
  for (const f of ["defeatism", "appeals to authority", "web lookups", "polling", "brute force", "long jobs", "instances", "open-ended pauses"]) assert.match(flags, new RegExp(f), flags)
})

test("the harness's own lines are not the agent's words, and infrastructure trouble is its own flag", () => {
  const lines = [START, ev(0, "TEXT — 🧠 Control IV Honoured: one continuous agent against Leak IV … no cap on it, until the clock ends."), ev(1, "TEXT — ⏳ 🧠 45s with nothing to show: the CLI is alive"), ev(2, "TEXT — 🧠 Attempt 2 — resuming the SAME session")]
  lines.push(call(5, "mcp__Leak_IV__verify_full_script", { script: "x" }), result(310, 'MCP server "Leak_IV" tool "verify_full_script" sent no response or progress for 300s; aborting.'))
  lines.push(call(320, "ToolSearch", { query: "x" }), result(321, "No matching deferred tools found."))
  lines.push({ kind: "end", at: "2026-10-20T10:15:00.000Z", ok: false, reason: "time", seconds: 400 })
  const r = scoreTranscript(jl(...lines))
  assert.equal(r.text.stretches, 0)
  assert.equal(r.text.defeat, 0)
  assert.equal(r.harness.resumes, 1)
  assert.equal(r.infra.toolTimeouts, 1)
  assert.equal(r.infra.toolsMissing, 1)
  assert.match(r.flags.join(" | "), /infrastructure/)
})

test("a general lemma is one with a binder or a quantifier; an instance has only numerals", () => {
  const mk = (closure, name) => scoreTranscript(jl(START, ev(1, `SYSTEM — Saved to memory: ${name}\n${closure}`), { kind: "end", at: "2026-10-20T10:01:00.000Z", ok: false, reason: "time", seconds: 60 })).memory
  assert.equal(mk("open Nat in\ntheorem foo (n k : ℕ) : n + k = k + n := by omega", "foo").general, 1)
  assert.equal(mk("theorem bar : ∀ n : ℕ, n = n := fun _ => rfl", "bar").general, 1)
  assert.equal(mk("theorem E396_k3 : (8178 : ℕ).descFactorial 4 ∣ (8178 : ℕ).centralBinom := by decide", "E396_k3").instances, 1)
  assert.equal(mk("theorem helper (p : ℕ) : True := trivial\n\ntheorem inst_7 : (7 : ℕ) = 7 := rfl", "inst_7").instances, 1, "the last declaration is the saved one")
})
