#!/bin/sh
# Publishes the signature files in $1 on the bridge-signatures branch of the repository at $SIG_REMOTE_URL (the CI job builds that URL with its
# token). Creates the branch the first time, keeps every earlier signature (a bridge command built from an older deploy still finds its own), and
# does nothing when the signature is already there.
set -eu
src="$1"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
if git ls-remote --exit-code --heads "$SIG_REMOTE_URL" bridge-signatures >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch bridge-signatures "$SIG_REMOTE_URL" "$work/sigs"
else
  mkdir "$work/sigs"
  git -C "$work/sigs" init -q -b bridge-signatures
  git -C "$work/sigs" remote add origin "$SIG_REMOTE_URL"
fi
cp "$src"/*.sig "$work/sigs/"
cd "$work/sigs"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "this manifest is already signed and published"
  exit 0
fi
git commit -q -m "sign the bridge manifest of ${GITHUB_SHA:-local}"
git push -q origin bridge-signatures
echo "published"
