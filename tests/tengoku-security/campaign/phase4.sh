#!/bin/bash
source "$(dirname "$0")/lib.sh"
for i in $(seq 1 240); do grep -qE "^.{8} PHASE3_DONE$" "$LOG" && break; sleep 60; done
log "phase4: round 3 (secrets inside records)"
bash "$C/round3.sh"
{ echo; echo "## Round 3 (secrets inside records, after the data-scan ordering fix)"; echo; echo '```'; grep -E "round3 " "$LOG"; echo '```'; } >> "$C/REPORT.md"
log "PHASE4_DONE"
