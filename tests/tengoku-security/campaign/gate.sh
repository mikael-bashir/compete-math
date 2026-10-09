#!/bin/bash
# Phase 1: gate scenarios. Run with TENGOKU_BOT set to a stranger so actor-gated classes are refused.
source "$(dirname "$0")/lib.sh"
: > "$EXPECT"
cd "$WORK" && git checkout -q -f main && git fetch -q origin && git reset -q --hard origin/main
TRUSTED_NAME=$(head -1 data/trusted/equational-theories.jsonl | python3 -c "import json,sys;print(json.loads(sys.stdin.readline())['name'])")
STAGING_FLAT=data/staging/equational-theories.jsonl
D=data/staging/equational-theories
sc() { scenario "$@"; }
# --- the original eleven, per-PR files where the scenario is content
sc clean-append pass - yes queue "One good record in a per-PR staging file." "mkdir -p $D; rec good1 > $D/clean.jsonl"
sc two-purposes fail classify yes gate "Content and tooling in one PR." "mkdir -p $D; rec good2 > $D/two.jsonl; echo '# touched' >> scripts/stats.py"
sc delete-in-staging fail data-rules/append-only yes gate "Deletes a staging line." "sed -i '' -e '1d' $STAGING_FLAT"
sc eval-in-record fail data-rules/content-lint yes gate "Record whose context runs code." "mkdir -p $D; rec bad3 'context=#eval IO.println 1' > $D/eval.jsonl" '#eval'
sc credit-removed fail credits yes gate "Removes an Authors line from a seeded module." 'f=$(grep -rl "^Authors:" Tengoku/Logic | head -1); sed -i "" -e "/^Authors:/d" "$f"' '^-Authors:'
sc fake-secret fail secrets yes gate "AWS example credential pair." 'printf "AWS_KEY=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n" > docs-secret.txt'
sc unsigned fail dco no gate "Commit without Signed-off-by." "mkdir -p $D; rec good4 > $D/unsigned.jsonl"
sc derived-edit fail classify yes gate "Hand edit of a generated module (actor is not the bot)." 'f=$(ls Tengoku/EquationalTheories/*.lean | head -1); echo "-- hand edit" >> "$f"'
sc bad-source fail data-rules/records yes gate "source_url not on the allowlist." "mkdir -p $D; rec bad5 source_url=https://example.com/x > $D/badsrc.jsonl"
sc broken-proof pass - yes queue "Proof of a false statement: gate passes, queue must eject." "mkdir -p $D; rec broken 'proof=:= by\n  exact (by decide : (1 : Nat) + 1 = 3)' > $D/broken.jsonl"
sc tooling-change pass - yes gate "A comment in a script: lint + tooling tests run." 'sed -i "" -e "s/Shared helpers for the CI gates/Shared helpers for the CI gates (touched by selftest)/" scripts/ci/_git.py'
# --- content lint coverage
sc sorry-proof pass - yes queue "sorry in a proof: advisory comment at the gate, ejection in the queue." "mkdir -p $D; rec sorry1 'proof=:= by sorry' > $D/sorry.jsonl"
sc allowed-option pass - yes queue "set_option on the allowlist in context." "mkdir -p $D; rec opt1 'context=set_option maxHeartbeats 400000 in' > $D/opt.jsonl"
sc forbidden-option fail data-rules/content-lint yes gate "set_option not on the allowlist." "mkdir -p $D; rec opt2 'context=set_option trace.Meta.synthInstance true in' > $D/badopt.jsonl"
sc native-decide fail data-rules/content-lint yes gate "native_decide in a proof." "mkdir -p $D; rec nd 'proof=:= by native_decide' > $D/nd.jsonl"
sc run-cmd fail data-rules/content-lint yes gate "run_cmd in context." "mkdir -p $D; rec rc 'context=run_cmd Lean.logInfo \"hi\"' > $D/rc.jsonl"
sc extern-attr fail data-rules/content-lint yes gate "@[extern] in context." "mkdir -p $D; rec ex 'context=@[extern \"c_fn\"] def cfn : Nat → Nat := id' > $D/ex.jsonl"
sc unsafe-def fail data-rules/content-lint yes gate "unsafe def in context." "mkdir -p $D; rec us 'context=unsafe def u : Nat := 1' > $D/us.jsonl"
sc import-in-context fail data-rules/content-lint yes gate "import inside a record." "mkdir -p $D; rec im 'context=import Mathlib' > $D/im.jsonl"
sc initialize-in-context fail data-rules/content-lint yes gate "initialize in context." "mkdir -p $D; rec ini 'context=initialize foo : IO.Ref Nat ← IO.mkRef 0' > $D/ini.jsonl"
sc axiom-in-context fail data-rules/content-lint yes gate "axiom in context." "mkdir -p $D; rec ax 'context=axiom myAx : False' > $D/ax.jsonl"
sc io-process fail data-rules/content-lint yes gate "IO.Process in context." "mkdir -p $D; rec iop 'context=def p := IO.Process.run { cmd := \"ls\" }' > $D/iop.jsonl"
# --- record validation coverage
sc duplicate-in-pr fail data-rules/records yes gate "Two records with the same name." "mkdir -p $D; { rec dup; rec dup; } > $D/dup.jsonl"
sc duplicate-vs-trusted fail data-rules/records yes gate "Name already trusted ($TRUSTED_NAME)." "mkdir -p $D; rec x name=$TRUSTED_NAME > $D/duptr.jsonl"
sc missing-field fail data-rules/records yes gate "Record without a statement." "mkdir -p $D; rec mf statement=@del > $D/mf.jsonl"
sc malformed-json fail data-rules/records yes gate "A line that is not JSON." "mkdir -p $D; echo '{not json' > $D/mj.jsonl"
sc library-mismatch fail data-rules/records yes gate "library field disagrees with the file's library." "mkdir -p $D; rec lm library=mathlib > $D/lm.jsonl"
sc missing-source-path fail data-rules/records yes gate "Corpus library record without source_path (would never compile)." "mkdir -p $D; rec msp source_path=@del > $D/msp.jsonl"
sc name-with-space fail data-rules/records yes gate "Exploratory: a name containing a space." "mkdir -p $D; rec nws 'name=Selftest.has space' > $D/nws.jsonl"
sc tentative-append pass - yes gate "A tentative record (data/tentative)." "mkdir -p data/tentative/equational-theories; rec tent status=tentative > data/tentative/equational-theories/t.jsonl"
sc two-libraries pass - yes queue "Records for two libraries; mathlib has no corpus (data only)." "mkdir -p $D data/staging/mathlib; rec twoA > $D/twoA.jsonl; rec twoB library=mathlib source_url=https://github.com/leanprover-community/mathlib4/blob/x/Mathlib/Foo.lean source_path=@del context=@del > data/staging/mathlib/twoB.jsonl"
sc bigger-append pass - yes queue "300 records in one file, one source path." "mkdir -p $D; for i in \$(seq 1 300); do rec big\$i; done > $D/big.jsonl"
# --- tombstones
sc tombstone-valid pass - yes gate "Tombstone for a trusted name." "printf '%s\n' '{\"tombstone\": \"$TRUSTED_NAME\", \"reason\": \"selftest\", \"by\": \"selftest\", \"at\": \"2026-09-15T00:00:00Z\"}' >> data/trusted/equational-theories.jsonl"
sc tombstone-missing-target fail data-rules/records yes gate "Tombstone for a name that does not exist." "printf '%s\n' '{\"tombstone\": \"Nope.nope\", \"reason\": \"selftest\", \"by\": \"selftest\", \"at\": \"2026-09-15T00:00:00Z\"}' >> data/trusted/equational-theories.jsonl"
sc tombstone-plus-content fail classify yes gate "Tombstone and a staging record in one PR." "mkdir -p $D; rec tpc > $D/tpc.jsonl; printf '%s\n' '{\"tombstone\": \"$TRUSTED_NAME\", \"reason\": \"selftest\", \"by\": \"selftest\", \"at\": \"2026-09-15T00:00:00Z\"}' >> data/trusted/equational-theories.jsonl"
# --- append-only edge cases
sc edit-line-in-staging fail data-rules/append-only yes gate "One byte changed inside an existing staging line." "sed -i '' -e '1s/\"name\": \"/\"name\": \"X/' $STAGING_FLAT"
sc reorder-lines fail data-rules/append-only yes gate "First two staging lines swapped." "python3 -c \"p='$STAGING_FLAT'; l=open(p).read().split('\\n'); l[0],l[1]=l[1],l[0]; open(p,'w').write('\\n'.join(l))\""
sc whitespace-change fail data-rules/append-only yes gate "Trailing space added to an existing line." "sed -i '' -e '1s/\$/ /' $STAGING_FLAT"
sc rename-data-file fail data-rules/append-only yes gate "Staging file renamed." "git mv $STAGING_FLAT data/staging/equational-theories-old.jsonl"
sc crlf-append pass - yes gate "Exploratory: appended record line ends in CRLF." "mkdir -p $D; rec crlf | sed 's/\$/\r/' > $D/crlf.jsonl"
# --- derived / classes
sc stats-json-edit fail classify yes gate "Hand edit of data/stats.json." "python3 -c \"import json;p='data/stats.json';d=json.load(open(p));d['selftest']=1;json.dump(d,open(p,'w'))\""
sc all-lean-edit fail classify yes gate "Hand edit of Tengoku/All.lean." "echo '-- hand edit' >> Tengoku/All.lean"
sc workflow-in-content fail classify yes gate "A record and a workflow change together." "mkdir -p $D; rec wic > $D/wic.jsonl; echo '# touched' >> .github/workflows/pr-gate.yml"
sc docs-only pass - yes gate "README only." "echo '' >> README.md; echo 'selftest docs line' >> README.md"
sc docs-plus-content pass - yes gate "README and a record: docs may ride along." "mkdir -p $D; rec dpc > $D/dpc.jsonl; echo 'selftest docs line' >> README.md"
sc binary-in-docs pass - yes gate "Exploratory: a PNG under docs/." "mkdir -p docs; printf '\x89PNG\r\n\x1a\n' > docs/selftest.png; head -c 200 /dev/urandom >> docs/selftest.png"
sc seeded-module-unsafe pass - yes queue "unsafe def added to a seeded module: tooling class at the gate (no lint), the queue's lint must catch it." "printf '\nunsafe def selftestUnsafe : Nat := 1\n' >> Tengoku/Logic/Basic.lean"
sc promotion-not-bot fail classify yes gate "Promotion-shaped PR by a non-bot actor." "mkdir -p $D; python3 - <<'PY'
import json
recs=[json.loads(l) for l in open('data/staging/equational-theories.jsonl') if l.strip()][:1]
with open('data/trusted/equational-theories.jsonl','a') as f:
    for r in recs: f.write(json.dumps({**r,'status':'trusted','promoted_at':'2026-09-15T00:00:00Z'})+'\n')
PY
echo '-- regenerated' >> Tengoku/EquationalTheories/Completeness.lean"
# --- tooling coverage
sc actionlint-error fail tooling-tests yes gate "Untrusted input interpolated into a run: step (actionlint)." "printf '\n      - run: echo \"\${{ github.event.pull_request.title }}\"\n' >> .github/workflows/pr-gate.yml"
sc ruff-error fail lint-python yes gate "Unused import in a gate script." "sed -i '' -e '1a\\
import os as _selftest_unused' scripts/ci/dco.py"
sc failing-unit-test fail tooling-tests yes gate "A failing unittest in the tooling suite." "printf '\n\nclass SelftestFails(unittest.TestCase):\n    def test_fails(self):\n        self.assertEqual(1, 2)\n' >> scripts/ci/tests/test_gates.py"
sc hook-removed pass - yes gate "Exploratory: removing a pre-commit hook is just a tooling change (CODEOWNERS is the control)." "python3 -c \"p='.pre-commit-config.yaml'; s=open(p).read(); i=s.index('  - repo: https://github.com/Yelp/detect-secrets'); j=s.index('  - repo:', i+10); open(p,'w').write(s[:i]+s[j:])\""
sc private-key fail secrets yes gate "Exploratory: an unparseable private key block (TruffleHog verified/unknown only)." "printf -- '-----BEGIN RSA PRIVATE KEY-----\nMIIEogIBAAKCAQEAselftestselftestselftestselftestselftestselftest\n-----END RSA PRIVATE KEY-----\n' > docs-key.txt"
sc github-token-shaped fail secrets yes gate "Exploratory: a GitHub token-shaped string that does not verify." "echo 'token = ghp_selftest0000000000000000000000000000' > docs-token.txt"
# --- depends
OPEN_PR=$(awk -F'\t' '$1=="two-purposes" {print $5; exit}' "$EXPECT")
sc depends-open fail depends yes gate "Depends-On an open PR (#$OPEN_PR)." "mkdir -p $D; rec depo > $D/depo.jsonl"
gh pr edit "$(awk -F'\t' '$1=="depends-open" {print $5; exit}' "$EXPECT")" -R "$REPO" --body "Depends-On: #$OPEN_PR" >/dev/null 2>&1
sc depends-merged pass - yes gate "Depends-On a merged PR (#2)." "mkdir -p $D; rec depm > $D/depm.jsonl"
gh pr edit "$(awk -F'\t' '$1=="depends-merged" {print $5; exit}' "$EXPECT")" -R "$REPO" --body "Depends-On: #2" >/dev/null 2>&1
# --- queue-only fixtures (gate should pass)
sc unknown-identifier pass - yes queue "Proof names something that does not exist." "mkdir -p $D; rec unk 'proof=:= selftest_no_such_lemma' > $D/unk.jsonl"
sc type-mismatch pass - yes queue "Proof of the wrong proposition." "mkdir -p $D; rec tm 'proof=:= (rfl : (2 : Nat) = 2)' > $D/tm.jsonl"
sc unsolved-goals pass - yes queue "Tactic block that proves nothing." "mkdir -p $D; rec ug 'proof=:= by\n  skip' > $D/ug.jsonl"
sc heartbeat-timeout pass - yes queue "maxHeartbeats too small for the proof." "mkdir -p $D; rec hb 'context=set_option maxHeartbeats 1 in' 'statement=theorem Selftest.hb : (2 ^ 64 : Nat) % 7 = 2' 'proof=:= by decide' > $D/hb.jsonl"
sc decide-native pass - yes queue "decide +native passes the lint but uses Lean.ofReduceBool: the axiom scan must eject it." "mkdir -p $D; rec dn 'proof=:= by decide +native' > $D/dn.jsonl"
sc clean-b pass - yes queue "Second clean record, different file." "mkdir -p $D; rec cleanB > $D/cleanB.jsonl"
sc clean-c pass - yes queue "Third clean record." "mkdir -p $D; rec cleanC > $D/cleanC.jsonl"
sc clean-d pass - yes queue "Fourth clean record." "mkdir -p $D; rec cleanD > $D/cleanD.jsonl"
sc clean-e pass - yes queue "Fifth clean record." "mkdir -p $D; rec cleanE > $D/cleanE.jsonl"
sc depends-chain-x pass - yes queue "Depends on clean-b; queued after it." "mkdir -p $D; rec chainX > $D/chainX.jsonl"
gh pr edit "$(awk -F'\t' '$1=="depends-chain-x" {print $5; exit}' "$EXPECT")" -R "$REPO" --body "Depends-On: #$(awk -F'\t' '$1=="clean-b" {print $5; exit}' "$EXPECT")" >/dev/null 2>&1
log "gate phase: $(wc -l < "$EXPECT") scenarios opened"
