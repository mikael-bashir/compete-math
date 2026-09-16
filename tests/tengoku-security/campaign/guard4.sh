#!/bin/bash
# Publish guard, second attempt: the queue is idle, so the workflow PR lands a few minutes into the build.
source "$(dirname "$0")/lib.sh"
cd "$WORK" && git fetch -q origin && git reset -q --hard origin/main && git checkout -q -B tooling/guard-probe4 origin/main
printf '\n# campaign: second workflow touch during a cache build (publish guard test)\n' >> .github/workflows/queue-gate.yml
git commit -q -s -am "campaign: touch a workflow while a cache build runs (4)" && git push -q -f origin tooling/guard-probe4
gh pr create -R "$REPO" --head tooling/guard-probe4 --title "campaign: workflow touch during a build, take 4 (expect pass)" --body "publish-guard test" >/dev/null 2>&1
n=$(gh pr list -R "$REPO" --head tooling/guard-probe4 --json number -q '.[0].number'); git checkout -q -f main
for i in $(seq 1 20); do st=$(gh pr checks "$n" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state'); [ "$st" = SUCCESS ] && break; sleep 30; done
log "guard4: PR #$n gate $st; queueing the PR first, dispatching the build once its merge group is running"
gh pr merge "$n" -R "$REPO" --squash --auto >/dev/null 2>&1
for i in $(seq 1 40); do q=$(gh api graphql -f query="query{repository(owner:\"competemath\",name:\"tengoku-sandbox\"){pullRequest(number:$n){mergeQueueEntry{state}}}}" -q '.data.repository.pullRequest.mergeQueueEntry.state'); [ "$q" = AWAITING_CHECKS ] && break; sleep 15; done
log "guard4: PR #$n queue entry $q at $(date -u +%H:%M:%S); dispatching the build"
gh workflow run build.yml -R "$REPO" --ref main >/dev/null 2>&1; sleep 40
run1=$(gh run list -R "$REPO" --workflow build.yml --limit 1 --json databaseId -q '.[0].databaseId')
for i in $(seq 1 30); do [ "$(gh pr view "$n" -R "$REPO" --json state -q .state)" = MERGED ] && break; sleep 30; done
log "guard4: PR #$n $(gh pr view "$n" -R "$REPO" --json state -q .state) at $(date -u +%H:%M:%S); build run $run1 $(gh run view "$run1" -R "$REPO" --json status -q .status)"
for i in $(seq 1 60); do [ "$(gh run view "$run1" -R "$REPO" --json status -q .status)" = completed ] && break; sleep 30; done
steps1=$(gh run view "$run1" -R "$REPO" --json jobs -q '.jobs[0].steps[] | select(.conclusion=="success" or .conclusion=="failure" or .conclusion=="skipped") | "\(.name)=\(.conclusion)"' | grep -E "workflow file|Publish|Attest|tip" | tr '\n' ' ')
log "guard4: run1 $run1 → $(gh run view "$run1" -R "$REPO" --json conclusion -q .conclusion) | $steps1"
sleep 60; run2=$(gh run list -R "$REPO" --workflow build.yml --limit 1 --json databaseId -q '.[0].databaseId')
if [ "$run2" != "$run1" ]; then
  for i in $(seq 1 60); do [ "$(gh run view "$run2" -R "$REPO" --json status -q .status)" = completed ] && break; sleep 30; done
  steps2=$(gh run view "$run2" -R "$REPO" --json jobs -q '.jobs[0].steps[] | select(.conclusion=="success" or .conclusion=="failure" or .conclusion=="skipped") | "\(.name)=\(.conclusion)"' | grep -E "workflow file|Publish|Attest|tip" | tr '\n' ' ')
  log "guard4: run2 $run2 (relaunched) → $(gh run view "$run2" -R "$REPO" --json conclusion -q .conclusion) | $steps2"
else log "guard4: no relaunched run found"; fi
log "guard4: releases now: $(gh release list -R "$REPO" | head -3 | awk '{print $3}' | tr '\n' ' ')"
log "GUARD2_DONE"
