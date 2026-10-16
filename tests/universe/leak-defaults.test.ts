import test from 'node:test';
import assert from 'node:assert/strict';

import { LEAK_DEFAULT_SERVERS, SEEDED_KEY, leakStatus, orderForProver, seedLeakDefaults } from '../../src/lib/mcp/leak-defaults';
import type { MCPServer } from '../../src/lib/types/mcp';
import type { ProverServerLike } from '../../src/lib/mcp/leak-defaults';

function store(initial: MCPServer[] = [], seeded = false) {
  const servers = [...initial];
  const kv = new Map<string, string>(seeded ? [[SEEDED_KEY, '1']] : []);
  return {
    servers,
    kv,
    deps: {
      signedIn: true,
      storage: { getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => void kv.set(k, v) },
      list: () => servers,
      add: (i: { name: string; url: string }) => void servers.push({ id: `id${servers.length}`, name: i.name, url: i.url, isActive: true }),
    },
  };
}

test('the three Leak services are public SSE endpoints named as the prover expects', () => {
  assert.deepEqual(LEAK_DEFAULT_SERVERS.map((s) => s.name), ['Leak_I', 'Leak_II', 'Leak_IV']);
  for (const s of LEAK_DEFAULT_SERVERS) assert.match(s.url, /^https:\/\/[a-z-]+\.hf\.space\/sse$/);
});

test('signed out: nothing is registered and nothing is remembered', () => {
  const s = store();
  assert.deepEqual(seedLeakDefaults({ ...s.deps, signedIn: false }), []);
  assert.equal(s.servers.length, 0);
  assert.equal(s.kv.size, 0);
});

test('signed in for the first time: all three are added, once', () => {
  const s = store();
  assert.deepEqual(seedLeakDefaults(s.deps), ['Leak_I', 'Leak_II', 'Leak_IV']);
  assert.equal(s.servers.length, 3);
  assert.deepEqual(seedLeakDefaults(s.deps), []);
  assert.equal(s.servers.length, 3);
});

test('one that is already there (even with a trailing slash) is not added twice', () => {
  const s = store([{ id: 'x', name: 'my search', url: 'https://barkingtree-leak-i.hf.space/sse/', isActive: true }]);
  assert.deepEqual(seedLeakDefaults(s.deps), ['Leak_II', 'Leak_IV']);
});

test('a server the user removed on purpose is not put back on the next visit', () => {
  const s = store([], true);
  assert.deepEqual(seedLeakDefaults(s.deps), []);
  assert.equal(s.servers.length, 0);
});

test('"restore" adds whatever is missing even if this browser was seeded before', () => {
  const s = store([{ id: 'a', name: 'Leak_I', url: LEAK_DEFAULT_SERVERS[0].url, isActive: true }], true);
  assert.deepEqual(seedLeakDefaults({ ...s.deps, force: true }), ['Leak_II', 'Leak_IV']);
});

test('storage that throws does not break seeding', () => {
  const s = store();
  const deps = { ...s.deps, storage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } };
  assert.equal(seedLeakDefaults(deps).length, 3);
});

test('status lists what is connected and what is missing or switched off', () => {
  const servers: MCPServer[] = [
    { id: '1', name: 'Leak_I', url: LEAK_DEFAULT_SERVERS[0].url, isActive: true },
    { id: '2', name: 'Leak_II', url: LEAK_DEFAULT_SERVERS[1].url, isActive: false },
  ];
  assert.deepEqual(leakStatus(servers), { connected: ['Leak_I'], missing: ['Leak_II', 'Leak_IV'] });
});

test('the verifier goes to the prover first, whatever order the servers were registered in (Leak I first once made every proof fail its final check)', () => {
  const [i, ii, iv] = LEAK_DEFAULT_SERVERS.map((d): ProverServerLike => ({ name: d.name, url: d.url }));
  const got = orderForProver([i, ii, iv]);
  assert.equal(got[0].name, 'Leak_IV');
  assert.deepEqual(got.map((s) => s.name), ['Leak_IV', 'Leak_I', 'Leak_II']);
  assert.ok(got[0].tools?.some((t) => t.name === 'verify_full_script'));
  assert.ok(got.find((s) => s.name === 'Leak_I')?.tools?.every((t) => !/verify/.test(t.name)));
});

test('known servers get their real tools; a server the user added keeps what it has and its place', () => {
  const mine: ProverServerLike = { name: 'my-search', url: 'https://example.org/sse' };
  const withTools: ProverServerLike = { name: 'x', url: 'https://example.org/other', tools: [{ name: 'verify_full_script', args: [] }] };
  const got = orderForProver([mine, withTools]);
  assert.deepEqual(got.map((s) => s.name), ['x', 'my-search']);
  assert.equal(got[1].tools, undefined);
  const same: ProverServerLike = { name: 'Leak_IV', url: LEAK_DEFAULT_SERVERS[2].url + '/', tools: [{ name: 'custom', args: [] }] };
  assert.deepEqual(orderForProver([same])[0].tools, [{ name: 'custom', args: [] }]);
});
