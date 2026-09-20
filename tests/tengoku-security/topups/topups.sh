#!/bin/bash
# Top-up scenarios on competemath/tengoku-sandbox: every merge waits for its top-up; a failed publish ejects the PR
# and nothing else; orphans are never followed and are collected; the pointer only ever names commits on main.
set -u
REPO=competemath/tengoku-sandbox
WORK=~/tengoku-sandbox-work            # scenario clone (one writer)
DEV=~/tengoku-topup-dev                # used read-only here, for cache.sh topup-gc
C="${TOPUPS_OUT:-$HOME/.cache/tengoku-topups-soak}"; mkdir -p "$C"
LOG="$C/topups.log"; RES="$C/topups-results.tsv"; EXPECT="$C/topups-expect.tsv"; CONTROL="$C/soak.tsv.control"
RID="$(date -u +%d%H%M)"
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
result() { printf "%s\t%s\t%s\n" "$1" "$2" "$3" >> "$RES"; log "RESULT $1: $2 — $3"; }   # name  OK|WRONG  detail
rec() { python3 - "$@" <<'PY'
import json, sys
name = sys.argv[1]; proof = sys.argv[2] if len(sys.argv) > 2 else ":= rfl"
print(json.dumps({"name": f"Selftest.{name}", "statement": f"theorem Selftest.{name} : (1 : Nat) + 1 = 2", "proof": proof.replace("\\n", "\n"), "context": "set_option linter.all false",
  "source_path": "equational_theories/ForMathlib/Definability.lean", "status": "staging", "library": "equational-theories",
  "source_url": "https://github.com/teorth/equational_theories/blob/e218ce18b0c265efbbe65093c1f1d063c54f3639/equational_theories/ForMathlib/Definability.lean",
  "toolchain": "leanprover/lean4:v4.34.0-rc2"}, ensure_ascii=False))
PY
}
# open_pr BRANCH TITLE 'shell that edits the tree' -> PR number on stdout
open_pr() {
  local br=$1 title=$2 body=$3 n
  cd "$WORK" && git fetch -q origin && git checkout -q -B "$br" origin/main || return 1
  ( eval "$body" ) >/dev/null 2>&1 || { log "FIXTURE-ERROR $br: body failed"; git checkout -q -f main; return 1; }
  git add -A; git diff --cached --quiet && { log "FIXTURE-ERROR $br: no change"; git checkout -q -f main; return 1; }
  git commit -q -s -m "$title" && git push -q -f origin "$br" 2>/dev/null
  gh pr create -R "$REPO" --head "$br" --title "$title" --body "top-up scenario $RID" >/dev/null 2>&1
  n=$(gh pr list -R "$REPO" --head "$br" --state open --json number -q '.[0].number'); git checkout -q -f main
  echo "$n"
}
gate_ok() { local n=$1 i st; for i in $(seq 1 30); do st=$(gh pr checks "$n" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state' 2>/dev/null); [ "$st" = SUCCESS ] && return 0; [ "$st" = FAILURE ] && return 1; sleep 20; done; return 1; }
enqueue() { gh pr merge "$1" -R "$REPO" --squash --auto >/dev/null 2>&1; }
ejection() { gh api "repos/$REPO/issues/$1/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | last | .body' 2>/dev/null; }
wait_pr() {  # N MAXMIN [ignore-comments-before-count] -> merged|ejected|timeout
  local n=$1 max=${2:-30} seen=${3:-0} i st cnt
  for i in $(seq 1 $((max*3))); do
    st=$(gh pr view "$n" -R "$REPO" --json state -q .state 2>/dev/null); [ "$st" = MERGED ] && { echo merged; return; }
    cnt=$(gh api "repos/$REPO/issues/$n/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | length' 2>/dev/null || echo 0)
    [ "${cnt:-0}" -gt "$seen" ] && { echo ejected; return; }
    sleep 20
  done; echo timeout
}
merge_sha() { gh pr view "$1" -R "$REPO" --json mergeCommit -q .mergeCommit.oid; }
assets() { gh api "repos/$REPO/releases/tags/cache-topups" -q '.assets[].name' 2>/dev/null; }
pointer() { curl -fsSL "https://github.com/$REPO/releases/download/cache-latest/cache-latest.json?x=$RANDOM" 2>/dev/null; }
pointer_topup() { pointer | python3 -c 'import json,sys; print((json.load(sys.stdin).get("topup") or {}).get("commit",""))' 2>/dev/null; }
wait_pointer() { local sha=$1 i; for i in $(seq 1 30); do [ "$(pointer_topup)" = "$sha" ] && return 0; sleep 10; done; return 1; }
topup_files() { curl -fsSL "https://github.com/$REPO/releases/download/cache-topups/topup-$1.json" 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d["files"]), d["bytes"], " ".join(f for f in d["files"] if f.endswith(".olean"))[:300])' 2>/dev/null; }
# landed NAME PR -> checks the three merge invariants for a PR that merged
landed() {
  local name=$1 n=$2 sha; sha=$(merge_sha "$n")
  assets | grep -qx "topup-$sha.json" && assets | grep -qx "topup-$sha.tar.zst" || { result "$name" WRONG "merged as ${sha:0:12} but no top-up was published for it"; return 1; }
  if wait_pointer "$sha"; then result "$name" OK "merged ${sha:0:12}; top-up published before the merge; pointer named it; files: $(topup_files "$sha")"
  else local now; now=$(pointer_topup); cd "$WORK" && git fetch -q origin
    if git merge-base --is-ancestor "$sha" "$now" 2>/dev/null; then result "$name" OK "merged ${sha:0:12}; pointer already past it at ${now:0:12} (a later merge); files: $(topup_files "$sha")"
    else result "$name" WRONG "merged ${sha:0:12} but the pointer names ${now:0:12}"; fi
  fi
}
# Invariant monitor: the pointer's top-up commit must always be on main.
monitor() { while true; do c=$(pointer_topup); if [ -n "$c" ]; then ( cd "$WORK" && git fetch -q origin main 2>/dev/null; git merge-base --is-ancestor "$c" origin/main 2>/dev/null ) || echo "$(date -u +%H:%M:%S) VIOLATION pointer names $c which is not on main" >> "$C/violations.log"; echo "$(date -u +%H:%M:%S) $c" >> "$C/pointer-samples.log"; fi; sleep 20; done; }
promote_files() {  # promote_files BRANCH file... -> PR number
  local br=$1; shift
  open_pr "$br" "Promote equational-theories: top-up scenario $RID" "python3 - $* <<'PY'
import json, sys, datetime, os
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
for f in sys.argv[1:]:
    recs = [json.loads(l) for l in open(f) if l.strip()]
    with open('data/trusted/equational-theories.jsonl', 'a') as t:
        for r in recs: t.write(json.dumps({**r, 'status': 'trusted', 'promoted_at': now}, ensure_ascii=False) + '\n')
    os.remove(f)
PY
python3 scripts/generate.py --corpus corpora/equational-theories --libraries equational-theories"
}

: > "$RES"; : > "$C/violations.log"; : > "$C/pointer-samples.log"; : > "$CONTROL"
gh variable set TENGOKU_BOT -R "$REPO" -b mikael-bashir >/dev/null; gh variable delete TOPUP_TEST_FAIL -R "$REPO" >/dev/null 2>&1
monitor & MON=$!; trap 'kill $MON 2>/dev/null' EXIT
ST=data/staging/equational-theories

log "=== P1 content merge: waits for its (empty) top-up"
A=$(open_pr "topup/$RID-a" "top-up scenario: two staging records" "mkdir -p $ST; { rec tuA1x$RID; rec tuA2x$RID; } > $ST/tuA$RID.jsonl")
gate_ok "$A" && enqueue "$A"; got=$(wait_pr "$A" 25); [ "$got" = merged ] && landed P1-content "$A" || result P1-content WRONG "PR #$A $got"

log "=== P2 promotion merge: the top-up carries the rebuilt modules; the services can use the new lemma"
P=$(promote_files "topup/$RID-promote1" "$ST/tuA$RID.jsonl")
gate_ok "$P" && enqueue "$P"; got=$(wait_pr "$P" 30)
if [ "$got" = merged ]; then landed P2-promotion "$P"; echo "Selftest.tuA1x$RID" > "$CONTROL"; log "control lemma set: Selftest.tuA1x$RID"
  for i in $(seq 1 60); do grep -q "verify-new:Selftest.tuA1x$RID	ok" "$C/soak.tsv" 2>/dev/null && break; sleep 20; done
  if grep -q "verify-new:Selftest.tuA1x$RID	ok" "$C/soak.tsv"; then result P2-service-sees-lemma OK "Leak IV verified a script that uses Selftest.tuA1x$RID at $(grep "verify-new:Selftest.tuA1x$RID	ok" "$C/soak.tsv" | head -1 | cut -f1) (merge landed $(gh pr view "$P" -R "$REPO" --json mergedAt -q .mergedAt))"
  else result P2-service-sees-lemma WRONG "no successful verify of the new lemma within 20 min"; fi
else result P2-promotion WRONG "PR #$P $got"; fi

log "=== P3 injected publish failure: that PR is ejected, the one behind it merges, the orphan is never followed and is collected"
B=$(open_pr "topup/$RID-b" "top-up scenario: publish will be made to fail" "mkdir -p $ST; rec tuBx$RID > $ST/tuB$RID.jsonl")
Cn=$(open_pr "topup/$RID-c" "top-up scenario: queued behind the failing publish" "mkdir -p $ST; rec tuCx$RID > $ST/tuC$RID.jsonl")
gate_ok "$B"; gate_ok "$Cn"; gh variable set TOPUP_TEST_FAIL -R "$REPO" -b "$B" >/dev/null
enqueue "$B"; sleep 8; enqueue "$Cn"
gb=$(wait_pr "$B" 30); gc=$(wait_pr "$Cn" 40)
cm=$(ejection "$B" | head -c 160)
[ "$gb" = ejected ] && echo "$cm" | grep -q "not because of your change" && result P3-failed-publish-ejects OK "#$B ejected with the infrastructure comment" || result P3-failed-publish-ejects WRONG "#$B $gb | $cm"
[ "$gc" = merged ] && landed P3-queue-continues "$Cn" || result P3-queue-continues WRONG "#$Cn $gc"
cd "$WORK" && git fetch -q origin main
orph=""; for a in $(assets | sed -nE 's/^topup-([0-9a-f]{40})\.json$/\1/p'); do git merge-base --is-ancestor "$a" origin/main 2>/dev/null || orph="$orph $a"; done
log "orphans (published, never reached main):$orph"
bad=0; for o in $orph; do grep -q " $o\$" "$C/pointer-samples.log" && bad=1; done
[ -n "$orph" ] && [ "$bad" = 0 ] && result P3-orphan-never-followed OK "orphan(s)${orph:0:14}… published by the group that contained the ejected PR; the pointer never named one" || result P3-orphan-never-followed "$([ -z "$orph" ] && echo NOTE || echo WRONG)" "orphans:'$orph' followed=$bad"
gh variable delete TOPUP_TEST_FAIL -R "$REPO" >/dev/null 2>&1
( cd "$DEV" && git fetch -q origin main && TENGOKU_REPO=$REPO TENGOKU_TOPUP_GRACE_S=0 scripts/cache.sh topup-gc ) 2>&1 | tee -a "$LOG"
left=""; for o in $orph; do assets | grep -q "topup-$o" && left="$left $o"; done
[ -z "$left" ] && result P3-orphan-collected OK "after collection no orphan asset remains; the top-up in force is still $(pointer_topup | cut -c1-12)" || result P3-orphan-collected WRONG "still there:$left"
seen=$(gh api "repos/$REPO/issues/$B/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | length'); enqueue "$B"; gb=$(wait_pr "$B" 30 "$seen")
[ "$gb" = merged ] && landed P3-requeue-after-infrastructure-failure "$B" || result P3-requeue-after-infrastructure-failure WRONG "#$B $gb"

log "=== P4 a broken PR between two clean ones"
D=$(open_pr "topup/$RID-d" "top-up scenario: clean, first" "mkdir -p $ST; rec tuDx$RID > $ST/tuD$RID.jsonl")
E=$(open_pr "topup/$RID-e" "top-up scenario: broken, second" "mkdir -p $ST; rec tuEx$RID ':= by\n  exact (by decide : (1 : Nat) + 1 = 3)' > $ST/tuE$RID.jsonl")
F=$(open_pr "topup/$RID-f" "top-up scenario: clean, third" "mkdir -p $ST; rec tuFx$RID > $ST/tuF$RID.jsonl")
for n in $D $E $F; do gate_ok "$n"; done; for n in $D $E $F; do enqueue "$n"; sleep 6; done
gd=$(wait_pr "$D" 30); ge=$(wait_pr "$E" 30); gf=$(wait_pr "$F" 45)
[ "$gd" = merged ] && landed P4-clean-first "$D" || result P4-clean-first WRONG "#$D $gd"
[ "$ge" = ejected ] && result P4-broken-ejected OK "#$E ejected: $(ejection "$E" | grep -vE '^\s*$' | sed -n '2,4p' | tr '\n' ' ' | cut -c1-160)" || result P4-broken-ejected WRONG "#$E $ge"
[ "$gf" = merged ] && landed P4-clean-third "$F" || result P4-clean-third WRONG "#$F $gf"

log "=== P5 a burst of four clean PRs"
burst=""; for k in g h i j; do n=$(open_pr "topup/$RID-$k" "top-up scenario: burst $k" "mkdir -p $ST; rec tu${k}x$RID > $ST/tu$k$RID.jsonl"); burst="$burst $n"; done
for n in $burst; do gate_ok "$n"; done; for n in $burst; do enqueue "$n"; done
for n in $burst; do g=$(wait_pr "$n" 45); [ "$g" = merged ] && landed "P5-burst-#$n" "$n" || result "P5-burst-#$n" WRONG "$g"; done

log "=== P6 second promotion (everything staged above) — the noise the services must ride out"
cd "$WORK" && git fetch -q origin && git checkout -q -f main && git reset -q --hard origin/main
files=$(ls $ST/tu*$RID.jsonl 2>/dev/null | grep -v "tuE$RID" | tr '\n' ' ')
P2=$(promote_files "topup/$RID-promote2" $files)
gate_ok "$P2" && enqueue "$P2"; got=$(wait_pr "$P2" 30)
if [ "$got" = merged ]; then landed P6-promotion-2 "$P2"; echo "Selftest.tuFx$RID" > "$CONTROL"
  for i in $(seq 1 60); do grep -q "verify-new:Selftest.tuFx$RID	ok" "$C/soak.tsv" 2>/dev/null && break; sleep 20; done
  grep -q "verify-new:Selftest.tuFx$RID	ok" "$C/soak.tsv" && result P6-service-sees-lemma OK "Leak IV verified a script that uses Selftest.tuFx$RID at $(grep "verify-new:Selftest.tuFx$RID	ok" "$C/soak.tsv" | head -1 | cut -f1) (merge landed $(gh pr view "$P2" -R "$REPO" --json mergedAt -q .mergedAt))" || result P6-service-sees-lemma WRONG "not verified within 20 min"
else result P6-promotion-2 WRONG "PR #$P2 $got"; fi

v=$(wc -l < "$C/violations.log" | tr -d ' '); s=$(wc -l < "$C/pointer-samples.log" | tr -d ' ')
[ "$v" = 0 ] && result INVARIANT-pointer-only-names-main OK "$s pointer samples, none named a commit that is not on main" || result INVARIANT-pointer-only-names-main WRONG "$v violations of $s samples"
log "TOPUPS_PHASE_A_DONE"
