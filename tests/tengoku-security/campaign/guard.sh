#!/bin/bash
# Phase 3: publish guard end to end — a workflow file lands on main while a cache build runs.
source "$(dirname "$0")/lib.sh"
cd "$WORK" && git fetch -q origin && git reset -q --hard origin/main && git checkout -q -B tooling/guard-probe origin/main
printf '\n# campaign: workflow file changed during a cache build (publish guard test)\n' >> .github/workflows/queue-gate.yml
git commit -q -s -am "campaign: touch a workflow while a cache build runs" && git push -q -f origin tooling/guard-probe
gh pr create -R "$REPO" --head tooling/guard-probe --title "campaign: workflow touch during a build (expect pass)" --body "publish-guard test" >/dev/null 2>&1
n=$(gh pr list -R "$REPO" --head tooling/guard-probe --json number -q '.[0].number'); git checkout -q -f main
log "guard: dispatching a cache build, then merging workflow PR #$n while it runs"
gh workflow run build.yml -R "$REPO" --ref main >/dev/null 2>&1; sleep 30
run1=$(gh run list -R "$REPO" --workflow build.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh pr merge "$n" -R "$REPO" --squash --auto >/dev/null 2>&1
for i in $(seq 1 30); do [ "$(gh pr view "$n" -R "$REPO" --json state -q .state)" = MERGED ] && break; sleep 30; done
log "guard: PR #$n $(gh pr view "$n" -R "$REPO" --json state -q .state) at $(date -u +%H:%M:%S); build run $run1 $(gh run view "$run1" -R "$REPO" --json status -q .status)"
for i in $(seq 1 60); do [ "$(gh run view "$run1" -R "$REPO" --json status -q .status)" = completed ] && break; sleep 30; done
steps1=$(gh run view "$run1" -R "$REPO" --json jobs -q '.jobs[0].steps[] | select(.conclusion=="success" or .conclusion=="failure") | "\(.name)=\(.conclusion)"' | grep -E "workflow file|Publish|Attest|tip" | tr '\n' ' ')
log "guard: run1 $run1 → $(gh run view "$run1" -R "$REPO" --json conclusion -q .conclusion) | $steps1"
sleep 45; run2=$(gh run list -R "$REPO" --workflow build.yml --limit 1 --json databaseId -q '.[0].databaseId')
if [ "$run2" != "$run1" ]; then
  for i in $(seq 1 60); do [ "$(gh run view "$run2" -R "$REPO" --json status -q .status)" = completed ] && break; sleep 30; done
  steps2=$(gh run view "$run2" -R "$REPO" --json jobs -q '.jobs[0].steps[] | select(.conclusion=="success" or .conclusion=="failure") | "\(.name)=\(.conclusion)"' | grep -E "workflow file|Publish|Attest|tip" | tr '\n' ' ')
  log "guard: run2 $run2 (retried) → $(gh run view "$run2" -R "$REPO" --json conclusion -q .conclusion) | $steps2"
else log "guard: no relaunched run found"; fi
log "guard: releases now: $(gh release list -R "$REPO" | head -3 | awk '{print $3}' | tr '\n' ' ')"
