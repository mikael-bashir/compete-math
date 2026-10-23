# Intake notices

What became of the theorems an account put forward to Tengoku, shown at `competemath.com/leak` (the **Notices** button next to *Saved theorems*) and handed to the driver, the agent that does
the proving. A week-long or month-long run cannot be watched; this is how it hears about its own work while it goes on.

## What a notice is

One row per account, target, pull request and code (`leak_intake_notice`). Its **kind** says what happened (`submitted`, `merged`, `gate_failed`, `changes_requested`, `returned`, `rejected`,
`closed`), its **code** says why (`bar.merit`, `gate.isnad`, `dedupe.identical`, `style.sorry` ...), its **level** (`info`, `success`, `warn`, `error`) follows from the kind. The words of a code (its
title, what it means, **what the driver should do about it**) come from one table, `src/app/lib/leak-memory/notices-catalogue.ts`. A code the table does not know falls back to its check (`style.line_length` is
`style`), then to a plain "Notice".

## Where the notices come from

The intake job (`competemath/emissary-archangel`, `.github/workflows/memory-intake.yml`) and its reporter post to `POST /api/leak/memory/intake-events`, with a GitHub Actions OIDC token (the gate the candidates
already use; off unless `LEAK_INTAKE_ENABLED=1`; only accounts in `LEAK_INTAKE_ACCOUNTS` can be written about):

```json
{ "events": [ { "username": "ada", "target": "collatz", "kind": "returned", "code": "bar.merit", "ids": ["<entry id>"], "names": ["lemma_one"], "detail": "the reviewer's words" } ],
  "prs":    [ { "username": "ada", "target": "collatz", "number": 12, "url": "https://github.com/competemath/tengoku/pull/12",
                "events": [ { "kind": "submitted", "code": "pr.opened", "ids": ["..."] }, { "kind": "gate_failed", "code": "gate.isnad" } ] } ] }
```

`events` are outcomes that belong to no pull request (a theorem the bar returned before one was opened). Each of `prs` is the **current** state of a pull request: the notices it lists are written, the ones it
had before and does not list any more are *answered* (state `resolved`), and a merged or closed pull request answers all its waiting notices. A theorem submitted again answers the verdicts it had before.
Re-reporting the same thing changes nothing the account did: an ignored notice stays ignored.

## What the account can do (all in the modal, all its own)

| Setting | Why it matters over days |
|---|---|
| **Ignore** a notice, or **mute** a code (here, or everywhere) | what is not worth the driver's attention costs it tokens at every attempt for the rest of the run |
| *Least severe notice it hears about* | failures only, or progress too |
| *When a theorem is returned*: revise it / only when it fits / do not | the driver spends its effort where the account wants it |
| *Most notices* and *most characters* per attempt | the budget: a long run pays for every character at every attempt |
| *Tell it what was accepted* (for a week) | so it builds on merged theorems instead of proving them again |
| **Pause the intake** for a target | nothing of that target is taken while paused (`/api/leak/memory/candidates` skips it); nothing is lost |
| **Standing note** per target, in the account's words (600 characters) | an instruction that reaches every attempt of a run that lasts a month |
| *Tell the driver about notices* (off) | silences everything, the note included |

*What the driver reads for this target now* shows the exact text.

## How the driver hears

* **At the start of every attempt**: the page asks `GET /api/leak/notices/driver?target=` when a run starts and sends the text (with a hash) with the run (`options.notices`). The bridge
  puts it in the attempt's prompt and in the reminders that follow when it changed.
* **During a long attempt** (an attempt can last hours): the page asks again every 10 minutes and whenever the account changes a setting, and when the hash changed it posts the text to the bridge
  (`POST /notices {runId, text, hash}`). The bridge writes it to a file the run's agents are given (`LEAK_AGENT_NOTICES`) and a **PostToolUse hook** hands the agent the new text after its next tool call,
  once per hash. When nothing is open any more the agent is told that, so it does not keep acting on answered notices.
* **Proven**: the live-bridge scenarios (`tests/leak-memory/live-bridge.mjs`, "notices: ...") run the real bridge against a fake CLI; `tests/leak-memory/real-cli-notices.mjs` runs the *real* Claude CLI
  and shows the model receiving a hook's context after a tool call (a few cents; by hand).

## What never reaches the driver

A reviewer's or a check's own words (`detail`) are shown to the account, escaped, and **never** to the driver: the driver reads the catalogue's sentences, the theorem names (letters, digits, `_.'!?`
only) and the account's own note. A pull request link is accepted only if it is a Tengoku pull request.

## Not built

The intake job that sends the events (`competemath/emissary-archangel`); notifications outside the page (mail, push); per-notice snooze.
