#!/bin/bash
# Top-up scenarios on competemath/tengoku-sandbox: every merge waits for its top-up; a failed publish ejects the PR
# and nothing else; orphans are never followed and are collected; the pointer only ever names commits on main.
set -u
REPO=competemath/tengoku-sandbox
WORK=~/tengoku-sandbox-work            # scenario clone (one writer)
DEV=~/tengoku-topup-dev                # used read-only here, for cache.sh topup-gc
C="${TOPUPS_OUT:-$HOME/.cache/tengoku-topups-soak}"; mkdir -p "$C"
LOG="$C/topups.log"; RES="$C/topups-results.tsv"; EXPECT="$C/topups-expect.tsv"; CONTROL="$C/soak.tsv.control"
RID="${RID:-$(date -u +%d%H%M)}"
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

