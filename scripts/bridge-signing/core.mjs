// Signing the bridge manifest. No dependencies on purpose: this runs in CI with a secret key, and the same few lines run on the user's machine
// (the setup command embeds the verifier), so the less there is, the less there is to trust.
//
// What is signed is the manifest the setup command checks the files against: one line "<sha256>  <local file name>" per bridge file, in the
// order of files.json, each ending in a newline, behind a fixed prefix so a signature made for this cannot be replayed as anything else.
// Ed25519; the public key is the base64 of its SPKI DER encoding; the private key the base64 of its PKCS8 DER encoding.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

export const PREFIX = "leak-bridge-manifest-v1\n"

export function bridgeFiles(root) {
  return JSON.parse(readFileSync(join(root, "scripts/bridge-signing/files.json"), "utf8"))
}

export function manifestText(root, files = bridgeFiles(root)) {
  return files.map((f) => `${createHash("sha256").update(readFileSync(join(root, "public", f.url))).digest("hex")}  ${f.local}\n`).join("")
}

export const manifestId = (text) => createHash("sha256").update(text).digest("hex")

export function generateKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    privateKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  }
}

export const fingerprint = (publicKeyB64) => createHash("sha256").update(Buffer.from(publicKeyB64, "base64")).digest("hex")

export function signManifest(text, privateKeyB64) {
  const key = createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" })
  return sign(null, Buffer.from(PREFIX + text), key).toString("base64")
}

export function verifyManifest(text, signatureB64, publicKeyB64) {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" })
    return verify(null, Buffer.from(PREFIX + text), key, Buffer.from(String(signatureB64).trim(), "base64"))
  } catch {
    return false
  }
}
