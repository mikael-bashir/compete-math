#!/bin/bash
# Phase C: a top-up promoted for a commit AHEAD of the one the nightly is building must survive the nightly's publish.
source "$(dirname "$0")/lib-topups.sh"
RES="$C/topups-c-results.tsv"; : > "$RES"; ST=data/staging/equational-theories
for attempt in 1 2 3; do
  log "=== P10 (attempt $attempt) a merge lands, and is promoted, while the nightly build is still running"
  Z=$(open_pr "topup/$RID-z$attempt" "top-up scenario: promoted before the nightly publishes" "mkdir -p $ST; rec tuZ${attempt}x$RID > $ST/tuZ$attempt$RID.jsonl"); gate_ok "$Z"
  T0=$(pointer | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag"])')
  enqueue "$Z"; sleep 200
  gh workflow run build.yml -R "$REPO" --ref main >/dev/null; sleep 20
  bid=$(gh run list -R "$REPO" --workflow build.yml -L 1 --json databaseId -q '.[0].databaseId'); built=$(gh run view "$bid" -R "$REPO" --json headSha -q .headSha)
  gz=$(wait_pr "$Z" 30); [ "$gz" = merged ] || { result "P10-attempt-$attempt" WRONG "#$Z $gz"; continue; }
  zsha=$(merge_sha "$Z"); zmerged=$(gh pr view "$Z" -R "$REPO" --json mergedAt -q .mergedAt)
  for i in $(seq 1 60); do st=$(gh run view "$bid" -R "$REPO" --json status -q .status); [ "$st" = completed ] && break; sleep 20; done
  kept=$(gh run view "$bid" -R "$REPO" --log 2>/dev/null | grep -c "kept the promoted top-up for $zsha")
  ptr=$(pointer | python3 -c 'import json,sys; d=json.load(sys.stdin); t=d.get("topup") or {}; print(d["tag"], d["commit"][:12], t.get("commit","")[:12], t.get("promoted_at"), d.get("published_at"))')
  log "build $bid built ${built:0:12}; PR merged $zmerged as ${zsha:0:12}; kept-lines=$kept; pointer: $ptr"
  if [ "$built" = "$zsha" ]; then log "the merge landed before the build checked out — not the case under test; retrying"; continue; fi
  set -- $ptr
  if [ "$kept" -ge 1 ] && [ "$1" != "$T0" ] && [ "$3" = "${zsha:0:12}" ]; then result P10-put-keeps-the-topup-ahead OK "nightly built ${built:0:12} and published $1 AFTER ${zsha:0:12} had been promoted; put kept that top-up (log line present); pointer: $ptr"; break
  elif [ "$kept" = 0 ] && [ "$3" = "${zsha:0:12}" ]; then log "the pointer is right but put ran BEFORE the promotion (promote re-added it) — order not exercised; retrying"; continue
  else result P10-put-keeps-the-topup-ahead WRONG "kept=$kept pointer: $ptr (expected top-up ${zsha:0:12} on a new tag)"; break; fi
done
log "TOPUPS_PHASE_C_DONE"
