# Shared helpers for the overnight campaign on competemath/tengoku-sandbox.
set -u
REPO=competemath/tengoku-sandbox
WORK=~/tengoku-sandbox-work
C=/private/tmp/claude-501/-Users-mikaelbashir-Downloads-compete-math/2ef80aed-15fe-485d-9c65-fe2c6de17155/scratchpad/campaign
EXPECT="$C/expect.tsv"          # name<TAB>expect(pass|fail)<TAB>expected failing job/step or -<TAB>phase(gate|queue)<TAB>description
LOG="$C/campaign.log"
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
SRC_PATH=equational_theories/ForMathlib/Definability.lean
SRC_URL="https://github.com/teorth/equational_theories/blob/e218ce18b0c265efbbe65093c1f1d063c54f3639/$SRC_PATH"
# rec NAME [key=value ...]  -> one staging record (JSON line); values are raw JSON when they start with { [ " or are numbers/true/false, else strings
rec() {
  python3 - "$@" <<'PY'
import json, sys
name = sys.argv[1]
r = {"name": f"Selftest.{name}", "statement": f"theorem Selftest.{name} : (1 : Nat) + 1 = 2", "proof": ":= rfl", "context": "set_option linter.all false",
     "source_path": "equational_theories/ForMathlib/Definability.lean", "status": "staging", "library": "equational-theories",
     "source_url": "https://github.com/teorth/equational_theories/blob/e218ce18b0c265efbbe65093c1f1d063c54f3639/equational_theories/ForMathlib/Definability.lean",
     "toolchain": "leanprover/lean4:v4.34.0-rc2"}
for kv in sys.argv[2:]:
    k, v = kv.split("=", 1)
    if v == "@del": r.pop(k, None); continue
    try: r[k] = json.loads(v) if (v[:1] in '{["' or v in ("true", "false", "null") or v.lstrip("-").isdigit()) else v.replace("\\n", "\n")
    except Exception: r[k] = v.replace("\\n", "\n")
print(json.dumps(r, ensure_ascii=False))
PY
}
# scenario NAME EXPECT(pass|fail) EXPECTED_JOB_OR_- SIGNOFF(yes|no) PHASE(gate|queue) "description" 'shell that edits the tree' [precheck-grep-pattern-on-diff]
scenario() {
  local name=$1 expect=$2 job=$3 signoff=$4 phase=$5 desc=$6 body=$7 pre=${8:-}
  cd "$WORK" || return 1
  git checkout -q -B "selftest/$name" origin/main 2>/dev/null || { log "FIXTURE-ERROR $name: checkout"; return 1; }
  ( eval "$body" ) || { log "FIXTURE-ERROR $name: body failed"; git checkout -q -f main; return 1; }
  git add -A
  if git diff --cached --quiet; then log "FIXTURE-ERROR $name: no change produced"; git checkout -q -f main; return 1; fi
  if [ -n "$pre" ] && ! git diff --cached | grep -qE -- "$pre"; then log "FIXTURE-ERROR $name: precheck '$pre' not in diff"; git checkout -q -f main; return 1; fi
  if [ "$signoff" = yes ]; then git commit -q -s -m "selftest: $name"; else git commit -q -m "selftest: $name"; fi
  git push -q -f origin "selftest/$name" 2>/dev/null
  local n
  n=$(gh pr list -R "$REPO" --head "selftest/$name" --state open --json number -q '.[0].number')
  if [ -z "$n" ]; then
    gh pr create -R "$REPO" --head "selftest/$name" --title "selftest: $name (expect $expect${job:+ at $job})" --body "$desc" >/dev/null 2>&1
    n=$(gh pr list -R "$REPO" --head "selftest/$name" --state open --json number -q '.[0].number')
  fi
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$name" "$expect" "$job" "$phase" "$n" "$desc" >> "$EXPECT"
  log "opened #$n $name (expect $expect${job:+ at $job})"
  git checkout -q -f main
}
# pr_gate_result N -> "pass|fail|pending<TAB>failed jobs/steps"
pr_gate_result() {
  local n=$1 st run failed
  st=$(gh pr checks "$n" -R "$REPO" --json name,state -q '.[] | select(.name=="pr-gate") | .state' 2>/dev/null)
  case "$st" in SUCCESS) echo -e "pass\t-"; return;; FAILURE|ERROR|CANCELLED) ;; *) echo -e "pending\t-"; return;; esac
  run=$(gh pr checks "$n" -R "$REPO" --json name,link -q '.[] | select(.name=="pr-gate") | .link' | grep -oE 'runs/[0-9]+' | cut -d/ -f2 | head -1)
  failed=$(gh run view "$run" -R "$REPO" --json jobs -q '[.jobs[] | select(.conclusion=="failure") | .name as $j | (.steps[] | select(.conclusion=="failure") | "\($j)/\(.name)")] | join(",")' 2>/dev/null)
  echo -e "fail\t${failed:-?}"
}
