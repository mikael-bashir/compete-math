// The command a user pastes to start the bridge: it fetches every file the bridge needs, checks each against the hash the build computed, and
// starts the bridge only if all match. The check is run for real (the printf and shasum part of the command, in a temp directory).
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BRIDGE_FILES, buildSetupCommand } from '../../src/lib/leak/bridge-files';
import { bridgeManifest } from '../../src/lib/leak/bridge-manifest';

const PUBLIC = join(process.cwd(), 'public');
const hashes = bridgeManifest(PUBLIC);
const cmd = buildSetupCommand({ origin: 'https://example.test', token: 'tok', port: '4123', hashes });

test('every file the bridge loads is in the list, and exists in public/', () => {
  for (const f of BRIDGE_FILES) assert.ok(existsSync(join(PUBLIC, f.url)), f.url);
  // the bridge imports its sibling modules by name: any ./x.mjs it imports must be downloaded
  const bridge = readFileSync(join(PUBLIC, 'local-claude-bridge.mjs'), 'utf8');
  const imported = [...bridge.matchAll(/new URL\("\.\/([a-z-]+\.mjs)"/g)].map((m) => m[1]);
  assert.ok(imported.length >= 3, 'found the sibling imports');
  for (const name of imported) assert.ok(BRIDGE_FILES.some((f) => f.url === name), `${name} is imported by the bridge but not downloaded by the command`);
});

test('the command downloads every file, checks the hashes, and only then starts the bridge', () => {
  for (const f of BRIDGE_FILES) assert.ok(cmd.includes(`curl -fsSL 'https://example.test/${f.url}' -o ${f.local}`), f.url);
  const check = cmd.indexOf('shasum -a 256 -c');
  const start = cmd.indexOf('node claude-bridge.mjs');
  assert.ok(check > 0 && start > check, 'the check comes before the bridge starts');
  assert.ok(cmd.lastIndexOf('curl') < check, 'every download comes before the check');
  for (const f of BRIDGE_FILES) assert.ok(cmd.includes(`${hashes[f.url]}  ${f.local}`));
  assert.match(cmd, /BRIDGE_TOKEN='tok' ALLOWED_ORIGINS='https:\/\/example\.test' node claude-bridge\.mjs$/);
  assert.ok(!cmd.includes('PORT='), 'the default port is left out');
  assert.match(buildSetupCommand({ origin: 'https://x.test', token: 't', port: '4200', hashes }), /PORT='4200' BRIDGE_TOKEN='t'/);
});

test('without hashes the command still works but has no check, and without a token there is no command', () => {
  const bare = buildSetupCommand({ origin: 'https://x.test', token: 't', hashes: {} });
  assert.ok(!bare.includes('shasum') && bare.includes('node claude-bridge.mjs'));
  assert.equal(buildSetupCommand({ origin: 'https://x.test', token: '', hashes }), '');
  assert.equal(buildSetupCommand({ origin: '', token: 't', hashes }), '');
});

// the part of the command between the last download and the bridge, run in a directory that holds the files as they were saved
const verifyPart = () => {
  const i = cmd.indexOf("printf '%s");
  const j = cmd.indexOf(' && ', i);
  return cmd.slice(i, j);
};
const saved = () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-check-'));
  for (const f of BRIDGE_FILES) copyFileSync(join(PUBLIC, f.url), join(dir, f.local));
  return dir;
};
const runIn = (dir: string, sh: string) => spawnSync('sh', ['-c', sh], { cwd: dir, encoding: 'utf8' });

test('the check passes on the files as served', () => {
  const r = runIn(saved(), verifyPart());
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('the check fails when any one file is altered, truncated or missing, so the bridge would not start', () => {
  for (const f of BRIDGE_FILES) {
    const altered = saved();
    writeFileSync(join(altered, f.local), readFileSync(join(altered, f.local), 'utf8') + '\n// changed\n');
    assert.notEqual(runIn(altered, `${verifyPart()} && echo started`).status, 0, `${f.local} altered`);
    const truncated = saved();
    writeFileSync(join(truncated, f.local), readFileSync(join(truncated, f.local), 'utf8').slice(0, 500));
    const out = runIn(truncated, `${verifyPart()} && echo started`);
    assert.notEqual(out.status, 0, `${f.local} truncated`);
    assert.ok(!out.stdout.includes('started'));
    const missing = saved();
    spawnSync('rm', [join(missing, f.local)]);
    assert.notEqual(runIn(missing, verifyPart()).status, 0, `${f.local} missing`);
  }
});
