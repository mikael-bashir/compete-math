import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { KEEP_AT, MAX_PER_BUNDLE, intakeAccounts, keptStore } from '../../src/app/lib/leak-memory/kept-core';
import { leakMemoryStore } from '../../src/app/lib/leak-memory/memory-core';
import { asSqlTag } from '../helpers/pglite';

// The kept tier and the intake queue against a real Postgres: what is copied, what is never lost, who may be offered to the intake, and that
// the intake's marks can only touch what is waiting for the account they name.

const entry = (n: number, stars: number | null, extra: Record<string, unknown> = {}) => ({
  id: n.toString(16).padStart(40, 'c'),
  name: `lemma_${n}`,
  statement: `theorem lemma_${n} (a : ℕ) : a + ${n} = ${n} + a`,
  closure: `theorem lemma_${n} (a : ℕ) : a + ${n} = ${n} + a := by\n  omega`,
  origin: 'verified',
  savedAt: `2026-10-22T00:00:${String(n % 60).padStart(2, '0')}Z`,
  attempt: 1,
  isTarget: false,
  nominated: false,
  subsumes: [],
  subsumedBy: null,
  hits: 0,
  quality: stars === null ? null : { s: stars, u: 0 },
  ...extra,
});
const HASH = 'a'.repeat(64);
const ALLOW = new Set(['ada', 'bob', 'a1', 'a2', 'a3']);

async function setup(limits = {}) {
  const raw = new PGlite();
  const db = asSqlTag(raw);
  return { raw, db, k: keptStore(db, limits), mem: leakMemoryStore(db) };
}

test(`only theorems rated ${KEEP_AT} stars or more are kept, and the target's own proof is one of them`, async () => {
  const { k } = await setup();
  const n = await k.keep('ada', 't', [entry(1, 5), entry(2, KEEP_AT), entry(3, KEEP_AT - 1), entry(4, 1), entry(5, null), entry(6, 5, { isTarget: true })]);
  assert.equal(n, 3);
  assert.deepEqual(await k.summary('ada', 't'), { kept: 3, submitted: 0 });
  assert.equal(KEEP_AT, 4);
});

test('nothing unproved or malformed is kept, and a client cannot keep a nomination', async () => {
  const { raw, k } = await setup();
  const bad = entry(1, 5, { closure: 'theorem lemma_1 : 1 = 1 := by sorry' });
  const odd = entry(2, 5, { nominated: true });
  assert.equal(await k.keep('ada', 't', [bad, { id: 'zz' }, null, 'x', odd]), 1);
  const rows = (await raw.query<{ entry: Record<string, unknown> }>('SELECT entry FROM leak_memory_kept')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entry.nominated, false);
});

test('a kept theorem survives everything that happens to the working library', async () => {
  const { k, mem } = await setup();
  const e = entry(1, 5);
  await mem.save('ada', 't', [e]);
  await k.keep('ada', 't', [e]);
  assert.equal(await mem.remove('ada', 't', e.id), true, 'the working row is deleted');
  assert.deepEqual(await k.summary('ada', 't'), { kept: 1, submitted: 0 }, 'the kept copy is not');
  assert.equal(await k.markSubmitted('ada', 't', [e.id], HASH), 1);
});

test('a rating written again replaces a waiting copy and never one a bundle already holds', async () => {
  const { raw, k } = await setup();
  await k.keep('ada', 't', [entry(1, 4, { closure: 'theorem lemma_1 (a : ℕ) : a + 1 = 1 + a := by\n  omega' })]);
  await k.keep('ada', 't', [entry(1, 5, { closure: 'theorem lemma_1 (a : ℕ) : a + 1 = 1 + a := by\n  simp [Nat.add_comm]' })]);
  let row = (await raw.query<{ entry: { closure: string }; stars: number }>('SELECT entry, stars FROM leak_memory_kept')).rows[0];
  assert.equal(row.stars, 5);
  assert.match(row.entry.closure, /simp/);
  await k.setShare('ada', true);
  await k.markSubmitted('ada', 't', [entry(1, 5).id], HASH);
  assert.equal(await k.keep('ada', 't', [entry(1, 5, { closure: 'theorem lemma_1 (a : ℕ) : a + 1 = 1 + a := by\n  ring' })]), 0, 'submitted: what the intake saw stays');
  row = (await raw.query<{ entry: { closure: string }; stars: number }>('SELECT entry, stars FROM leak_memory_kept')).rows[0];
  assert.match(row.entry.closure, /simp/);
});

test('what one account may keep is bounded, per target and in all, and a theorem already kept still updates', async () => {
  const { k } = await setup({ perTarget: 2, perAccount: 3 });
  assert.equal(await k.keep('ada', 'a', [1, 2, 3].map((n) => entry(n, 5))), 2);
  assert.equal(await k.keep('ada', 'b', [4, 5, 6].map((n) => entry(n, 5))), 1, 'the account-wide cap');
  assert.equal(await k.keep('ada', 'a', [entry(1, 5, { name: 'renamed' })]), 1, 'an update is not a new row');
  assert.equal(await k.keep('bob', 'a', [1, 2].map((n) => entry(n, 5))), 2, 'another account has its own');
});

test('the intake is offered only what accounts that share have kept, ten to a bundle, best rated first, and never twice', async () => {
  const { k } = await setup();
  await k.keep('ada', 't', Array.from({ length: 14 }, (_, i) => entry(i + 1, i === 12 ? 5 : 4)));
  await k.keep('bob', 't', [entry(30, 5)]);
  assert.deepEqual(await k.candidates(20, ALLOW), [], 'nobody shares yet');
  await k.setShare('ada', true);
  let c = await k.candidates(20, ALLOW);
  assert.equal(c.length, 1);
  assert.deepEqual([c[0].username, c[0].target], ['ada', 't']);
  assert.equal(c[0].entries.length, MAX_PER_BUNDLE);
  assert.equal(c[0].entries[0].name, 'lemma_13', 'the five-star one first');
  const ids = c[0].entries.map((e) => e.id);
  assert.equal(await k.markSubmitted('ada', 't', ids, HASH), 10);
  c = await k.candidates(20, ALLOW);
  assert.equal(c[0].entries.length, 4, 'the next bundle is the rest');
  assert.ok(!c[0].entries.some((e) => ids.includes(e.id)), 'nothing is offered twice');
  await k.setShare('ada', false);
  assert.deepEqual(await k.candidates(20, ALLOW), [], 'turning sharing off takes the waiting ones out of the queue');
  assert.equal(await k.getShare('ada'), false);
  assert.equal(await k.getShare('nobody'), false, 'off unless the account turned it on');
});

test('marks touch only the account and target they name, only what is still waiting, and only once', async () => {
  const { k } = await setup();
  await k.keep('ada', 't', [entry(1, 5)]);
  await k.keep('bob', 't', [entry(1, 5)]);
  await k.keep('ada', 'other', [entry(1, 5)]);
  const id = entry(1, 5).id;
  assert.equal(await k.markSubmitted('ada', 't', [id], HASH), 1);
  assert.equal(await k.markSubmitted('ada', 't', [id], 'b'.repeat(64)), 0, 'a repeated mark changes nothing');
  assert.deepEqual(await k.summary('bob', 't'), { kept: 1, submitted: 0 }, "bob's is not ada's");
  assert.deepEqual(await k.summary('ada', 'other'), { kept: 1, submitted: 0 }, 'nor another target');
  assert.equal(await k.markSubmitted('carol', 't', [id], HASH), 0, 'an account with nothing kept');
  assert.equal(await k.markSubmitted('ada', 't', [], HASH), 0);
});

test('the number of bundles in one answer is bounded', async () => {
  const { k } = await setup();
  for (const u of ['a1', 'a2', 'a3']) {
    await k.keep(u, 't', [entry(1, 5)]);
    await k.setShare(u, true);
  }
  assert.equal((await k.candidates(2, ALLOW)).length, 2);
  assert.equal((await k.candidates(20, ALLOW)).length, 3);
});

test('creating the tables twice is harmless', async () => {
  const { k } = await setup();
  await k.ensure();
  await k.ensure();
  assert.deepEqual(await k.summary('x', 'y'), { kept: 0, submitted: 0 });
});

test('only the accounts the owner lists can be offered to the intake, and an empty list offers nobody', async () => {
  const { k } = await setup();
  await k.keep('ada', 't', [entry(1, 5)]);
  await k.keep('bob', 't', [entry(2, 5)]);
  await k.setShare('ada', true);
  await k.setShare('bob', true);
  assert.deepEqual((await k.candidates(20, new Set(['ada']))).map((c) => c.username), ['ada'], 'bob shares, but is not listed');
  assert.deepEqual(await k.candidates(20, new Set()), [], 'no list: nobody');
  assert.deepEqual(await k.candidates(20), [], 'and no argument is the same as no list');
  assert.deepEqual((await k.candidates(1, new Set(['bob', 'ada']))).length, 1, 'the cap counts only listed accounts');
});

test('the allow-list is read from the host setting: comma separated, trimmed, exact, empty by default', () => {
  assert.deepEqual([...intakeAccounts({})], []);
  assert.deepEqual([...intakeAccounts({ LEAK_INTAKE_ACCOUNTS: '' })], []);
  assert.deepEqual([...intakeAccounts({ LEAK_INTAKE_ACCOUNTS: ' mikael , ,ada,' })].sort(), ['ada', 'mikael']);
  assert.equal(intakeAccounts({ LEAK_INTAKE_ACCOUNTS: 'mikael' }).has('Mikael'), false, 'case counts');
});
