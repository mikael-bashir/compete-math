// Signing the bridge: the core, and the check the setup command runs on the user's machine, run for real with a throwaway key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fingerprint, generateKey, manifestId, manifestText, signManifest, verifyManifest } from '../../scripts/bridge-signing/core.mjs';
import { BRIDGE_FILES, buildSetupCommand, manifestLines } from '../../src/lib/leak/bridge-files';
import { bridgeManifest, bridgeSigning } from '../../src/lib/leak/bridge-manifest';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');
const hashes = bridgeManifest(PUBLIC);
const text: string = manifestText(ROOT);

test('the manifest the build computes for the command is the one core.mjs signs, line for line', () => {
  assert.equal(manifestLines(hashes).map((l) => l + '\n').join(''), text);
});

test('a signature verifies for its manifest and its key, and for nothing else', () => {
  const a = generateKey();
  const b = generateKey();
  const sig = signManifest(text, a.privateKey);
  assert.equal(verifyManifest(text, sig, a.publicKey), true);
  assert.equal(verifyManifest(text, sig, b.publicKey), false, 'another key');
  assert.equal(verifyManifest(text.replace(/[0-9a-f]/, (c: string) => (c === '0' ? '1' : '0')), sig, a.publicKey), false, 'one hash changed');
  assert.equal(verifyManifest(text + 'x', sig, a.publicKey), false);
  assert.equal(verifyManifest(text, 'not a signature', a.publicKey), false);
  assert.equal(verifyManifest(text, '', a.publicKey), false);
  assert.equal(verifyManifest(text, sig, 'not a key'), false);
  assert.match(fingerprint(a.publicKey), /^[0-9a-f]{64}$/);
  assert.match(manifestId(text), /^[0-9a-f]{64}$/);
});

// the signed command, with `curl` for the signature replaced by copying a file, run in a directory that holds the files as they were saved
const SAFE = 'https://sigs.example.test';
function scenario(opts: { signWith?: string; verifyWith: string; tamper?: (dir: string) => void; skipSig?: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-sign-'));
  const sigDir = mkdtempSync(join(tmpdir(), 'bridge-sigs-'));
  for (const f of BRIDGE_FILES) copyFileSync(join(PUBLIC, f.url), join(dir, f.local));
  const id = manifestId(text);
  if (!opts.skipSig) writeFileSync(join(sigDir, `${id}.sig`), signManifest(text, opts.signWith!) + '\n');
  const cmd = buildSetupCommand({ origin: 'https://site.example.test', token: 't', hashes, signing: { publicKey: opts.verifyWith, manifestId: id, sigBase: SAFE } });
  opts.tamper?.(dir);
  // keep only the checks: from the printf that writes the manifest up to (not including) the line that starts the bridge
  const from = cmd.indexOf("printf '%s");
  const to = cmd.indexOf(' && BRIDGE_TOKEN=');
  let checks = cmd.slice(from, to);
  checks = checks.replace(`curl -fsSL '${SAFE}/${id}.sig' -o bridge.sha256.sig`, `cp '${join(sigDir, id + '.sig')}' bridge.sha256.sig`);
  const r = spawnSync('sh', ['-c', `${checks} && echo STARTED`], { cwd: dir, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  rmSync(sigDir, { recursive: true, force: true });
  return { cmd, status: r.status, out: r.stdout + r.stderr, started: r.stdout.includes('STARTED') };
}

test('the command starts the bridge only when files, hashes and signature all agree', () => {
  const k = generateKey();
  const good = scenario({ signWith: k.privateKey, verifyWith: k.publicKey });
  assert.equal(good.started, true, good.out);
  assert.match(good.out, new RegExp(`signed by key ${fingerprint(k.publicKey).slice(0, 16)}`));
});

test('it does not start when the signature is by another key, is missing, or the files changed', () => {
  const k = generateKey();
  const other = generateKey();
  assert.equal(scenario({ signWith: other.privateKey, verifyWith: k.publicKey }).started, false, 'signed by a key the command does not trust');
  const noSig = scenario({ verifyWith: k.publicKey, skipSig: true });
  assert.equal(noSig.started, false, 'no signature published');
  const altered = scenario({ signWith: k.privateKey, verifyWith: k.publicKey, tamper: (d) => writeFileSync(join(d, 'claude-bridge.mjs'), readFileSync(join(d, 'claude-bridge.mjs'), 'utf8') + '\n// x\n') });
  assert.equal(altered.started, false, 'a file changed after signing');
});

test('a site that changes a file AND its hash in the command still cannot pass without the key', () => {
  const k = generateKey();
  const dir = mkdtempSync(join(tmpdir(), 'bridge-forge-'));
  for (const f of BRIDGE_FILES) copyFileSync(join(PUBLIC, f.url), join(dir, f.local));
  writeFileSync(join(dir, 'claude-bridge.mjs'), 'process.stdout.write("evil")\n');
  // the forger's command carries the hash of its own file; the signature is the real one over the real manifest
  const forgedHashes = { ...hashes, 'local-claude-bridge.mjs': 'a'.repeat(64) };
  const { createHash } = require('node:crypto');
  forgedHashes['local-claude-bridge.mjs'] = createHash('sha256').update(readFileSync(join(dir, 'claude-bridge.mjs'))).digest('hex');
  const realId = manifestId(text);
  const sigDir = mkdtempSync(join(tmpdir(), 'bridge-sigs-'));
  writeFileSync(join(sigDir, `${realId}.sig`), signManifest(text, k.privateKey) + '\n');
  const forgedText = manifestLines(forgedHashes).map((l) => l + '\n').join('');
  const cmd = buildSetupCommand({ origin: 'https://site.example.test', token: 't', hashes: forgedHashes, signing: { publicKey: k.publicKey, manifestId: manifestId(forgedText), sigBase: SAFE } });
  // the forger has no signature for its manifest: the best it can do is serve the real one, which does not match
  const from = cmd.indexOf("printf '%s");
  const checks = cmd.slice(from, cmd.indexOf(' && BRIDGE_TOKEN=')).replace(/curl -fsSL '[^']*\.sig' -o bridge\.sha256\.sig/, `cp '${join(sigDir, realId + '.sig')}' bridge.sha256.sig`);
  const r = spawnSync('sh', ['-c', `${checks} && echo STARTED`], { cwd: dir, encoding: 'utf8' });
  assert.ok(!r.stdout.includes('STARTED'), r.stdout + r.stderr);
  assert.match(r.stderr, /DOES NOT MATCH/);
});

test('the command is safe to paste into an interactive shell and carries the key and the signature fetch', () => {
  const k = generateKey();
  const cmd = buildSetupCommand({ origin: 'https://site.example.test', token: 't', hashes, signing: { publicKey: k.publicKey, manifestId: manifestId(text) } });
  const node = cmd.slice(cmd.indexOf('node -e "') , cmd.indexOf('" && '));
  assert.ok(!/[!`$]/.test(node), 'no history expansion, command substitution or variable in the verifier');
  assert.ok(cmd.includes(`raw.githubusercontent.com/mikael-bashir/compete-math/bridge-signatures/${manifestId(text)}.sig`));
  assert.ok(cmd.includes(k.publicKey));
  assert.ok(cmd.indexOf('node -e') < cmd.indexOf('node claude-bridge.mjs'), 'the signature is checked before the bridge starts');
});

test('without a committed key the command carries the hash check only; the build reads the key when it exists', () => {
  const none = buildSetupCommand({ origin: 'https://s.test', token: 't', hashes, signing: null });
  assert.ok(none.includes('shasum') && !none.includes('node -e'));
  const dir = mkdtempSync(join(tmpdir(), 'bridge-pub-'));
  assert.equal(bridgeSigning(dir, hashes), null);
  const k = generateKey();
  writeFileSync(join(dir, 'bridge-signing.pub'), k.publicKey + '\n');
  const s = bridgeSigning(dir, hashes);
  assert.equal(s?.publicKey, k.publicKey);
  assert.equal(s?.manifestId, manifestId(text));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
});

// the CLI the workflow runs, on a copy of the repo layout
function checkout() {
  const root = mkdtempSync(join(tmpdir(), 'bridge-root-'));
  mkdirSync(join(root, 'scripts/bridge-signing'), { recursive: true });
  mkdirSync(join(root, 'public'));
  copyFileSync(join(ROOT, 'scripts/bridge-signing/files.json'), join(root, 'scripts/bridge-signing/files.json'));
  for (const f of BRIDGE_FILES) copyFileSync(join(PUBLIC, f.url), join(root, 'public', f.url));
  return root;
}
const cli = (root: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [join(ROOT, 'scripts/bridge-signing/cli.mjs'), ...args, '--root', root], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv });

test('cli: sign writes <manifest id>.sig, which verify accepts, and a changed file then fails verify', () => {
  const root = checkout();
  const k = generateKey();
  writeFileSync(join(root, 'public/bridge-signing.pub'), k.publicKey + '\n');
  const out = join(root, 'out');
  const s = cli(root, ['sign', '--out', out], { LEAK_BRIDGE_SIGNING_KEY: k.privateKey });
  assert.equal(s.status, 0, s.stderr);
  const sigFile = join(out, `${manifestId(manifestText(root))}.sig`);
  assert.equal(cli(root, ['verify', sigFile]).status, 0);
  writeFileSync(join(root, 'public/leak-memory.mjs'), readFileSync(join(root, 'public/leak-memory.mjs'), 'utf8') + '\n// changed\n');
  assert.notEqual(cli(root, ['verify', sigFile]).status, 0, 'the signature does not cover a changed file');
  rmSync(root, { recursive: true, force: true });
});

test('cli: sign refuses a secret that does not belong to the committed public key, an absent secret, and an absent key', () => {
  const root = checkout();
  const k = generateKey();
  const other = generateKey();
  writeFileSync(join(root, 'public/bridge-signing.pub'), k.publicKey + '\n');
  const wrong = cli(root, ['sign', '--out', join(root, 'o1')], { LEAK_BRIDGE_SIGNING_KEY: other.privateKey });
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /does not belong to the committed public key/);
  assert.notEqual(cli(root, ['sign', '--out', join(root, 'o2')]).status, 0, 'no secret');
  rmSync(join(root, 'public/bridge-signing.pub'));
  assert.notEqual(cli(root, ['sign', '--out', join(root, 'o3')], { LEAK_BRIDGE_SIGNING_KEY: k.privateKey }).status, 0, 'no public key');
  rmSync(root, { recursive: true, force: true });
});

test('cli: init refuses to replace a key that is in use without --rotate, and never prints the private key', () => {
  const root = checkout();
  const k = generateKey();
  writeFileSync(join(root, 'public/bridge-signing.pub'), k.publicKey + '\n');
  const r = cli(root, ['init']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--rotate/);
  assert.ok(!(r.stdout + r.stderr).includes(k.privateKey));
  rmSync(root, { recursive: true, force: true });
});

test('cli: init puts the private key into the repository secret through gh and nowhere else, and writes only the public key', () => {
  const root = checkout();
  const bin = mkdtempSync(join(tmpdir(), 'fake-gh-'));
  const seen = join(bin, 'stdin.txt');
  const args = join(bin, 'args.txt');
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" > '${args}'\ncat > '${seen}'\n`, { mode: 0o755 });
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/bridge-signing/cli.mjs'), 'init', '--root', root, '--repo', 'o/r'], { encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH ?? ''}` } as unknown as NodeJS.ProcessEnv });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(args, 'utf8').trim(), 'secret set LEAK_BRIDGE_SIGNING_KEY --repo o/r');
  const priv = readFileSync(seen, 'utf8');
  const pub = readFileSync(join(root, 'public/bridge-signing.pub'), 'utf8').trim();
  // the key that went to the secret signs, and the key that was written verifies
  assert.equal(verifyManifest(text, signManifest(text, priv), pub), true);
  assert.ok(!(r.stdout + r.stderr).includes(priv.trim()), 'the private key is never printed');
  assert.ok(!readFileSync(join(root, 'public/bridge-signing.pub'), 'utf8').includes(priv.trim()));
  assert.match(r.stdout, new RegExp(fingerprint(pub)));
  rmSync(root, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
});

test('cli: init stops, and writes no public key, when the secret cannot be stored', () => {
  const root = checkout();
  const bin = mkdtempSync(join(tmpdir(), 'fake-gh-'));
  writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho denied >&2\nexit 1\n', { mode: 0o755 });
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/bridge-signing/cli.mjs'), 'init', '--root', root], { encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH ?? ''}` } as unknown as NodeJS.ProcessEnv });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(join(root, 'public/bridge-signing.pub')), false, 'a public key whose private half is nowhere would make every command fail');
  rmSync(root, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
});

// the publish step against a local bare repository standing in for GitHub
function bare() {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-bare-'));
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', dir]);
  return dir;
}
const publish = (remote: string, sigDir: string) =>
  spawnSync('sh', [join(ROOT, 'scripts/bridge-signing/publish.sh'), sigDir], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: tmpdir(), SIG_REMOTE_URL: `file://${remote}`, GIT_CONFIG_GLOBAL: '/dev/null' } as unknown as NodeJS.ProcessEnv });
const branchFiles = (remote: string) => spawnSync('git', ['--git-dir', remote, 'ls-tree', '--name-only', 'bridge-signatures'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

test('publish: creates the branch the first time, keeps earlier signatures, adds new ones, and does nothing for one already there', () => {
  const remote = bare();
  const one = mkdtempSync(join(tmpdir(), 'sig1-'));
  writeFileSync(join(one, 'aaaa.sig'), 'sig-a\n');
  assert.equal(publish(remote, one).status, 0);
  assert.deepEqual(branchFiles(remote), ['aaaa.sig']);
  const again = publish(remote, one);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /already signed and published/);
  const two = mkdtempSync(join(tmpdir(), 'sig2-'));
  writeFileSync(join(two, 'bbbb.sig'), 'sig-b\n');
  assert.equal(publish(remote, two).status, 0);
  assert.deepEqual(branchFiles(remote), ['aaaa.sig', 'bbbb.sig'], 'the older signature is still there');
  const count = spawnSync('git', ['--git-dir', remote, 'rev-list', '--count', 'bridge-signatures'], { encoding: 'utf8' }).stdout.trim();
  assert.equal(count, '2', 'one commit per new signature, none for the repeat');
  for (const d of [remote, one, two]) rmSync(d, { recursive: true, force: true });
});

test('publish: a failed push is a failed step, so a missing signature is never mistaken for a published one', () => {
  const one = mkdtempSync(join(tmpdir(), 'sig1-'));
  writeFileSync(join(one, 'aaaa.sig'), 'sig-a\n');
  const r = publish('/nonexistent/remote.git', one);
  assert.notEqual(r.status, 0);
  rmSync(one, { recursive: true, force: true });
});
