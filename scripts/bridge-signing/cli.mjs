#!/usr/bin/env node
// Signing the Leak bridge. Three commands:
//   init [--rotate]        run ONCE by the maintainer, on their own machine: makes the signing key, puts the private half straight into the
//                          repository secret LEAK_BRIDGE_SIGNING_KEY (through `gh`, never printed, never written to disk) and writes the public
//                          half to public/bridge-signing.pub for you to commit.
//   sign --out DIR         CI: signs the manifest of the files in public/ with the secret, writes DIR/<manifest id>.sig, and checks the
//                          signature against public/bridge-signing.pub before it lets anything be published.
//   verify SIGFILE         anyone: checks a signature file against the files in public/ and the committed public key.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { fingerprint, manifestId, manifestText, newKeyPair, privateKeyB64, publicKeyB64, signManifest, verifyManifest } from "./core.mjs"

const SECRET = "LEAK_BRIDGE_SIGNING_KEY"
const [cmd, ...rest] = process.argv.slice(2)
const arg = (name) => {
  const i = rest.indexOf(name)
  return i >= 0 ? rest[i + 1] : undefined
}
const root = resolve(arg("--root") || join(dirname(fileURLToPath(import.meta.url)), "../.."))
const PUB = join(root, "public/bridge-signing.pub")
const die = (msg) => {
  console.error(msg)
  process.exit(1)
}

if (cmd === "init") {
  if (existsSync(PUB) && !rest.includes("--rotate")) die(`${PUB} exists: a key is already in use. Pass --rotate to replace it (every command built from the old key keeps its old signature; new builds use the new one).`)
  const repo = arg("--repo") || process.env.GITHUB_REPOSITORY || "mikael-bashir/compete-math"
  const pair = newKeyPair()
  // the private key goes to the secret through stdin and nowhere else
  const r = spawnSync("gh", ["secret", "set", SECRET, "--repo", repo], { input: privateKeyB64(pair), encoding: "utf8" })
  if (r.status !== 0) die(`could not store the secret (is gh installed and logged in with access to ${repo}?):\n${r.stderr || r.stdout}`)
  const pub = publicKeyB64(pair)
  writeFileSync(PUB, pub + "\n")
  console.log(`The private key is stored as the secret ${SECRET} of ${repo}. It is not on this machine and cannot be read back.`)
  console.log(`The public key is in public/bridge-signing.pub. Its fingerprint (publish this, e.g. in the README):\n  ${fingerprint(pub)}`)
  console.log("Commit public/bridge-signing.pub and merge it: the sign-bridge workflow then signs the current bridge files.")
} else if (cmd === "sign") {
  const out = arg("--out")
  if (!out) die("sign needs --out DIR")
  const priv = process.env[SECRET]
  if (!priv) die(`${SECRET} is not set`)
  if (!existsSync(PUB)) die("public/bridge-signing.pub is missing: run `init` first")
  const pub = readFileSync(PUB, "utf8").trim()
  const text = manifestText(root)
  const sig = signManifest(text, priv)
  if (!verifyManifest(text, sig, pub)) die("the secret does not belong to the committed public key: refusing to publish a signature nobody could verify")
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, `${manifestId(text)}.sig`), sig + "\n")
  console.log(`signed manifest ${manifestId(text)} with key ${fingerprint(pub).slice(0, 16)}`)
} else if (cmd === "verify") {
  const sigFile = rest[0]
  if (!sigFile) die("verify needs a signature file")
  const pub = readFileSync(PUB, "utf8").trim()
  const text = manifestText(root)
  if (!verifyManifest(text, readFileSync(sigFile, "utf8"), pub)) die("NOT valid for the files in public/")
  console.log(`valid: manifest ${manifestId(text)} signed by key ${fingerprint(pub).slice(0, 16)}`)
} else {
  die("usage: cli.mjs init [--rotate] [--repo owner/name] | sign --out DIR | verify SIGFILE   (all take --root DIR for another checkout)")
}
