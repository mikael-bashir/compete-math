#!/bin/bash
# Phase B: the nightly cache rolls over under traffic; a tampered top-up is served to the services.
source "$(dirname "$0")/lib-topups.sh"
RES="$C/topups-b-results.tsv"; : > "$RES"
ST=data/staging/equational-theories
HOSTS="barkingtree-leak-iv.hf.space barkingtree-leak-ii.hf.space barkingtree-leak-i.hf.space"
pinned() { curl -sS -m 40 "https://$1/refresh" 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("pinned",""), d.get("kept",0), d.get("refreshing"), d.get("queued"))' 2>/dev/null; }
post_all() { for h in $HOSTS; do echo "$h: $(curl -sS -m 40 -X POST "https://$h/refresh" 2>/dev/null | head -c 160)" | tee -a "$LOG"; done; }
# wait_services SHA MAXMIN -> 0 when all three are pinned to SHA
wait_services() { local sha=$1 max=$2 i h ok; for i in $(seq 1 $((max*3))); do ok=1; for h in $HOSTS; do [ "$(pinned "$h" | cut -d' ' -f1)" = "$sha" ] || ok=0; done; [ $ok = 1 ] && return 0; sleep 20; done; return 1; }
fails_since() { awk -F'\t' -v t="$1" '$1>=t && $4!="ok" && $3!="status"' "$C/soak.tsv" | wc -l | tr -d ' '; }
monitor & MON=$!; trap 'kill $MON 2>/dev/null' EXIT

log "=== P7 the nightly cache rolls over while merges land"
T0=$(pointer | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag"])'); t_start=$(date -u +%H:%M:%S)
K=$(open_pr "topup/$RID-k" "top-up scenario: lands while the cache build runs" "mkdir -p $ST; rec tuKx$RID > $ST/tuK$RID.jsonl"); gate_ok "$K"
gh workflow run build.yml -R "$REPO" --ref main >/dev/null; sleep 90; enqueue "$K"
gk=$(wait_pr "$K" 30); [ "$gk" = merged ] && landed P7-merge-during-cache-build "$K" || result P7-merge-during-cache-build WRONG "#$K $gk"
for i in $(seq 1 60); do T1=$(pointer | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag"])'); [ "$T1" != "$T0" ] && break; sleep 20; done
ksha=$(merge_sha "$K"); now=$(pointer_topup); ptr=$(pointer | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["tag"], d["commit"][:12], (d.get("topup") or {}).get("commit","")[:12], (d.get("topup") or {}).get("base_tag"))')
if [ "$T1" != "$T0" ] && [ "$now" = "$ksha" ]; then result P7-rollover-keeps-the-topup-ahead OK "cache $T0 → $T1; pointer: $ptr (the top-up for the merge that landed during the build survived the rollover)"
else result P7-rollover-keeps-the-topup-ahead WRONG "T0=$T0 T1=$T1 pointer: $ptr expected top-up ${ksha:0:12}"; fi
post_all; if wait_services "$ksha" 25; then result P7-services-rebase OK "all three services re-based onto $T1 and sit on ${ksha:0:12}; failed calls since $t_start: $(fails_since "$t_start")"; else result P7-services-rebase WRONG "after 25 min: $(for h in $HOSTS; do echo "$h=$(pinned $h)"; done | tr '\n' ' ')"; fi
L=$(open_pr "topup/$RID-l" "top-up scenario: first merge over the new cache" "mkdir -p $ST; rec tuLx$RID > $ST/tuL$RID.jsonl"); gate_ok "$L"; enqueue "$L"
gl=$(wait_pr "$L" 30); [ "$gl" = merged ] && landed P7-first-merge-over-new-cache "$L" || result P7-first-merge-over-new-cache WRONG "#$L $gl"

log "=== P8 a tampered top-up is served: the services refuse it, keep serving what they had, and advance once the real one is back"
gh variable delete TENGOKU_SPACES -R "$REPO" >/dev/null 2>&1   # the services must not see the good asset first
cd "$WORK" && git fetch -q origin && git checkout -q -f main && git reset -q --hard origin/main
N=$(promote_files "topup/$RID-promote3" $ST/tuK$RID.jsonl $ST/tuL$RID.jsonl); gate_ok "$N"
before=$(for h in $HOSTS; do pinned "$h" | cut -d' ' -f1; done | sort -u | tr '\n' ' ')
enqueue "$N"; gn=$(wait_pr "$N" 30)
if [ "$gn" = merged ]; then nsha=$(merge_sha "$N"); wait_pointer "$nsha"; t_tamper=$(date -u +%H:%M:%S)
  mkdir -p "$C/good" && gh release download cache-topups -R "$REPO" -p "topup-$nsha.tar.zst" -D "$C/good" --clobber
  head -c 4096 /dev/urandom > "$C/topup-$nsha.tar.zst" && gh release upload cache-topups "$C/topup-$nsha.tar.zst" -R "$REPO" --clobber >/dev/null && log "tampered topup-$nsha.tar.zst (random bytes under the promoted name)"
  post_all; sleep 720; post_all; sleep 240
  after=$(for h in $HOSTS; do echo "$h=$(pinned "$h")"; done | tr '\n' ' '); onbad=0; for h in $HOSTS; do [ "$(pinned "$h" | cut -d' ' -f1)" = "$nsha" ] && onbad=1; done
  [ "$onbad" = 0 ] && result P8-tampered-topup-refused OK "no service moved to ${nsha:0:12}; before: $before| after: $after| failed calls since $t_tamper: $(fails_since "$t_tamper")" || result P8-tampered-topup-refused WRONG "a service pinned the commit of a tampered top-up: $after"
  gh release upload cache-topups "$C/good/topup-$nsha.tar.zst" -R "$REPO" --clobber >/dev/null && log "restored the genuine top-up"
  echo "Selftest.tuKx$RID" > "$C/soak.tsv.control"; post_all
  if wait_services "$nsha" 25; then result P8-services-advance-after-restore OK "all three on ${nsha:0:12}"; else result P8-services-advance-after-restore WRONG "$(for h in $HOSTS; do echo "$h=$(pinned $h)"; done | tr '\n' ' ')"; fi
  for i in $(seq 1 45); do grep -q "verify-new:Selftest.tuKx$RID	ok" "$C/soak.tsv" && break; sleep 20; done
  grep -q "verify-new:Selftest.tuKx$RID	ok" "$C/soak.tsv" && result P8-new-lemma-usable OK "Leak IV verified a script using Selftest.tuKx$RID" || result P8-new-lemma-usable WRONG "not verified within 15 min"
else result P8-promotion-3 WRONG "#$N $gn"; fi
gh variable set TENGOKU_SPACES -R "$REPO" -b "BarkingTree/Leak-I BarkingTree/Leak-II BarkingTree/Leak-IV" >/dev/null
log "=== P9 main is (pretend) broken: a group without Lean changes still merges, marked incomplete; a group with Lean changes is held responsible"
gh variable set TOPUP_TEST_BROKEN_MAIN -R "$REPO" -b 1 >/dev/null
before=$(pointer_topup)
Q=$(open_pr "topup/$RID-q" "top-up scenario: content while main is broken" "mkdir -p $ST; rec tuQx$RID > $ST/tuQ$RID.jsonl"); gate_ok "$Q"; enqueue "$Q"; gq=$(wait_pr "$Q" 30)
if [ "$gq" = merged ]; then qsha=$(merge_sha "$Q"); sleep 60
  if assets | grep -qx "topup-$qsha.incomplete" && [ "$(pointer_topup)" = "$before" ]; then result P9-content-merges-incomplete OK "merged ${qsha:0:12} with an incomplete marker; the pointer stayed on ${before:0:12}"
  else result P9-content-merges-incomplete WRONG "marker: $(assets | grep -c "topup-$qsha") pointer: $(pointer_topup | cut -c1-12) (was ${before:0:12})"; fi
else result P9-content-merges-incomplete WRONG "#$Q $gq"; fi
cd "$WORK" && git fetch -q origin && git checkout -q -f main && git reset -q --hard origin/main
R9=$(promote_files "topup/$RID-promote4" $ST/tuQ$RID.jsonl); gate_ok "$R9"; enqueue "$R9"; gr=$(wait_pr "$R9" 30)
[ "$gr" = ejected ] && result P9-lean-change-held-responsible OK "#$R9 ejected: $(ejection "$R9" | grep -vE '^\s*$' | sed -n '2,4p' | tr '\n' ' ' | cut -c1-160)" || result P9-lean-change-held-responsible WRONG "#$R9 $gr"
gh variable delete TOPUP_TEST_BROKEN_MAIN -R "$REPO" >/dev/null 2>&1
seen=$(gh api "repos/$REPO/issues/$R9/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | length'); enqueue "$R9"; gr=$(wait_pr "$R9" 30 "$seen")
[ "$gr" = merged ] && landed P9-recovers-once-main-builds "$R9" || result P9-recovers-once-main-builds WRONG "#$R9 $gr"
v=$(wc -l < "$C/violations.log" | tr -d ' '); [ "$v" = 0 ] && result INVARIANT-B-pointer-only-names-main OK "no violation" || result INVARIANT-B-pointer-only-names-main WRONG "$v violations"
log "TOPUPS_PHASE_B_DONE"
