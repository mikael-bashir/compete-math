#!/bin/bash
# Round 2: after the fixes PR merged in the sandbox — re-run the scenarios the fixes address, plus corrected fixtures.
source "$(dirname "$0")/lib.sh"
EXPECT="$C/expect-round2.tsv"; : > "$EXPECT"
gh variable set TENGOKU_BOT --body "nobody-bot" -R "$REPO" >/dev/null
cd "$WORK" && git checkout -q -f main && git fetch -q origin && git reset -q --hard origin/main
D=data/staging/equational-theories
sc() { scenario "$@"; }
sc r2-fake-secret fail secrets yes gate "AWS example credential pair in a root file (must be the secrets job now, not lint-python)." 'printf "AWS_KEY=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n" > docs-secret.txt'
sc r2-secret-in-record fail secrets yes gate "AWS key inside a record's context (content class: only the secrets job can catch it)." "mkdir -p $D; rec sir 'context=-- aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' > $D/sir.jsonl"
sc r2-private-key fail secrets yes gate "Private key block." "printf -- '-----BEGIN RSA PRIVATE KEY-----\nMIIEogIBAAKCAQEAselftestselftestselftestselftestselftestselftest\n-----END RSA PRIVATE KEY-----\n' > docs-key.txt"
sc r2-github-token fail secrets yes gate "GitHub token-shaped string." "echo 'token = ghp_selftest0000000000000000000000000000' > docs-token.txt"
sc r2-name-with-space fail data-rules/records yes gate "Name with a space." "mkdir -p $D; rec nws2 'name=Selftest.has space' 'statement=theorem Selftest.has space : (1 : Nat) + 1 = 2' > $D/nws2.jsonl"
sc r2-name-with-comma fail data-rules/records yes gate "Name with a comma." "mkdir -p $D; rec nwc 'name=Selftest.a,b' 'statement=theorem Selftest.a,b : (1 : Nat) + 1 = 2' > $D/nwc.jsonl"
sc r2-name-not-declared fail data-rules/records yes gate "Statement declares a different name." "mkdir -p $D; rec nnd 'statement=theorem Selftest.other : (1 : Nat) + 1 = 2' > $D/nnd.jsonl"
sc r2-namespaced-name pass - yes gate "Name namespaced by context (statement declares only the last component)." "mkdir -p $D; rec nsn name=Selftest.Inner.nsn 'context=namespace Selftest.Inner' 'statement=theorem nsn : (1 : Nat) + 1 = 2' > $D/nsn.jsonl"
sc r2-failing-unit-test fail tooling-tests yes gate "A failing unittest must fail the job now." "printf '\n\nclass SelftestFails(unittest.TestCase):\n    def test_fails(self):\n        self.assertEqual(1, 2)\n' >> scripts/ci/tests/test_gates.py"
sc r2-depends-merged pass - yes gate "Depends-On a merged PR (#2)." "mkdir -p $D; rec depm2 > $D/depm2.jsonl"
gh pr edit "$(awk -F'\t' '$1=="r2-depends-merged" {print $5; exit}' "$EXPECT")" -R "$REPO" --body "Depends-On: #2" >/dev/null 2>&1
cd "$WORK" && git fetch -q origin selftest/r2-depends-merged && git checkout -q -B selftest/r2-depends-merged FETCH_HEAD && git commit -q -s --allow-empty -m "selftest: gate with the body" && git push -q -f origin selftest/r2-depends-merged; git checkout -q -f main
sc r2-type-mismatch pass - yes queue "A real type mismatch (3 = 3 is not 1 + 1 = 2); the queue must eject it." "mkdir -p $D; rec tm2 'proof=:= (rfl : (3 : Nat) = 3)' > $D/tm2.jsonl"
sc r2-clean pass - yes queue "Clean record after the fixes." "mkdir -p $D; rec r2clean > $D/r2clean.jsonl"
sc r2-decide-native pass - yes queue "decide +native again: the axiom scan must eject it now." "mkdir -p $D; rec dn2 'proof=:= by decide +native' > $D/dn2.jsonl"
log "round 2: $(wc -l < "$EXPECT") scenarios opened"
# report
for i in $(seq 1 40); do
  pending=0; : > "$C/round2-results.tsv"
  while IFS=$'\t' read -r name expect job phase n desc; do
    r=$(pr_gate_result "$n"); got=${r%%$'\t'*}; failed=${r#*$'\t'}
    [ "$got" = pending ] && pending=$((pending+1))
    if [ "$got" = pending ]; then v="…"; elif [ "$got" != "$expect" ]; then v="WRONG"; elif [ "$expect" = fail ] && [ "$job" != "-" ] && ! echo "$failed" | grep -q "$job"; then v="WRONG-JOB"; else v="OK"; fi
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$name" "$expect" "$job" "$got" "$failed" "$v" "$n" >> "$C/round2-results.tsv"
  done < "$EXPECT"
  [ "$pending" -eq 0 ] && break; sleep 60
done
awk -F'\t' '{printf "round2 %-22s %-5s %-24s %-7s %-9s #%s %s\n", $1, $2, $3, $4, $6, $7, substr($5,1,70)}' "$C/round2-results.tsv" | tee -a "$LOG"
log "round2 summary: $(awk -F'\t' '$6=="OK"' "$C/round2-results.tsv" | wc -l | tr -d ' ') OK of $(wc -l < "$EXPECT")"
# queue: the corrected type mismatch must eject, the clean one must merge (bot identity for promotions not needed here)
gh variable set TENGOKU_BOT --body "mikael-bashir" -R "$REPO" >/dev/null
for s in r2-type-mismatch r2-decide-native r2-clean; do n=$(awk -F'\t' -v x=$s '$1==x {print $5; exit}' "$EXPECT"); gh pr merge "$n" -R "$REPO" --squash --auto >/dev/null 2>&1; done
for s in r2-type-mismatch r2-decide-native r2-clean; do n=$(awk -F'\t' -v x=$s '$1==x {print $5; exit}' "$EXPECT"); exp=merged; { [ $s = r2-type-mismatch ] || [ $s = r2-decide-native ]; } && exp=ejected
  for i in $(seq 1 60); do st=$(gh pr view "$n" -R "$REPO" --json state -q .state); [ "$st" = MERGED ] && { got=merged; break; }; c=$(gh api "repos/$REPO/issues/$n/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | last | .body'); [ -n "$c" ] && [ "$c" != null ] && { got=ejected; LASTC=$(echo "$c" | grep -vE '^\s*$' | sed -n '2,8p' | tr '\n' ' ' | cut -c1-300); break; }; got=timeout; sleep 30; done
  v=OK; [ "$got" != "$exp" ] && v=WRONG; log "round2 queue $s (#$n): expected $exp, got $got ($v) | ${LASTC:-}"; LASTC=""
done
log "ROUND2_DONE"
