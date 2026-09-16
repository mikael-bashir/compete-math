#!/bin/bash
source "$(dirname "$0")/lib.sh"
for i in $(seq 1 240); do grep -qE "^.{8} PHASE5_DONE$" "$LOG" && break; sleep 60; done
bash "$C/guard3.sh"
log "PHASE6_DONE"
