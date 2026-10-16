#!/bin/bash
source "$(dirname "$0")/lib.sh"
log "campaign start; waiting for sync PR #31"
for i in $(seq 1 40); do [ "$(gh pr view 31 -R "$REPO" --json state -q .state)" = MERGED ] && break; sleep 60; done
log "sync PR #31: $(gh pr view 31 -R "$REPO" --json state -q .state)"
gh variable set TENGOKU_BOT --body "nobody-bot" -R "$REPO" >/dev/null; log "TENGOKU_BOT=nobody-bot for the gate phase"
bash "$C/gate.sh" 2>&1 | tee -a "$LOG" | tail -3
sleep 120
bash "$C/report.sh" 2>&1 | tee "$C/gate-report.txt" | tail -8
bash "$C/queue.sh" 2>&1 | tail -5
bash "$C/guard.sh" 2>&1 | tail -5
log "campaign done"
echo CAMPAIGN_DONE
