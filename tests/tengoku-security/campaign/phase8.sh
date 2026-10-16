#!/bin/bash
source "$(dirname "$0")/lib.sh"
for i in $(seq 1 240); do grep -qE "^.{8} PHASE7_DONE$" "$LOG" && break; sleep 60; done
n=$(gh pr list -R "$REPO" --head tooling/actions-write --state all --json number -q '.[0].number')
for i in $(seq 1 80); do [ "$(gh pr view "$n" -R "$REPO" --json state -q .state)" = MERGED ] && break; sleep 30; done
log "phase8: actions-write PR #$n $(gh pr view "$n" -R "$REPO" --json state -q .state); guard run 4"
bash "$C/guard4.sh"
{ echo; echo "## Publish guard, runs 3 and 4"; echo; echo '```'; grep -E "guard[34]:" "$LOG"; echo '```'; } >> "$C/REPORT.md"
log "PHASE8_DONE"
