// Driver health: reads one Leak run transcript (~/.leak-runs/<run>.jsonl, the bridge's own record) and says how the agent behaved.
//
//   node tools/driver-health/score.mjs ~/.leak-runs/2026-10-20T13-46-11-256Z-erdos_396.jsonl [--json]
//
// Healthy signs: it verifies often, states general lemmas (free parameters, not instances), searches the library and uses what it finds,
// steps stuck goals, asks questions and conjectures in its own words, closes each stretch with a lab note (NOTE:/NEXT:), and keeps the
// thread when resumed. Red flags: it calls the problem open, hard or unsolved, reports on its status or on what others found, looks it
// up on the web, runs brute-force searches or polls jobs with sleep, lets long stretches pass with nothing verified, or records bare
// instances (a witness for one k) as if they were theorems. The score is a reading aid for a person comparing harnesses, not a judge.
import fs from "node:fs"
import { parseTranscript } from "../lrr-sync/core.mjs"

const RE = {
  defeat: /\b(open problem|is (still )?open|remains open|no (viable )?(route|plan|path|way)( to| forward)?|cannot be (done|proved|proven)|can't be (done|proved|proven)|impossible|beyond (my |our )?(reach|means|tools)|out of reach|unsolved|give up|giving up|I('m| am) stopping|stopping here|not going to claim|don't think I can|do not think I can|not (feasible|tractable))\b/i,
  authority: /\b(erdosproblems|oeis|arxiv|the literature|is known|known result|experts|nobody has|no one has|has been (shown|proved|proven) by|according to|the forum|the comments)\b/i,
  curiosity: /\b(conjecture|hypothesis|hypothesise|I suspect|hunch|what if|why (does|is|would|should)|interesting|curious|surprising|surprise|notice that|observe that|I wonder|let me check whether|try to understand|obstruction|necessary condition|sufficient condition|this forces|this gives|the key (bound|lemma|idea|fact)|generali[sz]e|generali[sz]ation|restate|reformulat|invariant|monotone|counterexample|reusable|bridge lemma|structure)\b/i,
  web: /\b(curl|wget)\b|https?:\/\//i,
  poll: /\bsleep\s+\d+|\buntil\s+\[|\bwhile\s+\[|for\s+\w+\s+in\s+\$\(seq|\bwait\b.*\$!/,
  background: /\bnohup\b|&\s*(;|$|\))|run_in_background/,
  sweep: /\bseq\s+\d{5,}|range\(\s*\d{6,}|\b\d{9,}\b|for\s*\(\s*\w+\s*=\s*\d+.*<\s*\d{6,}/,
  instanceName: /_k\d+$|witness|_n\d+$/i,
}
const LEMMA_HEAD = /^(?:open\s+\S+\s+in\s*\n)?\s*(?:@\[[^\]]*\]\s*)?(?:private\s+|protected\s+|noncomputable\s+)?(theorem|lemma)\s+([^\s(:]+)([\s\S]*?):=/m

function statementIsGeneral(closure) {
  // the last declaration in the block is the saved one
  const decls = String(closure || "").split(/\n(?=(?:open\s+\S+\s+in\s*\n)?\s*(?:theorem|lemma)\s)/)
  const last = decls[decls.length - 1] || ""
  const m = LEMMA_HEAD.exec(last)
  if (!m) return null
  const sig = m[3]
  // a binder over names (not "(7 : ℕ)", which is a numeral with a type), or a quantifier in the statement
  if (/[(\[{]\s*[A-Za-z_][\w'.]*(?:\s+[A-Za-z_][\w'.]*)*\s*:\s*[^)\]}]*[)\]}]/.test(sig) || /∀|∃|→/.test(sig)) return true
  return false
}

const agentText = (t) => {
  if (!t.startsWith("TEXT — ")) return null
  const body = t.slice("TEXT — ".length)
  const s = body.replace(/^🧠\s?/, "") // the stage tag, when the frame carries one
  if (/^(⏳|↩️|🌙|✅|⚠️|🎯|🏦|🧾|🔎)/.test(s)) return null // the harness's own lines
  if (/^(Control (II|IV) \w+:|Attempt \d+ —|Control (II|IV) \w+ (closed it|ran out|reached))/.test(s)) return null
  return s
}

export function scoreTranscript(text) {
  const t = parseTranscript(text)
  const ev = t.events
  const start = t.start || {}
  const r = {
    strategy: start.strategy || "",
    model: start.model || "",
    voice: /voice (\w+)/.exec(ev.map((e) => e.text).find((x) => /^PROMPT TO THE AGENT/.test(x || "")) || "")?.[1] || null,
    minutes: ev.length ? Math.round(((ev[ev.length - 1].t || 0) / 60) * 10) / 10 : 0,
    verify: { calls: 0, ok: 0, failed: 0, perTenMin: 0, longestGapMin: 0 },
    search: { calls: 0 },
    leakII: { calls: 0 },
    memory: { recalls: 0, saved: 0, general: 0, instances: 0, names: [] },
    bash: { calls: 0, web: 0, poll: 0, background: 0, sweep: 0, longest_s: 0, over2min: 0 },
    text: { stretches: 0, words: 0, questions: 0, curiosity: 0, defeat: 0, authority: 0, notes: 0, nexts: 0, endsWithNext: 0 },
    thinking: { blocks: 0 },
    harness: { stops: 0, resumes: 0, nudges: 0 },
    infra: { toolTimeouts: 0, toolsMissing: 0 },
    flags: [],
    signals: [],
  }
  let lastVerifyT = 0
  const pending = [] // open tool calls: { tool, t, bash }
  let lastAgentText = null
  for (const e of ev) {
    const x = String(e.text || "")
    const at = Number(e.t) || 0
    if (x.startsWith("TOOL_CALL → ")) {
      const tool = x.slice(12).split("\n")[0].trim()
      const input = x.slice(x.indexOf("\n") + 1)
      pending.push({ tool, t: at })
      if (/verify_full_script$/.test(tool)) {
        r.verify.calls++
        r.verify.longestGapMin = Math.max(r.verify.longestGapMin, (at - lastVerifyT) / 60)
        lastVerifyT = at
      } else if (/loogle_search|moogle_search/.test(tool)) r.search.calls++
      else if (/init_proof|apply_tactic|get_current_proof_state|snapshot_state|branch_tactics/.test(tool)) r.leakII.calls++
      else if (/memory_recall|memory_list/.test(tool)) r.memory.recalls++
      else if (tool === "Bash") {
        r.bash.calls++
        let cmd = input
        try {
          cmd = String(JSON.parse(input).command ?? input)
        } catch {}
        if (RE.web.test(cmd)) r.bash.web++
        if (RE.poll.test(cmd)) r.bash.poll++
        if (RE.background.test(cmd)) r.bash.background++
        if (RE.sweep.test(cmd)) r.bash.sweep++
      }
    } else if (x.startsWith("TOOL_RESULT") || x.startsWith("TOOL_ERROR")) {
      if (/sent no response or progress for \d+s; aborting/.test(x)) r.infra.toolTimeouts++
      if (/No matching deferred tools found/.test(x)) r.infra.toolsMissing++
      const c = pending.shift()
      if (c) {
        if (/verify_full_script$/.test(c.tool)) {
          if (/Compilation Successful/.test(x)) r.verify.ok++
          else r.verify.failed++
        }
        if (c.tool === "Bash") {
          const d = at - c.t
          r.bash.longest_s = Math.max(r.bash.longest_s, d)
          if (d > 120) r.bash.over2min++
        }
      }
    } else if (x.startsWith("THINKING — ")) r.thinking.blocks++
    else if (x.startsWith("SYSTEM — Saved to memory: ")) {
      const name = x.slice("SYSTEM — Saved to memory: ".length).split("\n")[0].trim()
      const closure = x.slice(x.indexOf("\n") + 1)
      r.memory.saved++
      r.memory.names.push(name)
      const g = statementIsGeneral(closure)
      if (g === true && !RE.instanceName.test(name)) r.memory.general++
      else r.memory.instances++
    } else if (/^TEXT — ↩️ The agent stopped after/.test(x)) r.harness.nudges++
    else if (/^TEXT — 🧠 Attempt \d+ —/.test(x)) r.harness.resumes++
    else {
      const s = agentText(x)
      if (s === null) continue
      r.text.stretches++
      r.text.words += s.split(/\s+/).filter(Boolean).length
      const prose = s.replace(/```[\s\S]*?```/g, "")
      r.text.questions += (prose.match(/\?/g) || []).length
      r.text.curiosity += (prose.match(new RegExp(RE.curiosity.source, "gi")) || []).length
      r.text.defeat += (prose.match(new RegExp(RE.defeat.source, "gi")) || []).length
      r.text.authority += (prose.match(new RegExp(RE.authority.source, "gi")) || []).length
      if (/^\s*\**NOTE\**:?/im.test(s)) r.text.notes++
      if (/^\s*\**NEXT\**:?/im.test(s)) r.text.nexts++
      lastAgentText = s
    }
  }
  r.harness.stops = r.harness.nudges + r.harness.resumes
  // a stretch that closes with NEXT: the last agent text before each harness stop line, approximated by the count of NEXT lines
  r.text.endsWithNext = r.text.nexts
  if (ev.length) r.verify.longestGapMin = Math.max(r.verify.longestGapMin, ((ev[ev.length - 1].t || 0) - lastVerifyT) / 60)
  r.verify.longestGapMin = Math.round(r.verify.longestGapMin * 10) / 10
  r.verify.perTenMin = r.minutes ? Math.round((r.verify.calls / r.minutes) * 100) / 10 : 0
  r.memory.names = r.memory.names.slice(0, 40)
  r.lastText = lastAgentText ? lastAgentText.slice(-600) : null

  // ---- reading --------------------------------------------------------------------------------------------------------------------
  const flag = (k, v) => r.flags.push(`${k}: ${v}`)
  const sig = (k, v) => r.signals.push(`${k}: ${v}`)
  if (r.text.defeat) flag("defeatism", `${r.text.defeat} mention(s) of open/impossible/no route/stopping`)
  if (r.text.authority) flag("appeals to authority", `${r.text.authority} mention(s) of status, literature or others' results`)
  if (r.bash.web) flag("web lookups", `${r.bash.web} shell command(s) with curl/wget/URL`)
  if (r.bash.poll) flag("polling", `${r.bash.poll} command(s) that sleep or loop waiting`)
  if (r.bash.sweep) flag("brute force", `${r.bash.sweep} command(s) sweeping a large range`)
  if (r.bash.over2min) flag("long jobs", `${r.bash.over2min} shell call(s) over 2 min (longest ${Math.round(r.bash.longest_s)} s)`)
  if (r.minutes >= 10 && r.verify.longestGapMin >= 10) flag("idle compiler", `${r.verify.longestGapMin} min without a verify call`)
  if (r.memory.instances && r.memory.instances >= r.memory.general) flag("instances", `${r.memory.instances} saved instance(s) vs ${r.memory.general} general lemma(s)`)
  if (r.harness.stops && r.text.nexts < r.harness.stops) flag("open-ended pauses", `${r.harness.stops} pause(s), ${r.text.nexts} with a NEXT line`)
  if (r.infra.toolTimeouts || r.infra.toolsMissing) flag("infrastructure", `${r.infra.toolTimeouts} MCP tool timeout(s), ${r.infra.toolsMissing} "no matching tools" answer(s): the Leak servers, not the agent`)
  if (r.verify.calls) sig("verifies", `${r.verify.calls} call(s), ${r.verify.ok} accepted, ${r.verify.perTenMin} per 10 min`)
  if (r.memory.general) sig("general lemmas", `${r.memory.general} saved with free parameters`)
  if (r.search.calls) sig("library search", `${r.search.calls} loogle/moogle call(s)`)
  if (r.leakII.calls) sig("goal stepping", `${r.leakII.calls} Leak II call(s)`)
  if (r.memory.recalls) sig("recall", `${r.memory.recalls} memory_recall/list call(s)`)
  if (r.text.curiosity) sig("curiosity", `${r.text.curiosity} conjecture/why/what-if/observe mention(s)`)
  if (r.text.questions) sig("questions", `${r.text.questions} question mark(s) in its own prose`)
  if (r.text.nexts) sig("lab notes", `${r.text.notes} NOTE, ${r.text.nexts} NEXT`)
  if (r.thinking.blocks) sig("thinking", `${r.thinking.blocks} block(s) recorded`)
  const hard = r.text.defeat + r.bash.web + r.bash.sweep + r.bash.poll
  r.verdict = hard === 0 && r.verify.calls >= Math.max(2, r.minutes / 5) && r.memory.general >= 1 && r.text.curiosity >= 3 && (r.harness.stops === 0 || r.text.nexts >= r.harness.stops) ? "healthy" : hard === 0 ? "quiet" : "red"
  return r
}

export function renderReport(r) {
  const lines = [
    `${r.strategy} · ${r.model} · voice ${r.voice || "?"} · ${r.minutes} min · verdict: ${r.verdict.toUpperCase()}`,
    `  verify ${r.verify.calls} (${r.verify.ok} ok, ${r.verify.perTenMin}/10min, longest gap ${r.verify.longestGapMin} min) · search ${r.search.calls} · Leak II ${r.leakII.calls} · recall ${r.memory.recalls} · bash ${r.bash.calls}`,
    `  saved ${r.memory.saved} (${r.memory.general} general, ${r.memory.instances} instances) · text: ${r.text.stretches} stretches, ${r.text.questions} ?, curiosity ${r.text.curiosity}, defeat ${r.text.defeat}, authority ${r.text.authority}, NOTE ${r.text.notes}, NEXT ${r.text.nexts} · pauses ${r.harness.stops} · thinking ${r.thinking.blocks}`,
    `  signals: ${r.signals.length ? r.signals.join(" | ") : "none"}`,
    `  flags:   ${r.flags.length ? r.flags.join(" | ") : "none"}`,
  ]
  if (r.lastText) lines.push(`  last words: ${JSON.stringify(r.lastText.slice(-300))}`)
  return lines.join("\n")
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  const json = process.argv.includes("--json")
  for (const f of files) {
    const r = scoreTranscript(fs.readFileSync(f, "utf8"))
    console.log(json ? JSON.stringify({ file: f, ...r }) : `${f}\n${renderReport(r)}\n`)
  }
}
