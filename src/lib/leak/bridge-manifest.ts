import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRIDGE_FILES, type BridgeHashes } from './bridge-files';

// The SHA-256 of each bridge file as it sits in public/, computed at build time (next.config.ts) so the command on the page and the files it
// names come from the same build. A missing file stops the build.
export function bridgeManifest(publicDir: string): BridgeHashes {
  const out: BridgeHashes = {};
  for (const f of BRIDGE_FILES) out[f.url] = createHash('sha256').update(readFileSync(join(publicDir, f.url))).digest('hex');
  return out;
}
