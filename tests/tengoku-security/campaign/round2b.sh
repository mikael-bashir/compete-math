#!/bin/bash
# Round 2, second half: report + queue (the PRs already exist).
source "$(dirname "$0")/lib.sh"
EXPECT="$C/expect-round2.tsv"
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
