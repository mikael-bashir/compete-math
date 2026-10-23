# Signing the Leak bridge

The setup command on the Leak page downloads the bridge and its modules and starts them on your machine, so the question is what you are trusting when you paste it. It now checks twice before it runs anything:

1. **Hashes.** Each file is checked against the SHA-256 the build computed from the file it serves. This catches a truncated download, a CDN serving one file from before a deploy and another from after, and a file altered on the way.
2. **A signature.** The list of those hashes (the manifest) is checked against an Ed25519 signature made by a key that lives only in GitHub Actions and published on the `bridge-signatures` branch of this repository, not by the website. A website that is compromised could change the page, the files and the hashes together, but it cannot make a command that passes this check without the signing key.

The check is node's own `crypto`, so it needs nothing installed beyond what the bridge needs. When it passes it prints the first 16 hex digits of the key's fingerprint. If the signature does not match, the command stops before the bridge starts.

## Checking it yourself, without trusting the site

The command embeds the public key. To confirm it is the project's key, compare its fingerprint with the one committed in this repository (`public/bridge-signing.pub`, published below), not with anything on the website:

```
curl -fsSL https://raw.githubusercontent.com/mikael-bashir/compete-math/main/public/bridge-signing.pub | base64 -d | shasum -a 256
```

Fingerprint of the current key: _(printed by `init`; add it here when the key is made)_

To verify a set of files by hand, put them in a directory as `claude-bridge.mjs`, `leak-min-imports.mjs`, `leak-memory.mjs`, `leak-containment.mjs`, `leak-quality.mjs`, then in a checkout of the repository run `node scripts/bridge-signing/cli.mjs verify <the .sig file>`.

## Maintainer: making the key (once)

Nothing exists yet that could be reused: the SSH keys on a maintainer's machine are login or deploy keys and must never go into CI. Make a dedicated key, from your own terminal, with `gh` logged in with access to the repository:

```
node scripts/bridge-signing/cli.mjs init
```

This generates an Ed25519 key, puts the private half straight into the repository secret `LEAK_BRIDGE_SIGNING_KEY` through `gh` (it is never printed and never written to disk, so it cannot be read back), writes the public half to `public/bridge-signing.pub` and prints its fingerprint. Commit and merge the public key; the `sign-bridge` workflow then signs the current bridge files, and every later change to them is signed on merge. Add the fingerprint to this file.

The secret is available only to the `sign-bridge` workflow, which runs on pushes to `main` and is not reachable from a pull request.

**Rotating.** `node scripts/bridge-signing/cli.mjs init --rotate` makes a new key and replaces the secret and the public key. Commands built before the rotation carry the old public key and the old signatures stay on the branch, so they keep working until the page is rebuilt. If the key is ever lost or exposed, rotate at once.

**Between merging a bridge change and its signature.** The page is built before the workflow has signed, and the signature takes a minute or two to appear (GitHub's raw file cache can add a few minutes). Until it does, the command fails at the signature fetch and the bridge does not start. That is the safe failure.

## What else the signature is for

A run says which build it ran (the manifest id) with every theorem it saves, and the memory intake accepts a build that is the deploy's own or that the project's key signed (docs/leak-memory.md, "Evidence that a theorem came from the harness"). Without a key only the current deploy's build is known; with one, every build ever signed stays known, so a run on an older bridge is still accepted.

## What this does not cover

- Whoever holds repository write access can change the workflow or the secret's use. The key protects against a compromised website or CDN, not against a compromised repository or GitHub account.
- A user who never compares the fingerprint trusts the page for the key. The signature still protects them from any attacker who cannot also change the key in the page; checking the fingerprint once closes that.
- Revocation: there is none beyond rotating and rebuilding the page.
