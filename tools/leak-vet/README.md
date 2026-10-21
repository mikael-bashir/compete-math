# leak-vet

Vets a Leak target against Leak IV before any run is paid for.

```
pnpm vet:targets [target-id ...]      # LEAK_IV_URL overrides the verifier; about a minute per target
```

It is the part of Tau Ceti's roadmap-time gate that can be done mechanically:

- the statement has the plain form (closed, no binders before the colon) and compiles with only the expected `sorry`;
- neither the statement nor its negation falls to a cheap tactic (`decide`, `simp`, `omega`, `norm_num`, `aesop`, `tauto`, `positivity`, `exact?`): a "hard" problem a one-liner closes is a misformalisation or a triviality;
- the tactic battery is not broken: it closes `2 + 2 = 4` and not `2 + 2 = 5`, so a pass means something;
- the seeds that back the target's `checks` compile with no `sorry`;
- the informal reading and the provenance are written down.

A probe that gets no answer counts as not closed and is printed as such. What it does not do: judge whether the Lean statement says what the informal one says (that stays the human check recorded in `checks` and `provenance`), or try hard tactics. The pure parts are in `vet-core.mjs` and tested in `tests/leak-vet/`; the run itself needs the network and is not part of `pnpm test`.
