#!/bin/bash
# Gate report: poll until settled, then print expectation vs outcome with the failing job/step.
source "$(dirname "$0")/lib.sh"
for i in $(seq 1 90); do
  pending=0; : > "$C/gate-results.tsv"
  while IFS=$'\t' read -r name expect job phase n desc; do
    r=$(pr_gate_result "$n"); got=${r%%$'\t'*}; failed=${r#*$'\t'}
    [ "$got" = pending ] && pending=$((pending+1))
    if [ "$got" = pending ]; then v="…"; elif [ "$got" != "$expect" ]; then v="WRONG"; elif [ "$expect" = fail ] && [ "$job" != "-" ] && ! echo "$failed" | grep -q "$job"; then v="WRONG-JOB"; else v="OK"; fi
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$name" "$expect" "$job" "$got" "$failed" "$v" "$n" >> "$C/gate-results.tsv"
  done < "$EXPECT"
  [ "$pending" -eq 0 ] && break
  sleep 60
done
printf "%-24s %-6s %-30s %-6s %-8s %s\n" scenario expect expected-job got verdict "failed jobs/steps"
sort -k6 "$C/gate-results.tsv" | awk -F'\t' '{printf "%-24s %-6s %-30s %-6s %-8s #%s %s\n", $1, $2, $3, $4, $6, $7, $5}'
echo; echo "summary: $(awk -F'\t' '$6=="OK"' "$C/gate-results.tsv" | wc -l | tr -d ' ') OK, $(awk -F'\t' '$6=="WRONG"' "$C/gate-results.tsv" | wc -l | tr -d ' ') WRONG, $(awk -F'\t' '$6=="WRONG-JOB"' "$C/gate-results.tsv" | wc -l | tr -d ' ') WRONG-JOB, $(awk -F'\t' '$4=="pending"' "$C/gate-results.tsv" | wc -l | tr -d ' ') pending of $(wc -l < "$EXPECT")"
