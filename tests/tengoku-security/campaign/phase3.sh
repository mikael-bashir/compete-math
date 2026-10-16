#!/bin/bash
# After the queue phase: land the fixes in the sandbox through the queue, run round 2, the second guard run, and assemble the report.
source "$(dirname "$0")/lib.sh"
log "phase3: waiting for the queue phase marker"
for i in $(seq 1 240); do grep -qE "^QUEUE_PHASE_DONE$" "$LOG" && break; sleep 60; done
grep -qE "^QUEUE_PHASE_DONE$" "$LOG" || log "phase3: queue phase still running after 4 h; continuing anyway"
cd ~/tengoku-port && git push -q -f sandbox tooling/campaign-fixes-sb:tooling/campaign-fixes 2>/dev/null; log "phase3: fixes branch pushed ($(git log --oneline -1 tooling/campaign-fixes-sb | cut -c1-60))"
n=$(gh pr list -R "$REPO" --head tooling/campaign-fixes --state all --json number,state -q 'map(select(.state=="MERGED" or .state=="OPEN")) | .[0].number')
[ -n "$n" ] || { gh pr create -R "$REPO" --head tooling/campaign-fixes --title "campaign fixes (expect pass)" --body "Gaps found by the overnight campaign; see the ledger." >/dev/null 2>&1; n=$(gh pr list -R "$REPO" --head tooling/campaign-fixes --json number -q '.[0].number'); }
st=$(gh pr view "$n" -R "$REPO" --json state -q .state)
[ "$st" = MERGED ] || gh pr merge "$n" -R "$REPO" --squash --auto >/dev/null 2>&1
log "phase3: fixes PR #$n ($st) armed"
for i in $(seq 1 80); do st=$(gh pr view "$n" -R "$REPO" --json state -q .state); [ "$st" = MERGED ] && break; sleep 30; done
log "phase3: fixes PR #$n $st; checks: $(gh pr checks "$n" -R "$REPO" 2>/dev/null | awk '{print $1":"$2}' | tr '\n' ' ')"
if [ "$st" != MERGED ]; then log "phase3: fixes did not merge; round 2 would test the old code — stopping"; log "PHASE3_DONE"; exit 0; fi
bash "$C/round2.sh"
bash "$C/guard2.sh"
{
  echo "# Overnight campaign — competemath/tengoku-sandbox, $(date -u +%Y-%m-%d)"
  echo; echo "## Gate phase (66 PRs, TENGOKU_BOT=nobody-bot)"; echo; echo '```'; sed -n '/^scenario/,$p' "$C/gate-report.txt"; echo '```'
  echo; echo "## Queue phase"; echo; echo '```'; awk -F'\t' '{printf "%-26s #%-4s expected %-8s got %-22s step: %s\n  %s\n", $1, $2, $3, $4, $5, substr($6,1,300)}' "$C/queue-results.tsv"; echo '```'
  echo; echo "## Round 2 (after the fixes PR)"; echo; echo '```'; grep -E "^.{8} round2 |round2 summary|round2 queue" "$LOG"; echo '```'
  echo; echo "## Publish guard"; echo; echo '```'; grep -E "guard2?:" "$LOG"; echo '```'
} > "$C/REPORT.md"
log "PHASE3_DONE"
