// Leak Elation and Leak Misery as defined in public/leak-memory.mjs: what they are, what they ask the bridge to connect, how the lab voice differs from the
// curious voice, and that the proof boundary is stated. The bridge side is exercised in live-bridge.mjs.
import assert from "node:assert/strict"
import test from "node:test"

import { LAB_RULE, LAB_SERVERS, VARIANTS, VOICES, labGuide, labOf, memoryRules, usesPantograph, voiceFor } from "../../public/leak-memory.mjs"

test("Elation is Control IV Lucid plus the CAS, Misery is Elation plus the ATP; both keep Leak II, the library and the sleep stage", () => {
  const lucid = VARIANTS["control-lucid-iv"]
  for (const k of ["control-elation", "control-misery"]) {
    const v = VARIANTS[k]
    assert.equal(v.pantograph, true, k)
    assert.deepEqual(v.tools, lucid.tools, k)
    assert.deepEqual(v.sleep, lucid.sleep, k)
    assert.equal(v.voice, "lab", k)
    assert.ok(usesPantograph(k))
  }
  assert.equal(VARIANTS["control-elation"].name, "Leak Elation")
  assert.equal(VARIANTS["control-misery"].name, "Leak Misery")
  assert.deepEqual(VARIANTS["control-elation"].lab, ["cas"])
  assert.deepEqual(VARIANTS["control-misery"].lab, ["cas", "atp"])
  assert.equal(VARIANTS["control-lucid-iv"].lab, undefined, "the older variants have no lab")
})

test("the lab servers are on this machine by default, named so that tool ids read mcp__Leak_Lab_CAS__factor", () => {
  assert.equal(LAB_SERVERS.cas.url, "http://127.0.0.1:8021/sse")
  assert.equal(LAB_SERVERS.atp.url, "http://127.0.0.1:8022/sse")
  assert.equal(LAB_SERVERS.cas.name, "Leak_Lab_CAS")
  assert.equal(LAB_SERVERS.atp.name, "Leak_Lab_ATP")
  assert.deepEqual(labOf("control-misery").map((x) => x.key), ["cas", "atp"])
  assert.deepEqual(labOf("control-honoured"), [])
  for (const L of Object.values(LAB_SERVERS)) assert.match(L.start, /^node services\/leak-lab\/start\.mjs (elation|misery)$/)
})

test("the lab voice swaps exactly the no-brute-force rule and keeps everything else of the curious voice", () => {
  const o = { pantograph: true, memoryTools: true }
  const curious = VOICES.curious.opening(o)
  const lab = VOICES.lab.opening({ ...o, lab: labOf("control-misery") })
  assert.match(curious, /OUR INSTRUMENT IS PROOF, NOT SEARCH/)
  assert.doesNotMatch(lab, /OUR INSTRUMENT IS PROOF, NOT SEARCH/)
  assert.ok(lab.includes(LAB_RULE))
  assert.ok(lab.includes("YOUR LAB NOTES"), "the lab notes and the rest of the curious opening are kept")
  assert.ok(lab.includes("THE QUESTION IS YOURS NOW"))
  assert.match(VOICES.lab.systemRule, /^THE LAB IS FOR FINDING OUT WHAT IS TRUE/)
  assert.match(VOICES.lab.systemRule, /NO NETWORK beyond the Leak servers/)
  assert.doesNotMatch(VOICES.lab.systemRule, /OUR INSTRUMENT IS PROOF/)
  assert.equal(voiceFor("lab").key, "lab")
  assert.equal(VOICES.curious.opening(o), curious, "the curious voice itself is not touched")
})

test("the lab guide mentions only the servers that are connected", () => {
  assert.doesNotMatch(labGuide([{ key: "cas" }]), /Leak_Lab_ATP/)
  assert.doesNotMatch(labGuide([{ key: "atp" }]), /Leak_Lab_CAS/)
  const both = labGuide(labOf("control-misery"))
  for (const t of ["map_cycles", "ideal_certificate", "scan_predicate", "find_countermodel", "unsat_core", "smt_check"]) assert.ok(both.includes(t), t)
  assert.equal(VOICES.lab.opening({ pantograph: false, memoryTools: true, lab: [] }).includes("THE LABORATORY"), false)
})

test("the proof boundary is in the prompt in the plainest words", () => {
  assert.match(LAB_RULE, /Everything it prints is an observation/)
  assert.match(LAB_RULE, /Leak IV never reads it/)
  assert.match(LAB_RULE, /Never native_decide or bv_decide/)
  assert.match(LAB_RULE, /say how far you looked/)
  assert.match(LAB_RULE, /5 minutes/)
})

test("the rules line appears for a lab variant and not for the others", () => {
  assert.match(memoryRules("control-elation", { lab: [{ label: "Leak Lab CAS" }] }), /You have a laboratory \(Leak Lab CAS\)/)
  assert.doesNotMatch(memoryRules("control-elation", { lab: [] }), /You have a laboratory/)
  assert.doesNotMatch(memoryRules("control-lucid-iv", {}), /You have a laboratory/)
})
