#!/bin/bash
# Phase 2: merge-queue scenarios. TENGOKU_BOT is set to the tester so promotion-class PRs are accepted.
source "$(dirname "$0")/lib.sh"
QR="$C/queue-results.tsv"; : > "$QR"
pr_of() { awk -F'\t' -v n="$1" '$1==n {print $5; exit}' "$EXPECT"; }
enqueue() { gh pr merge "$1" -R "$REPO" --squash --auto >/dev/null 2>&1; }
ejection() { gh api "repos/$REPO/issues/$1/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | last | .body' 2>/dev/null; }
LAST=""
# wait_pr N MAXMIN -> prints merged|ejected|timeout; the comment excerpt goes to $C/last-comment.txt (a subshell cannot set LAST)
wait_pr() {
  local n=$1 max=${2:-30} i st c
  : > "$C/last-comment.txt"
  for i in $(seq 1 $((max*2))); do
    st=$(gh pr view "$n" -R "$REPO" --json state -q .state 2>/dev/null)
    [ "$st" = MERGED ] && { echo merged; return; }
    c=$(ejection "$n"); if [ -n "$c" ] && [ "$c" != null ]; then echo "$c" | grep -vE '^\s*$' | sed -n '2,12p' | tr '\n' ' ' | cut -c1-400 > "$C/last-comment.txt"; echo ejected; return; fi
    sleep 30
  done
  echo timeout
}
last_comment() { LAST=$(cat "$C/last-comment.txt" 2>/dev/null); }
mg_failed_step() {  # newest merge-group run for pr N: failed step name (or -)
  local id; id=$(gh run list -R "$REPO" --workflow queue-gate.yml --event merge_group --limit 6 --json databaseId,headBranch -q ".[] | select(.headBranch | contains(\"pr-$1-\")) | .databaseId" | head -1)
  [ -n "$id" ] && gh run view "$id" -R "$REPO" --json jobs -q '[.jobs[].steps[] | select(.conclusion=="failure") | .name] | join(",")' 2>/dev/null || echo "-"
}
record() { printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$1" "$2" "$3" "$4" "$5" "$6" >> "$QR"; log "queue $1 (#$2): expected $3, got $4 | step: $5 | $6"; }
run_one() {  # name expect(merged|ejected) [expect-substring-in-comment]
  local name=$1 expect=$2 sub=${3:-} n got step
  n=$(pr_of "$name"); [ -n "$n" ] || { record "$name" "?" "$expect" "no-pr" "-" ""; return; }
  local t0=$(date +%s); enqueue "$n"; got=$(wait_pr "$n" 35); last_comment; local dt=$(( $(date +%s) - t0 ))
  step=$(mg_failed_step "$n")
  local v="OK"; [ "$got" != "$expect" ] && v="WRONG"; [ -n "$sub" ] && [ "$got" = ejected ] && ! echo "$LAST" | grep -qi -- "$sub" && v="WRONG-HINT"
  record "$name" "$n" "$expect" "$got ($v, ${dt}s)" "$step" "$LAST"
}
gh variable set TENGOKU_BOT --body "mikael-bashir" -R "$REPO" >/dev/null
log "=== queue phase 2a: ejection classes, one at a time"
run_one broken-proof ejected "decide"
run_one sorry-proof ejected "sorry"
run_one unknown-identifier ejected "unknown"
run_one type-mismatch ejected "type mismatch"
run_one unsolved-goals ejected "unsolved goals"
run_one heartbeat-timeout ejected "heartbeat"
run_one decide-native ejected "axiom"
run_one seeded-module-unsafe ejected "unsafe"
log "=== queue phase 2b: clean PRs queued together (groups, cumulative builds)"
t0=$(date +%s)
for s in clean-append clean-b clean-c clean-d clean-e allowed-option two-libraries bigger-append tentative-append tombstone-valid docs-only crlf-append; do n=$(pr_of $s); [ -n "$n" ] && enqueue "$n"; done
sleep 60; n=$(pr_of depends-chain-x)   # depends on clean-b: re-run its gate now that clean-b is queued, then enqueue
cd "$WORK" && git fetch -q origin selftest/depends-chain-x && git checkout -q -B selftest/depends-chain-x FETCH_HEAD && git commit -q -s --allow-empty -m "selftest: re-run the gate now that the dependency is queued" && git push -q -f origin selftest/depends-chain-x; git checkout -q -f main
for i in $(seq 1 20); do st=$(gh pr checks "$n" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state'); [ "$st" = SUCCESS ] && break; sleep 30; done; log "depends-chain-x gate after re-run: $st"; enqueue "$n"
for s in clean-append clean-b clean-c clean-d clean-e allowed-option two-libraries bigger-append tentative-append tombstone-valid docs-only crlf-append depends-chain-x; do
  n=$(pr_of $s); got=$(wait_pr "$n" 40); last_comment; step=$(mg_failed_step "$n"); v=OK; [ "$got" != merged ] && v=WRONG
  record "$s" "$n" merged "$got ($v)" "$step" "$LAST"
done
log "phase 2b took $(( $(date +%s) - t0 ))s"
log "=== queue phase 2c: a broken PR between two clean ones, queued in order"
cd "$WORK" && git fetch -q origin && git reset -q --hard origin/main
scenario clean-f pass - yes queue "Clean, queued first." "mkdir -p data/staging/equational-theories; rec cleanF > data/staging/equational-theories/cleanF.jsonl"
scenario bad-mid pass - yes queue "Broken, queued second." "mkdir -p data/staging/equational-theories; rec badMid 'proof=:= by\n  exact (by decide : (1 : Nat) + 1 = 3)' > data/staging/equational-theories/badMid.jsonl"
scenario clean-g pass - yes queue "Clean, queued third." "mkdir -p data/staging/equational-theories; rec cleanG > data/staging/equational-theories/cleanG.jsonl"
for s in clean-f bad-mid clean-g; do n=$(pr_of $s); for i in $(seq 1 20); do st=$(gh pr checks "$n" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state'); [ "$st" = SUCCESS ] && break; sleep 30; done; done
for s in clean-f bad-mid clean-g; do enqueue "$(pr_of $s)"; sleep 5; done
for s in clean-f bad-mid clean-g; do n=$(pr_of $s); exp=merged; [ $s = bad-mid ] && exp=ejected; got=$(wait_pr "$n" 40); last_comment; step=$(mg_failed_step "$n"); v=OK; [ "$got" != "$exp" ] && v=WRONG; record "$s" "$n" "$exp" "$got ($v)" "$step" "$LAST"; done
log "=== queue phase 2d: fix an ejected PR and re-queue"
n=$(pr_of unknown-identifier); cd "$WORK" && git fetch -q origin && git checkout -q -B selftest/unknown-identifier origin/selftest/unknown-identifier && python3 - <<'PY'
import json; p='data/staging/equational-theories/unk.jsonl'; r=json.loads(open(p).read()); r['proof']=':= rfl'; open(p,'w').write(json.dumps(r)+'\n')
PY
git commit -q -s -am "selftest: fix the proof" && git push -q -f origin selftest/unknown-identifier; git checkout -q -f main
for i in $(seq 1 20); do st=$(gh pr checks "$n" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state'); [ "$st" = SUCCESS ] && break; sleep 30; done
enqueue "$n"; got=$(wait_pr "$n" 35); last_comment; v=OK; [ "$got" != merged ] && v=WRONG; record "requeue-after-fix" "$n" merged "$got ($v)" "$(mg_failed_step "$n")" "$LAST"
log "=== queue phase 2e: promotion by the bot over every merged per-PR file; then a hand edit disguised as a promotion"
cd "$WORK" && git fetch -q origin && git reset -q --hard origin/main && git checkout -q -B promote/campaign origin/main && python3 - <<'PY'
import json, glob, datetime, os
now=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"); moved=0
for f in sorted(glob.glob('data/staging/equational-theories/*.jsonl')):
    recs=[json.loads(l) for l in open(f) if l.strip()]
    with open('data/trusted/equational-theories.jsonl','a') as t:
        for r in recs: t.write(json.dumps({**r,'status':'trusted','promoted_at':now}, ensure_ascii=False)+'\n'); moved+=1
    os.remove(f)
print('moved', moved)
PY
python3 scripts/generate.py --corpus corpora/equational-theories --libraries equational-theories >/dev/null 2>&1; git add -A . && git commit -q -s -m "Promote equational-theories: campaign records (expect promotion class + queue build)" && git push -q -f origin promote/campaign
gh pr create -R "$REPO" --head promote/campaign --title "promote: campaign records (expect merged)" --body "Bot-style promotion of every merged per-PR staging file." >/dev/null 2>&1
n=$(gh pr list -R "$REPO" --head promote/campaign --json number -q '.[0].number'); printf "promotion-campaign\tpass\t-\tqueue\t%s\tpromotion\n" "$n" >> "$EXPECT"
for i in $(seq 1 20); do st=$(gh pr checks "$n" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state'); [ "$st" = SUCCESS ] && break; [ "$st" = FAILURE ] && break; sleep 30; done
enqueue "$n"; got=$(wait_pr "$n" 40); last_comment; v=OK; [ "$got" != merged ] && v=WRONG; record "promotion-campaign" "$n" merged "$got ($v)" "$(mg_failed_step "$n")" "$LAST"
cd "$WORK" && git fetch -q origin && git reset -q --hard origin/main
scenario derived-edit-as-promotion pass - yes queue "Actor is the bot, so the gate accepts the hand edit; the queue's regeneration diff must eject it." 'f=$(ls Tengoku/EquationalTheories/*.lean | head -1); echo "-- hand edit" >> "$f"'
n=$(pr_of derived-edit-as-promotion); for i in $(seq 1 20); do st=$(gh pr checks "$n" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state'); [ "$st" = SUCCESS ] && break; [ "$st" = FAILURE ] && break; sleep 30; done
enqueue "$n"; got=$(wait_pr "$n" 35); last_comment; v=OK; [ "$got" != ejected ] && v=WRONG; record "derived-edit-as-promotion" "$n" ejected "$got ($v)" "$(mg_failed_step "$n")" "$LAST"
log "queue phase done"
