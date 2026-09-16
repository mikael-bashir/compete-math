#!/bin/bash
# Phase 5: a bad record reached trusted (before the axioms fix); tombstone it and regenerate its module through a
# promotion-class PR (bot identity), then show a clean content PR merges again.
source "$(dirname "$0")/lib.sh"
for i in $(seq 1 240); do grep -qE "^.{8} PHASE4_DONE$" "$LOG" && break; sleep 60; done
gh variable set TENGOKU_BOT --body "mikael-bashir" -R "$REPO" >/dev/null
cd "$WORK" && git checkout -q -f main && git fetch -q origin && git reset -q --hard origin/main && git checkout -q -B promote/tombstone-dn origin/main
printf '%s\n' '{"tombstone": "Selftest.dn", "reason": "decide +native slipped into trusted before the axioms step failed on findings", "by": "campaign", "at": "2026-09-16T00:00:00Z"}' >> data/trusted/equational-theories.jsonl
python3 scripts/generate.py --corpus corpora/equational-theories --libraries equational-theories >/dev/null 2>&1
git add -A . && git commit -q -s -m "Tombstone Selftest.dn and regenerate its module (expect promotion class, queue build, merge)" && git push -q -f origin promote/tombstone-dn
gh pr create -R "$REPO" --head promote/tombstone-dn --title "tombstone + regenerate: Selftest.dn (expect merged)" --body "A record that reached trusted before the axioms fix; the bot retracts it and regenerates the module." >/dev/null 2>&1
n=$(gh pr list -R "$REPO" --head promote/tombstone-dn --json number -q '.[0].number'); git checkout -q -f main
for i in $(seq 1 20); do st=$(gh pr checks "$n" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state'); case "$st" in SUCCESS|FAILURE) break;; esac; sleep 30; done
cls=$(gh pr checks "$n" -R "$REPO" 2>/dev/null | awk '{print $1":"$2}' | tr '\n' ' '); log "phase5: tombstone PR #$n gate $st | $cls"
gh pr merge "$n" -R "$REPO" --squash --auto >/dev/null 2>&1
for i in $(seq 1 80); do st=$(gh pr view "$n" -R "$REPO" --json state -q .state); [ "$st" = MERGED ] && break; c=$(gh api "repos/$REPO/issues/$n/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | length'); [ "$c" != 0 ] && { st=ejected; break; }; sleep 30; done
log "phase5: tombstone PR #$n → $st"
if [ "$st" = MERGED ]; then
  cd "$WORK" && git fetch -q origin && git reset -q --hard origin/main
  scenario r5-clean-after-tombstone pass - yes queue "Clean content PR after the poisoned record was retracted." "mkdir -p data/staging/equational-theories; rec r5clean > data/staging/equational-theories/r5clean.jsonl"
  m=$(awk -F'\t' '$1=="r5-clean-after-tombstone" {print $5; exit}' "$EXPECT")
  for i in $(seq 1 20); do st=$(gh pr checks "$m" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state'); case "$st" in SUCCESS|FAILURE) break;; esac; sleep 30; done
  gh pr merge "$m" -R "$REPO" --squash --auto >/dev/null 2>&1
  for i in $(seq 1 60); do st=$(gh pr view "$m" -R "$REPO" --json state -q .state); [ "$st" = MERGED ] && break; c=$(gh api "repos/$REPO/issues/$m/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | length'); [ "$c" != 0 ] && { st=ejected; break; }; sleep 30; done
  log "phase5: clean content PR #$m after the tombstone → $st"
fi
{ echo; echo "## Phase 5 (a bad record reached trusted: tombstone + regenerate, then a clean PR)"; echo; echo '```'; grep -E "phase5:" "$LOG"; echo '```'; } >> "$C/REPORT.md"
log "PHASE5_DONE"
