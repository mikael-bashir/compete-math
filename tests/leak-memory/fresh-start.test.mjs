// When the bridge stops resuming a conversation (public/leak-memory.mjs): what counts as a tool call that worked, and the two reasons to open a new
// conversation instead — three stretches in a row with none, or a conversation past 600k tokens. The bridge itself is exercised in live-bridge.mjs.
import assert from "node:assert/strict"
import test from "node:test"

import { FRESH_AFTER_IDLE_STRETCHES, FRESH_AT_CONTEXT_TOKENS, describeProbes, freshStartReason, toolResultSucceeded, toolResultText } from "../../public/leak-memory.mjs"

test("the limits are the ones the run that went wrong called for: three idle stretches, 600k tokens", () => {
  assert.equal(FRESH_AFTER_IDLE_STRETCHES, 3)
  assert.equal(FRESH_AT_CONTEXT_TOKENS, 600_000)
})

test("a conversation is left after the third stretch in a row with no successful tool call, not before", () => {
  assert.equal(freshStartReason({ idleStretches: 0 }), null)
  assert.equal(freshStartReason({ idleStretches: 1 }), null)
  assert.equal(freshStartReason({ idleStretches: 2 }), null)
  assert.equal(freshStartReason({ idleStretches: 3 }), "idle")
  assert.equal(freshStartReason({ idleStretches: 40 }), "idle")
  assert.equal(freshStartReason(), null, "no argument is nothing to act on")
})

test("a conversation is left once it is 600k tokens, not a token before", () => {
  assert.equal(freshStartReason({ contextTokens: 599_999 }), null)
  assert.equal(freshStartReason({ contextTokens: 600_000 }), "context")
  assert.equal(freshStartReason({ contextTokens: 876_000 }), "context")
})

test("when both hold, idle is the reason given (it is the one that says something is broken)", () => {
  assert.equal(freshStartReason({ idleStretches: 3, contextTokens: 700_000 }), "idle")
  assert.equal(freshStartReason({ idleStretches: 2, contextTokens: 700_000 }), "context")
})

test("a tool call worked if it answered, even with a failed compile; it did not if the CLI reports an error or refuses it", () => {
  const block = (content, extra = {}) => ({ type: "tool_result", tool_use_id: "t", content, ...extra })
  assert.equal(toolResultSucceeded(block([{ type: "text", text: "✅ Compilation Successful! The proof is 100% verified." }])), true)
  assert.equal(toolResultSucceeded(block([{ type: "text", text: "❌ Compilation Failed: Line 3 (Error): unsolved goals" }])), true, "a compile that fails is a tool that answered")
  assert.equal(toolResultSucceeded(block("plain string content")), true)
  assert.equal(toolResultSucceeded(block([{ type: "text", text: "<tool_use_error>Error: No such tool available: mcp__Leak_I__loogle_search</tool_use_error>" }])), false)
  assert.equal(toolResultSucceeded(block("Error: result (196,348 characters across 3 lines) exceeds maximum allowed tokens.")), false)
  assert.equal(toolResultSucceeded(block([{ type: "text", text: "fine" }], { is_error: true })), false)
  assert.equal(toolResultSucceeded(null), false)
  assert.equal(toolResultSucceeded(block([])), true, "an empty answer is still an answer")
})

test("a result that merely mentions an error later in its text is not an error", () => {
  assert.equal(toolResultSucceeded({ content: "Found 3 lemmas.\nError: none of them closes the goal" }), true)
  assert.equal(toolResultText({ content: [{ text: "a" }, { text: "b" }] }), "a\nb")
})

test("the probe line names each server, says which is down, and which lost a tool", () => {
  const ok = describeProbes([
    { name: "Leak_IV", ok: true, tools: ["verify_full_script"], expected: ["verify_full_script"] },
    { name: "Leak_I", ok: true, tools: ["loogle_search", "moogle_search"], expected: [] },
  ])
  assert.equal(ok.line, "Leak_IV up (1 tool) · Leak_I up (2 tools)")
  assert.equal(ok.anyBad, false)
  const bad = describeProbes([
    { name: "Leak_IV", ok: true, tools: ["verify_full_script"], expected: ["verify_full_script"] },
    { name: "Leak_I", ok: true, tools: ["moogle_search"], expected: ["loogle_search", "moogle_search"] },
    { name: "Leak_II", ok: false, tools: [], expected: ["init_proof"], error: "mcp call timed out after 20000ms" },
  ])
  assert.equal(bad.line, "Leak_IV up (1 tool) · Leak_I up but missing loogle_search · Leak_II DOWN (mcp call timed out after 20000ms)")
  assert.equal(bad.anyBad, true)
  assert.deepEqual(describeProbes([]), { line: "no MCP server to probe", anyBad: false })
})
