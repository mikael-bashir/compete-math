#!/bin/sh
# Installs (or removes) the job that syncs ~/.leak-runs into competemath/LRR. macOS, launchd. Idempotent.
#
#   sh tools/lrr-sync/install.sh --account fleeting [--key ~/.ssh/lrr_sync_ed25519] [--remote git@github.com:competemath/LRR.git]
#   sh tools/lrr-sync/install.sh --uninstall
#
# It copies core.mjs and sync.mjs to ~/.leak-runs/.lrr-sync/ (so the job does not depend on where this checkout is), writes the config
# ~/.leak-runs/.lrr-sync.json, and loads ~/Library/LaunchAgents/com.competemath.lrr-sync.plist. The job runs every 15 minutes and whenever
# ~/.leak-runs/index.jsonl changes. Nothing secret is written: the config names the key file, it never holds a key.
set -eu

LABEL="com.competemath.lrr-sync"
HOME_DIR="${HOME:?}"
RUNS="$HOME_DIR/.leak-runs"
DEST="$RUNS/.lrr-sync"
PLIST="$HOME_DIR/Library/LaunchAgents/$LABEL.plist"
HERE="$(cd "$(dirname "$0")" && pwd)"
ACCOUNT=""
KEY="$HOME_DIR/.ssh/lrr_sync_ed25519"
REMOTE="git@github.com:competemath/LRR.git"
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --account) ACCOUNT="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --remote) REMOTE="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ "$UNINSTALL" = 1 ]; then
  [ "${LRR_SKIP_LAUNCHD:-0}" = 1 ] || launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  rm -rf "$DEST"
  echo "removed the job and $DEST (your transcripts, the config and the sync state are untouched)"
  exit 0
fi

case "$ACCOUNT" in
  "") echo "--account is required (the competemath account the runs belong to, e.g. fleeting)" >&2; exit 2 ;;
  *[!A-Za-z0-9_-]*|-*) echo "account must be letters, digits, - and _" >&2; exit 2 ;;
esac
command -v node >/dev/null 2>&1 || { echo "node is not on PATH" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git is not on PATH" >&2; exit 1; }
[ -f "$KEY" ] || { echo "no deploy key at $KEY (see tools/lrr-sync/README.md)" >&2; exit 1; }
PERM="$(stat -c %a "$KEY" 2>/dev/null || stat -f %Lp "$KEY")" # GNU first: on Linux, BSD-style -f means something else and still exits 0
[ "$PERM" = 600 ] || [ "$PERM" = 400 ] || { echo "$KEY must be readable by you only (chmod 600 $KEY)" >&2; exit 1; }

mkdir -p "$DEST" "$RUNS" "$HOME_DIR/Library/LaunchAgents"
cp "$HERE/core.mjs" "$HERE/sync.mjs" "$DEST/"
printf '%s\n' "{\"account\":\"$ACCOUNT\",\"remote\":\"$REMOTE\",\"branch\":\"main\",\"sshKey\":\"$KEY\"}" > "$RUNS/.lrr-sync.json"

node "$DEST/sync.mjs" status
node "$DEST/sync.mjs" plist > "$PLIST"
if [ "${LRR_SKIP_LAUNCHD:-0}" != 1 ]; then # the tests set it, so they never touch the real launchd
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
fi
echo "installed: $LABEL runs every 15 minutes and when $RUNS/index.jsonl changes; log: $RUNS/.lrr-sync.log"
echo "first sync is running now; watch it with: tail -f $RUNS/.lrr-sync.log"
