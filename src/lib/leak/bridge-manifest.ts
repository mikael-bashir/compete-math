import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRIDGE_FILES, manifestLines, type BridgeHashes, type BridgeSigning } from './bridge-files';

// The SHA-256 of each bridge file as it sits in public/, computed at build time (next.config.ts) so the command on the page and the files it
// names come from the same build. A missing file stops the build.
export function bridgeManifest(publicDir: string): BridgeHashes {
  const out: BridgeHashes = {};
  for (const f of BRIDGE_FILES) out[f.url] = createHash('sha256').update(readFileSync(join(publicDir, f.url))).digest('hex');
  return out;
}

// What the command needs to check a signature: the committed public key and the id of the manifest (the name of its signature file).
// null while no key has been set up (scripts/bridge-signing/cli.mjs init): the command then carries the hash check only.
export function bridgeSigning(publicDir: string, hashes: BridgeHashes): BridgeSigning | null {
  const pub = join(publicDir, 'bridge-signing.pub');
  if (!existsSync(pub)) return null;
  const text = manifestLines(hashes).map((l) => l + '\n').join('');
  return { publicKey: readFileSync(pub, 'utf8').trim(), manifestId: createHash('sha256').update(text).digest('hex') };
}
