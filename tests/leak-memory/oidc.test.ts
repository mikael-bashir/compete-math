import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import { DEFAULT_POLICY, GITHUB_ISSUER, authorizeIntake, verifyGithubOidc, type Jwk } from '../../src/app/lib/leak-memory/oidc';

// Who may call the intake endpoints: only the intake workflow, from its repository and branch, with a token GitHub signed. Tokens are made here
// with a throwaway RSA key and the key set handed to the verifier, so nothing touches the network.

const b64 = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as Jwk), kid: 'k1', alg: 'RS256', use: 'sig' };
const jwks = async () => ({ keys: [jwk] });
const NOW = 1_800_000_000;

const good = {
  iss: GITHUB_ISSUER,
  aud: DEFAULT_POLICY.audience,
  repository: DEFAULT_POLICY.repository,
  repository_owner: 'competemath',
  job_workflow_ref: `${DEFAULT_POLICY.repository}/${DEFAULT_POLICY.workflow}@${DEFAULT_POLICY.ref}`,
  ref: DEFAULT_POLICY.ref,
  event_name: 'schedule',
  iat: NOW - 10,
  nbf: NOW - 10,
  exp: NOW + 300,
};
function sign(claims: Record<string, unknown>, opts: { key?: typeof privateKey; kid?: string; alg?: string } = {}) {
  const head = b64({ alg: opts.alg ?? 'RS256', typ: 'JWT', kid: opts.kid ?? 'k1' });
  const body = b64(claims);
  const s = createSign('RSA-SHA256').update(`${head}.${body}`).sign(opts.key ?? privateKey).toString('base64url');
  return `${head}.${body}.${s}`;
}
const refuse = async (token: string, why: RegExp, policy = DEFAULT_POLICY) => await assert.rejects(verifyGithubOidc(token, policy, { fetchJwks: jwks, nowSeconds: NOW }), why);
const ok = (token: string) => verifyGithubOidc(token, DEFAULT_POLICY, { fetchJwks: jwks, nowSeconds: NOW });

test('the intake workflow from main, started by a schedule or a dispatch, is accepted', async () => {
  assert.equal((await ok(sign(good))).repository, 'competemath/emissary-archangel');
  assert.ok(await ok(sign({ ...good, event_name: 'workflow_dispatch' })));
  assert.ok(await ok(sign({ ...good, aud: ['x', DEFAULT_POLICY.audience] })), 'an audience list that holds ours');
});

test('every claim is checked: another repository, owner, workflow, branch, event, audience, issuer all refuse', async () => {
  await refuse(sign({ ...good, repository: 'mikael-bashir/emissary-archangel' }), /wrong repository/);
  await refuse(sign({ ...good, repository_owner: 'someone' }), /wrong owner/);
  await refuse(sign({ ...good, job_workflow_ref: `${DEFAULT_POLICY.repository}/.github/workflows/other.yml@refs/heads/main` }), /wrong workflow/);
  await refuse(sign({ ...good, job_workflow_ref: `${DEFAULT_POLICY.repository}/${DEFAULT_POLICY.workflow}@refs/heads/feature` }), /wrong workflow/, DEFAULT_POLICY);
  await refuse(sign({ ...good, ref: 'refs/heads/feature' }), /wrong ref/);
  await refuse(sign({ ...good, event_name: 'pull_request' }), /wrong event/);
  await refuse(sign({ ...good, event_name: undefined }), /wrong event/);
  await refuse(sign({ ...good, aud: 'https://evil.example' }), /wrong audience/);
  await refuse(sign({ ...good, aud: undefined }), /wrong audience/);
  await refuse(sign({ ...good, iss: 'https://evil.example' }), /wrong issuer/);
});

test('an expired, not-yet-valid or timeless token refuses (with a minute of clock skew allowed)', async () => {
  await refuse(sign({ ...good, exp: NOW - 61 }), /expired/);
  assert.ok(await ok(sign({ ...good, exp: NOW - 30 })), 'within the skew');
  await refuse(sign({ ...good, nbf: NOW + 120 }), /not yet valid/);
  await refuse(sign({ ...good, exp: undefined }), /expired/);
  await refuse(sign({ ...good, exp: 'soon' }), /expired/);
});

test('the signature is the whole point: a wrong key, an unknown key id, a tampered body, "none" and an HMAC keyed by the public key all refuse', async () => {
  await refuse(sign(good, { key: other.privateKey }), /bad signature/);
  await refuse(sign(good, { kid: 'k2' }), /unknown key/);
  const t = sign(good).split('.');
  await refuse(`${t[0]}.${b64({ ...good, repository: 'evil/x' })}.${t[2]}`, /bad signature/);
  await refuse(`${b64({ alg: 'none', kid: 'k1' })}.${b64(good)}.`, /not a JWT/);
  await refuse(`${b64({ alg: 'none', kid: 'k1' })}.${b64(good)}.x`, /unexpected algorithm/);
  const head = b64({ alg: 'HS256', typ: 'JWT', kid: 'k1' });
  const body = b64(good);
  const mac = createHmac('sha256', JSON.stringify(jwk)).update(`${head}.${body}`).digest('base64url');
  await refuse(`${head}.${body}.${mac}`, /unexpected algorithm/);
  await refuse(sign(good, { alg: 'RS512' }), /unexpected algorithm/);
});

test('garbage and an unreachable key set refuse, never throw something else', async () => {
  for (const t of ['', 'a', 'a.b', 'a.b.c', '...', 'a.b.c.d', `${b64('x')}.${b64('y')}.z`]) await refuse(t, /not a JWT|unexpected algorithm|no key id/);
  await assert.rejects(verifyGithubOidc(sign(good), DEFAULT_POLICY, { fetchJwks: async () => { throw new Error('down'); }, nowSeconds: NOW }), /keys unavailable/);
  await assert.rejects(verifyGithubOidc(sign(good), DEFAULT_POLICY, { fetchJwks: async () => ({ keys: [] }), nowSeconds: NOW }), /unknown key/);
});

test('the route check is off unless the owner turned it on, wants a bearer token, and answers 404 when off so the endpoint is not even visible', async () => {
  const on = { LEAK_INTAKE_ENABLED: '1' };
  const deps = { fetchJwks: jwks, nowSeconds: NOW };
  assert.deepEqual(await authorizeIntake(`Bearer ${sign(good)}`, {}, deps), { ok: false, status: 404, reason: 'off' });
  assert.deepEqual(await authorizeIntake(`Bearer ${sign(good)}`, { LEAK_INTAKE_ENABLED: '0' }, deps), { ok: false, status: 404, reason: 'off' });
  assert.deepEqual(await authorizeIntake(null, on, deps), { ok: false, status: 401, reason: 'no token' });
  assert.deepEqual(await authorizeIntake('Basic abc', on, deps), { ok: false, status: 401, reason: 'no token' });
  assert.deepEqual(await authorizeIntake(`Bearer ${sign(good)}`, on, deps), { ok: true, status: 200 });
  assert.equal((await authorizeIntake(`Bearer ${sign({ ...good, repository: 'x/y' })}`, on, deps)).status, 401);
  // the host may name a different repository or workflow, but an empty setting falls back to the default, never to "anything"
  assert.equal((await authorizeIntake(`Bearer ${sign(good)}`, { ...on, LEAK_INTAKE_REPOSITORY: '' }, deps)).ok, true);
  assert.equal((await authorizeIntake(`Bearer ${sign(good)}`, { ...on, LEAK_INTAKE_REPOSITORY: 'other/repo' }, deps)).ok, false);
});
