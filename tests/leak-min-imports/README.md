# Narrowing the imports of a verified proof

`public/leak-min-imports.mjs` turns the header `import Tengoku.All` of a verified proof into the modules it needs
(Tengoku.All is 27,023 modules and about 38 s to load on Leak IV; a typical proof needs 2–5k modules and 3–5 s). The bridge calls it for the final proof of
`/prove-tree` (`narrowFinalProof`); `LEAK_MIN_IMPORTS=0` turns it off. No change to Leak IV: it only uses `verify_full_script`.

Three calls, and the script is returned unchanged unless all three pass:

1. **probe** — the verified script with a linter registered after its imports and a marker after its last command. The linter collects, per command, the modules of the
   constants the declaration transitively uses, of the syntax kinds written (tactics, notation), of the dotted names written and of its attributes; at the marker it keeps the
   irredundant core (Mathlib's `getIrredundantImports`) and adds the umbrella module of every tactic family it met (`Tengoku.Seed.Tactic.<Family>`: the extensions of positivity,
   norm_num, linarith… are registered by attribute and no proof term mentions them). It reports the list and a digest of the types of every constant the script declared, as an error
   message (the only channel Leak IV returns).
2. **check** — the narrowed script plus a probe that reports the digest alone (no linter, no extra import): the digest must be the same, and nothing else may be reported.
3. **verify** — the narrowed script, plain. The text Leak IV normalised is what is returned.

Things that were learned and are pinned by tests:

* Lean elaborates theorems asynchronously, and a linter then runs after the NEXT command has started: the marker could report before an earlier theorem had been seen
  (1, 2 or 3 commands seen for the same script). Both probes start with `set_option Elab.async false`.
* A linter registered in Leak IV's worker stays until the worker restarts: the probe removes its own at the marker and when it is 20 minutes old, and its registration command
  carries a nonce so that Lean's incremental elaboration runs it again on every call.
* Single-word identifiers are not looked at (`x`, `h`, `a`): the tree has libraries that declare root constants with such names, and `#min_imports` would take them for dependencies.

```
npm run test:minimps                                        # unit tests, no network
node tests/leak-min-imports/live-smoke.mjs                  # one script through the three calls on the live Leak IV
node tests/leak-min-imports/live-corpus.mjs --dir tests/leak-min-imports/corpus --out out.jsonl   # the 20 scripts of corpus/
```
