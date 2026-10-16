#!/bin/bash
# Round 3: secrets inside records, after the data-scan ordering fix merged in the sandbox.
source "$(dirname "$0")/lib.sh"
EXPECT="$C/expect-round3.tsv"; : > "$EXPECT"
n=$(gh pr list -R "$REPO" --head tooling/secrets-data-scan --state all --json number -q '.[0].number')
for i in $(seq 1 60); do [ "$(gh pr view "$n" -R "$REPO" --json state -q .state)" = MERGED ] && break; sleep 30; done
log "round3: fix PR #$n $(gh pr view "$n" -R "$REPO" --json state -q .state)"
cd "$WORK" && git checkout -q -f main && git fetch -q origin && git reset -q --hard origin/main
D=data/staging/equational-theories
scenario r3-keyid-in-record fail secrets yes gate "AWS key id inside a record's context (content class)." "mkdir -p $D; rec kir 'context=-- AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE' > $D/kir.jsonl"
scenario r3-token-in-record fail secrets yes gate "GitHub token inside a record's proof comment (content class)." "mkdir -p $D; rec tir 'proof=:= rfl -- ghp_selftest0000000000000000000000000000' > $D/tir.jsonl"
scenario r3-secretkey-in-record fail secrets yes gate "Exploratory: bare AWS secret key value inside a JSON string (detect-secrets keyword rule needs plain key = value)." "mkdir -p $D; rec skr 'context=-- aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' > $D/skr.jsonl"
scenario r3-clean-content pass - yes gate "Clean content-only PR still passes the scan." "mkdir -p $D; rec r3clean > $D/r3clean.jsonl"
for i in $(seq 1 30); do
  pending=0; : > "$C/round3-results.tsv"
  while IFS=$'\t' read -r name expect job phase pr desc; do
    r=$(pr_gate_result "$pr"); got=${r%%$'\t'*}; failed=${r#*$'\t'}
    [ "$got" = pending ] && pending=$((pending+1))
    if [ "$got" = pending ]; then v="…"; elif [ "$got" != "$expect" ]; then v="WRONG"; elif [ "$expect" = fail ] && [ "$job" != "-" ] && ! echo "$failed" | grep -q "$job"; then v="WRONG-JOB"; else v="OK"; fi
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$name" "$expect" "$job" "$got" "$failed" "$v" "$pr" >> "$C/round3-results.tsv"
  done < "$EXPECT"
  [ "$pending" -eq 0 ] && break; sleep 60
done
awk -F'\t' '{printf "round3 %-24s %-5s %-10s %-7s %-9s #%s %s\n", $1, $2, $3, $4, $6, $7, substr($5,1,70)}' "$C/round3-results.tsv" | tee -a "$LOG"
log "ROUND3_DONE"
