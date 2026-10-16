#!/bin/bash
# Phase 7: with tombstones implemented, regenerate the module (promotion-class PR) and re-queue the clean PR that was ejected.
source "$(dirname "$0")/lib.sh"
for i in $(seq 1 240); do grep -qE "^.{8} PHASE6_DONE$" "$LOG" && break; sleep 60; done
n=$(gh pr list -R "$REPO" --head tooling/tombstones --state all --json number -q '.[0].number')
for i in $(seq 1 80); do [ "$(gh pr view "$n" -R "$REPO" --json state -q .state)" = MERGED ] && break; sleep 30; done
log "phase7: tombstone-implementation PR #$n $(gh pr view "$n" -R "$REPO" --json state -q .state)"
gh variable set TENGOKU_BOT --body "mikael-bashir" -R "$REPO" >/dev/null
cd "$WORK" && git checkout -q -f main && git fetch -q origin && git reset -q --hard origin/main && git checkout -q -B promote/apply-tombstone origin/main
python3 scripts/generate.py --corpus corpora/equational-theories --libraries equational-theories >/dev/null 2>&1
git add -A . && git status --short | head -3
if git diff --cached --quiet; then log "phase7: regeneration changed nothing (unexpected)"; else
  git commit -q -s -m "Regenerate after the Selftest.dn tombstone (expect promotion class, merge)" && git push -q -f origin promote/apply-tombstone
  gh pr create -R "$REPO" --head promote/apply-tombstone --title "regenerate after the tombstone (expect merged)" --body "The generator now honours the retraction." >/dev/null 2>&1
  m=$(gh pr list -R "$REPO" --head promote/apply-tombstone --json number -q '.[0].number'); git checkout -q -f main
  for i in $(seq 1 20); do st=$(gh pr checks "$m" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state'); case "$st" in SUCCESS|FAILURE) break;; esac; sleep 30; done
  log "phase7: regeneration PR #$m gate $st | $(gh pr checks "$m" -R "$REPO" 2>/dev/null | awk '{print $1":"$2}' | tr '\n' ' ')"
  gh pr merge "$m" -R "$REPO" --squash --auto >/dev/null 2>&1
  for i in $(seq 1 80); do st=$(gh pr view "$m" -R "$REPO" --json state -q .state); [ "$st" = MERGED ] && break; c=$(gh api "repos/$REPO/issues/$m/comments" -q '[.[] | select(.body | test("Removed from the merge queue"))] | length'); [ "$c" != 0 ] && { st=ejected; break; }; sleep 30; done
  log "phase7: regeneration PR #$m → $st"
fi
# re-queue the clean PR that was ejected on the retracted record (#129): rebase it on main first so its gate re-runs
cd "$WORK" && git fetch -q origin selftest/r5-clean-after-tombstone && git checkout -q -B selftest/r5-clean-after-tombstone FETCH_HEAD && git rebase -q origin/main 2>/dev/null || { git rebase --abort 2>/dev/null; git reset -q --hard origin/main; mkdir -p data/staging/equational-theories; rec r5clean > data/staging/equational-theories/r5clean.jsonl; git add -A .; git commit -q -s -m "selftest: clean after the tombstone (rebased)"; }
git push -q -f origin selftest/r5-clean-after-tombstone; git checkout -q -f main
k=$(gh pr list -R "$REPO" --head selftest/r5-clean-after-tombstone --json number -q '.[0].number')
for i in $(seq 1 20); do st=$(gh pr checks "$k" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state'); case "$st" in SUCCESS|FAILURE) break;; esac; sleep 30; done
gh pr merge "$k" -R "$REPO" --squash --auto >/dev/null 2>&1
t0=$(date +%s); for i in $(seq 1 60); do st=$(gh pr view "$k" -R "$REPO" --json state -q .state); [ "$st" = MERGED ] && break; c=$(gh api "repos/$REPO/issues/$k/comments" -q "[.[] | select(.body | test(\"Removed from the merge queue\")) | .created_at] | map(select(. > \"$(date -u -r $t0 +%Y-%m-%dT%H:%M:%SZ)\")) | length"); [ "$c" != 0 ] && { st=ejected-again; break; }; sleep 30; done
log "phase7: clean PR #$k after the tombstone took effect → $st"
{ echo; echo "## Phase 7 (tombstones implemented: regenerate, then the clean PR)"; echo; echo '```'; grep -E "phase7:" "$LOG"; echo '```'; } >> "$C/REPORT.md"
log "PHASE7_DONE"
