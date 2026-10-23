import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import {
  MAX_RUN_MS,
  MIN_RUN_MS,
  cleanHarness,
  deployBuildVerifier,
  evaluateHarness,
  issueTicket,
  manifestTextOf,
  readTicket,
  verifyBuild,
  type BuildClaim,
  type HarnessClaim,
  type Receipt,
} from '../../src/app/lib/leak-memory/harness';
import { BRIDGE_FILES, MANIFEST_PREFIX } from '../../src/lib/leak/bridge-files';

// Evidence that a theorem came out of Leak's harness. It is friction, not proof: these tests pin down what costs a forger something (a ticket the
// server signed and aged, a plausible set of counters that agrees with the server's clock, a build the project published) and that nothing a
// client sends can widen what is trusted.

const SECRET = 'test-secret-of-some-length';
const NOW = Date.parse('2026-10-23T12:00:00Z');
const MIN = 60_000;

const hashes = Object.fromEntries(BRIDGE_FILES.map((f, i) => [f.url, createHash('sha256').update(`file ${i}`).digest('hex')]));
const text = manifestTextOf(hashes);
const build: BuildClaim = { id: createHash('sha256').update(text).digest('hex'), text };
const receipt = (over: Partial<Receipt> = {}): Receipt => ({ seconds: 3600, verifyOk: 60, verifyFail: 40, searches: 3, attempts: 4, model: 'claude-sonnet-5-5', strategy: 'control-lucid-iv', ...over });
const ticketAt = (ageMs: number, user = 'ada', target = 'collatz') => issueTicket(user, target, SECRET, NOW - ageMs);
const judge = (claim: HarnessClaim | null, now = NOW) => evaluateHarness(claim, { username: 'ada', target: 'collatz', secret: SECRET, now });

// ---- tickets ------------------------------------------------------------------------------------------------------------------------------------

test('a ticket names the account, the target and the time, and only this server can make one', () => {
  const t = ticketAt(3600_000);
  const r = readTicket(t, SECRET)!;
  assert.deepEqual([r.u, r.t, r.i], ['ada', 'collatz', NOW - 3600_000]);
  assert.equal(readTicket(t, 'another secret'), null, 'a different key does not read it');
  assert.equal(readTicket(t, ''), null, 'no key reads nothing');
  assert.notEqual(ticketAt(1000), ticketAt(1000), 'two tickets for the same moment differ (a nonce)');
  assert.throws(() => issueTicket('ada', 'collatz', ''), /no ticket secret/);
});

test('a ticket altered in any part is refused', () => {
  const [v, payload, mac] = ticketAt(3600_000).split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'eve', t: 'collatz', i: NOW - 3600_000, n: 'x' })).toString('base64url');
  assert.equal(readTicket(`${v}.${forged}.${mac}`, SECRET), null, "someone else's name on the same mac");
  const older = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), i: NOW - 99 * 3600_000 })).toString('base64url');
  assert.equal(readTicket(`${v}.${older}.${mac}`, SECRET), null, 'an older issue time');
  assert.equal(readTicket(`${v}.${payload}.${mac.slice(0, -2)}A`, SECRET), null, 'a changed mac');
  for (const bad of ['', 'v1', 'v1.a.b', `v2.${payload}.${mac}`, `${v}.${payload}`, `${v}.${payload}.${mac}.x`, 'v1.' + 'a'.repeat(700) + '.' + mac]) assert.equal(readTicket(bad, SECRET), null, bad.slice(0, 20));
});

// ---- what the bridge sends ----------------------------------------------------------------------------------------------------------------------

test('a claim is cleaned to the fields and sizes it may have', () => {
  const c = cleanHarness({ ticket: ticketAt(1), build, receipt: receipt(), extra: 'x', more: { deep: true } })!;
  assert.deepEqual(Object.keys(c).sort(), ['build', 'receipt', 'ticket']);
  assert.equal(cleanHarness({ ticket: 'v1.a.b' }), null, 'a malformed ticket is nothing');
  assert.equal(cleanHarness(null), null);
  assert.equal(cleanHarness('x'), null);
  assert.equal(cleanHarness({}), null);
  assert.equal(cleanHarness({ build: { id: 'short', text } }), null, 'a build id is a sha-256');
  assert.equal(cleanHarness({ build: { id: build.id, text: text + 'x'.repeat(2000) } }), null, 'a build text is five short lines');
  assert.equal(cleanHarness({ build: { id: build.id, text: text.split('\n').slice(0, 3).join('\n') + '\n' } }), null, 'the wrong number of files');
  assert.equal(cleanHarness({ receipt: { ...receipt(), seconds: -1 } }), null, 'a negative count');
  assert.equal(cleanHarness({ receipt: { ...receipt(), verifyOk: 1e9 } }), null, 'an absurd count');
  assert.equal(cleanHarness({ receipt: { ...receipt(), verifyOk: NaN } }), null);
  assert.equal(cleanHarness({ receipt: { ...receipt(), model: 3 } }), null);
  assert.equal(cleanHarness({ receipt: { ...receipt(), model: 'm'.repeat(500) } })!.receipt!.model.length, 80, 'text fields are cut');
  assert.equal(cleanHarness({ receipt: { ...receipt(), seconds: 12.6 } })!.receipt!.seconds, 13, 'counts are whole numbers');
});

// ---- the server's reading -----------------------------------------------------------------------------------------------------------------------

test('a run of an hour with a ticket and plausible counters passes', () => {
  const ev = judge({ ticket: ticketAt(3600_000), build, receipt: receipt() });
  assert.equal(ev.ticket.ok, true);
  assert.equal(ev.ticket.ageMs, 3600_000);
  assert.equal(ev.receipt.ok, true);
  assert.equal(ev.build?.id, build.id);
  assert.equal(ev.at, new Date(NOW).toISOString());
});

test('nothing claimed, nothing trusted; and the server is never told its own time', () => {
  for (const claim of [null, {}]) {
    const ev = judge(claim);
    assert.deepEqual([ev.ticket.ok, ev.receipt.ok], [false, false]);
    assert.equal(ev.build, null);
  }
  assert.equal(judge({ receipt: receipt() }).ticket.reason, 'no ticket');
  assert.equal(judge({ ticket: ticketAt(3600_000) }).receipt.reason, 'no receipt');
});

test('the run must be old enough, young enough, the right account and the right target, on a ticket this server issued', () => {
  const t = (ageMs: number, who = 'ada', target = 'collatz') => judge({ ticket: ticketAt(ageMs, who, target), receipt: receipt({ seconds: Math.round(ageMs / 1000) }) }).ticket;
  assert.equal(t(MIN_RUN_MS + 1000).ok, true);
  assert.equal(t(MIN_RUN_MS - 1000).ok, false, 'twenty-nine minutes is not long-running');
  assert.match(t(5 * MIN).reason!, /too young/);
  assert.equal(t(MAX_RUN_MS - 1000).ok, true);
  assert.match(t(MAX_RUN_MS + 1000).reason!, /expired/);
  assert.match(t(3600_000, 'eve').reason!, /another account or target/);
  assert.match(t(3600_000, 'ada', 'erdos-396').reason!, /another account or target/);
  const stranger = issueTicket('ada', 'collatz', 'a key the server does not have', NOW - 3600_000);
  assert.match(judge({ ticket: stranger }).ticket.reason!, /not a ticket this server issued/);
  assert.match(evaluateHarness({ ticket: ticketAt(3600_000) }, { username: 'ada', target: 'collatz', secret: '', now: NOW }).ticket.reason!, /not configured/, 'no secret: fail closed');
});

test('the receipt has to be plausible for a prover run', () => {
  const r = (over: Partial<Receipt>) => judge({ ticket: ticketAt(3600_000), receipt: receipt(over) }).receipt;
  assert.equal(r({}).ok, true);
  assert.match(r({ seconds: 600 }).reason!, /too short/);
  assert.match(r({ verifyOk: 3, verifyFail: 4 }).reason!, /too few verifications/);
  assert.match(r({ verifyOk: 0, verifyFail: 50 }).reason!, /too few verifications/, 'a run that never verified anything');
  assert.match(r({ verifyOk: 99, verifyFail: 1 }).reason!, /share of failed/, 'a run that never fails');
  assert.match(r({ verifyOk: 2, verifyFail: 98 }).reason!, /share of failed/, 'a run that almost never succeeds');
  assert.equal(r({ verifyOk: 98, verifyFail: 2 }).ok, true, 'two in a hundred is the edge');
  assert.match(r({ attempts: 0 }).reason!, /no attempt/);
  assert.match(r({ strategy: 'control-1' }).reason!, /not a memory strategy/);
  assert.match(r({ strategy: 'anything' }).reason!, /not a memory strategy/);
  assert.equal(r({ model: '' }).ok, true, 'the model is recorded, not judged (a run may use the CLI default)');
  for (const s of ['control-honoured', 'control-flint', 'control-paragon', 'control-lucid', 'control-lucid-iv']) assert.equal(r({ strategy: s }).ok, true, s);
});

test("the receipt's time has to agree with the ticket's age as the server measures it", () => {
  const r = (ageMs: number, seconds: number) => judge({ ticket: ticketAt(ageMs), receipt: receipt({ seconds }) }).receipt;
  assert.equal(r(3600_000, 3600).ok, true);
  assert.equal(r(3600_000, 3500).ok, true, 'a few minutes of slack');
  assert.equal(r(3600_000, 3600 + 290).ok, true);
  assert.match(r(3600_000, 3600 + 1500).reason!, /does not match the ticket/, 'a receipt claiming more time than has passed');
  assert.match(r(36_000_000, 3600).reason!, /does not match the ticket/, 'a ticket held for ten hours with a one-hour run');
  assert.equal(r(36_000_000, 36_000).ok, true);
  // without a valid ticket the receipt is judged alone, and the ticket's own verdict still says no
  const alone = judge({ receipt: receipt() });
  assert.equal(alone.receipt.ok, true);
  assert.equal(alone.ticket.ok, false);
});

// ---- builds -------------------------------------------------------------------------------------------------------------------------------------

const pair = generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const signed = (t: string) => sign(null, Buffer.from(MANIFEST_PREFIX + t), createPrivateKey(pair.privateKey.export({ format: 'pem', type: 'pkcs8' }))).toString('base64');

const other = manifestTextOf(Object.fromEntries(BRIDGE_FILES.map((f, i) => [f.url, createHash('sha256').update(`older ${i}`).digest('hex')])));
const otherBuild: BuildClaim = { id: createHash('sha256').update(other).digest('hex'), text: other };

test("the build of the deploy that serves it is known; an older one is known only if the project's key signed it", async () => {
  const sigs = new Map([[otherBuild.id, signed(other)]]);
  const v = { currentId: build.id, publicKey, fetchSignature: async (id: string) => sigs.get(id) ?? null };
  assert.deepEqual(await verifyBuild(build, v), { ok: true, via: 'current' });
  assert.deepEqual(await verifyBuild(otherBuild, v), { ok: true, via: 'signed' });
  const unsigned = createHash('sha256').update('unsigned').digest('hex');
  const forged = manifestTextOf(Object.fromEntries(BRIDGE_FILES.map((f) => [f.url, unsigned])));
  const forgedBuild = { id: createHash('sha256').update(forged).digest('hex'), text: forged };
  assert.match((await verifyBuild(forgedBuild, v)).reason!, /unknown build/, 'a modified bridge has a manifest nobody signed');
  sigs.set(forgedBuild.id, signed(other)); // a signature of some other manifest published under its name
  assert.match((await verifyBuild(forgedBuild, v)).reason!, /signature does not match/);
  const strangerPair = generateKeyPairSync('ed25519');
  sigs.set(forgedBuild.id, sign(null, Buffer.from(MANIFEST_PREFIX + forged), strangerPair.privateKey).toString('base64'));
  assert.match((await verifyBuild(forgedBuild, v)).reason!, /signature does not match/, "signed by someone else's key");
});

test('with no key set up only the current build is known, and an unreachable signature branch is a refusal, not an error', async () => {
  const v = { currentId: build.id, publicKey: '', fetchSignature: async () => 'x' };
  assert.equal((await verifyBuild(build, v)).ok, true);
  assert.match((await verifyBuild(otherBuild, v)).reason!, /no signing key is set up/);
  const down = { currentId: build.id, publicKey, fetchSignature: async () => { throw new Error('offline'); } };
  assert.match((await verifyBuild(otherBuild, down)).reason!, /unknown build/);
  assert.equal((await verifyBuild(build, { currentId: '', publicKey: '', fetchSignature: async () => null })).ok, false, 'a deploy that cannot name its own build vouches for nothing');
});

test('a build must be the bridge files in the signed order, and its id the hash of its text', async () => {
  const v = { currentId: build.id, publicKey, fetchSignature: async () => null };
  assert.match((await verifyBuild({ id: build.id, text: text.replace(BRIDGE_FILES[1].local, 'other.mjs') }, v)).reason!, /signed order/);
  assert.match((await verifyBuild({ id: 'f'.repeat(64), text }, v)).reason!, /not the hash/);
  const swapped = text.split('\n');
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.match((await verifyBuild({ id: createHash('sha256').update(swapped.join('\n')).digest('hex'), text: swapped.join('\n') }, v)).reason!, /signed order/);
  assert.match((await verifyBuild({ id: build.id, text: text.trimEnd() }, v)).reason!, /not a manifest/);
  assert.match((await verifyBuild({ id: build.id, text: text + '\n' }, v)).reason!, /not a manifest/);
});

test("the deploy's verifier reads its own build from the environment the site was built with, and remembers answers", async () => {
  let fetched = 0;
  const fakeFetch = (async () => {
    fetched++;
    return new Response(signed(other), { status: 200 });
  }) as unknown as typeof fetch;
  const env = { NEXT_PUBLIC_BRIDGE_SHA256: JSON.stringify(hashes), NEXT_PUBLIC_BRIDGE_SIGNING: JSON.stringify({ publicKey, manifestId: build.id }) };
  const check = deployBuildVerifier(env, fakeFetch);
  assert.deepEqual(await check(build), { ok: true, via: 'current' });
  assert.equal(fetched, 0, 'its own build needs no network');
  assert.deepEqual(await check(otherBuild), { ok: true, via: 'signed' });
  await check(otherBuild);
  assert.equal(fetched, 1, 'the answer is remembered');
  const none = deployBuildVerifier({}, fakeFetch);
  assert.equal((await none(build)).ok, false, 'no build environment: nothing is known');
  const broken = deployBuildVerifier({ NEXT_PUBLIC_BRIDGE_SHA256: '{"x":1}', NEXT_PUBLIC_BRIDGE_SIGNING: 'not json' }, fakeFetch);
  assert.equal((await broken(build)).ok, false);
});
