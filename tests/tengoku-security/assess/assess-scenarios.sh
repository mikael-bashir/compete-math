#!/bin/bash
# Gate scenarios for the blind re-proof test, in real CI on the sandbox. Claims are full-length fixtures
# (make_claim.py) pinned to a sandbox main commit: the hosted services follow the LIBRARY, so a real claim's
# service commits are not on the sandbox's main (real claims are checked against the library's history instead).
set -u
REPO=competemath/tengoku-sandbox; WORK=~/tengoku-sandbox-work
C="$(cd "$(dirname "$0")" && pwd)"
LOG="$C/assess.log"; RES="$C/assess-results.tsv"; : > "$RES"; RID="$(date -u +%d%H%M)"
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
result() { printf "%s\t%s\t%s\n" "$1" "$2" "$3" >> "$RES"; log "RESULT $1: $2 — $3"; }
orig() { python3 - "$1" <<'PY'
import json, sys
n = sys.argv[1]
print(json.dumps({"name": f"Blind.{n}", "statement": f"theorem Blind.{n} : (1 : Nat) + 1 = 2", "proof": ":= rfl", "context": "set_option linter.all false", "status": "staging", "library": "competemath",
  "source_url": "https://competemath.com/practice/problems/9999", "toolchain": "leanprover/lean4:v4.34.0-rc2"}))
PY
}
EMAIL=$(git -C "$WORK" config user.email)
# scenario NAME EXPECT(pass|fail) EXPECT_TEXT 'shell that edits the tree'
scenario() {
  local name=$1 expect=$2 text=$3 body=$4 n st run job got note
  cd "$WORK" && git fetch -q origin && git checkout -q -B "assess/$RID-$name" origin/main || return 1
  PIN=$(git rev-parse origin/main); export PIN
  ( eval "$body" ) >/dev/null 2>>"$LOG" || { log "FIXTURE-ERROR $name"; git checkout -q -f main; return 1; }
  git add -A && git commit -q -s -m "assess scenario: $name" && git push -q -f origin "assess/$RID-$name" 2>/dev/null
  gh pr create -R "$REPO" --head "assess/$RID-$name" --title "assess scenario: $name (expect $expect)" --body "blind re-proof gate scenario $RID" >/dev/null 2>&1
  n=$(gh pr list -R "$REPO" --head "assess/$RID-$name" --state open --json number -q '.[0].number'); git checkout -q -f main
  for i in $(seq 1 40); do st=$(gh pr checks "$n" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state' 2>/dev/null); [ "$st" = SUCCESS ] || [ "$st" = FAILURE ] && break; sleep 20; done
  got=$([ "$st" = SUCCESS ] && echo pass || echo fail)
  job=$(gh pr checks "$n" -R "$REPO" --json name,state -q '[.[] | select(.state=="FAILURE" and .name!="pr-gate") | .name] | join(",")' 2>/dev/null)
  sleep 25; note=$(gh api "repos/$REPO/issues/$n/comments" -q '[.[] | select(.body | test("tengoku-gate-summary"))] | last | .body' 2>/dev/null | tr '\n' ' ' | cut -c1-1500)
  local v=OK; [ "$got" = "$expect" ] || v=WRONG; [ "$expect" = fail ] && [ "$job" != "assess" ] && v="WRONG-JOB($job)"
  [ -n "$text" ] && ! echo "$note" | grep -q -- "$text" && v="$v,COMMENT-LACKS:'$text'"
  result "$name" "$v" "#$n gate=$got failed-jobs=${job:--} | comment: $(echo "$note" | cut -c1-220)"
  echo "$n"
}
ST=data/staging/competemath; MK="python3 $C/make_claim.py"
scenario no-claim fail "carries no blind re-proof claim" "mkdir -p $ST; orig noClaim$RID > $ST/noClaim$RID.jsonl"
scenario all-closed fail "was re-proved from the existing library" "mkdir -p $ST; { orig closedA$RID; orig closedB$RID; } > $ST/closed$RID.jsonl; $MK . $ST/closed$RID.jsonl claims/closed$RID \$PIN $EMAIL closed closed"
scenario edited-log fail "does not match the digest" "mkdir -p $ST; orig edited$RID > $ST/edited$RID.jsonl; $MK . $ST/edited$RID.jsonl claims/edited$RID \$PIN $EMAIL resisted; sed -i '' 's/RESISTED/RESISTED (trust me)/' claims/edited$RID/1-Blind.edited$RID.working.md"
scenario thin-attempt fail "needs a full attempt" "mkdir -p $ST; orig thin$RID > $ST/thin$RID.jsonl; $MK . $ST/thin$RID.jsonl claims/thin$RID \$PIN $EMAIL resisted; python3 - <<PY
import sys, json
sys.path.insert(0, 'scripts/assess'); import common as C
from pathlib import Path
d = Path('claims/thin$RID'); c = json.loads((d / 'claim.json').read_text()); h = c['headlines'][0]
lines = C.read_transcript(d / h['transcript']); del lines[6:-1]; lines[-1].update(t=30.0, seconds=30.0)
rec = json.loads(Path('$ST/thin$RID.jsonl').read_text()); m = C.measure(lines, rec)
C.write_transcript(d / h['transcript'], lines); (d / h['working']).write_text(C.render_working(lines, rec))
h.update(seconds=m['seconds'], calls=m['calls'], transcript_sha256=C.sha256((d / h['transcript']).read_bytes()), working_sha256=C.sha256((d / h['working']).read_bytes()))
c['digest'] = C.digest(c); (d / 'claim.json').write_text(json.dumps(c, indent=2) + chr(10))
PY"
scenario translation-exempt pass "" "mkdir -p data/staging/equational-theories; python3 - > data/staging/equational-theories/tr$RID.jsonl <<PY
import json
print(json.dumps({'name': 'Selftest.tr$RID', 'statement': 'theorem Selftest.tr$RID : (1 : Nat) + 1 = 2', 'proof': ':= rfl', 'context': 'set_option linter.all false', 'source_path': 'equational_theories/ForMathlib/Definability.lean', 'status': 'staging', 'library': 'equational-theories', 'source_url': 'https://github.com/teorth/equational_theories/blob/e218ce18b0c265efbbe65093c1f1d063c54f3639/equational_theories/ForMathlib/Definability.lean', 'toolchain': 'leanprover/lean4:v4.34.0-rc2'}))
PY"
P=$(scenario one-resisted pass "" "mkdir -p $ST; { orig passA$RID; orig passB$RID; } > $ST/pass$RID.jsonl; $MK . $ST/pass$RID.jsonl claims/pass$RID \$PIN $EMAIL closed resisted" | tail -1)
log "queueing the passing PR #$P: the claim must travel through the merge queue too"
gh pr merge "$P" -R "$REPO" --squash --auto >/dev/null 2>&1
for i in $(seq 1 90); do s=$(gh pr view "$P" -R "$REPO" --json state -q .state); [ "$s" = MERGED ] && break; c=$(gh api "repos/$REPO/issues/$P/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | length'); [ "${c:-0}" -gt 0 ] && break; sleep 20; done
[ "$s" = MERGED ] && result one-resisted-merges OK "#$P merged through the queue with its claim" || result one-resisted-merges WRONG "#$P state=$s: $(gh api "repos/$REPO/issues/$P/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | last | .body' | tr '\n' ' ' | cut -c1-300)"
log "ASSESS_SCENARIOS_DONE"
