// The signing workflow must run for every file the setup command downloads: a bridge file missing from its path filter would change without a new
// signature, and the command would then fail closed for everyone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRIDGE_FILES } from '../../src/lib/leak/bridge-files';

test('every bridge file is in the sign-bridge workflow\'s path filter', () => {
  const yml = readFileSync(join(process.cwd(), '.github/workflows/sign-bridge.yml'), 'utf8');
  for (const f of BRIDGE_FILES) assert.ok(yml.includes(`"public/${f.url}"`), `${f.url} is downloaded by the setup command but would not trigger signing`);
});
