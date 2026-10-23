import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { KEEP_AT, MAX_PER_BUNDLE, cleanReview, intakeAccounts, keptStore } from '../../src/app/lib/leak-memory/kept-core';
import type { Evidence, HarnessClaim } from '../../src/app/lib/leak-memory/harness';
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

// what the server saw of the harness with a theorem (harness.ts): good, or none; tests keep with good evidence unless they say otherwise
const GOOD = (): Evidence => ({
  at: '2026-10-23T10:00:00.000Z',
  ticket: { ok: true, ageMs: 3_600_000 },
  receipt: { ok: true, seconds: 3600, verifyOk: 60, verifyFail: 40, searches: 3, attempts: 4, model: 'm', strategy: 'control-lucid-iv' },
  build: { id: 'a'.repeat(64), text: 'x' },
});
const NONE = (): Evidence => ({ at: '2026-10-23T10:00:00.000Z', ticket: { ok: false, reason: 'no ticket' }, receipt: { ok: false, reason: 'no receipt' }, build: null });

async function setup(limits = {}) {
  const raw = new PGlite();
  const db = asSqlTag(raw);
  const k0 = keptStore(db, limits);
  const k = { ...k0, keep: (u: string, t: string, e: unknown[], ev: ((c: HarnessClaim | null) => Evidence) | undefined = GOOD) => k0.keep(u, t, e, ev) };
  return { raw, db, k, mem: leakMemoryStore(db) };
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

// ---- the harness evidence ------------------------------------------------------------------------------------------------------------------

test('a theorem is offered to the intake only with a ticket and a receipt that passed; one without is kept all the same', async () => {
  const { k } = await setup();
  await k.keep('ada', 't', [entry(1, 5)], NONE);
  await k.keep('ada', 't', [entry(2, 5)]);
  await k.setShare('ada', true);
  assert.deepEqual(await k.summary('ada', 't'), { kept: 2, submitted: 0 }, 'both are kept: nothing is lost for want of evidence');
  const c = await k.candidates(20, ALLOW);
  assert.deepEqual(c[0].entries.map((e) => e.name), ['lemma_2'], 'only the evidenced one is a candidate');
  assert.equal(c[0].entries[0].evidence.ticket.ok, true);
  assert.equal(c[0].entries[0].evidence.build?.id, 'a'.repeat(64));
  // a half-good record is not good: the ticket without the receipt
  const half = (): Evidence => ({ ...GOOD(), receipt: { ok: false, reason: 'too few verifications for a prover run' } });
  await k.keep('ada', 't', [entry(3, 5)], half);
  assert.equal((await k.candidates(20, ALLOW))[0].entries.length, 1);
});

test('the caller can refuse a candidate (an unknown build) and the cap counts only the accepted', async () => {
  const { k } = await setup();
  const many = Array.from({ length: 14 }, (_, i) => entry(i + 1, 4));
  await k.keep('ada', 't', many);
  await k.setShare('ada', true);
  const refuseOdd = async (ev: Evidence) => ev.build?.id === 'a'.repeat(64) && ev.at === GOOD().at;
  assert.equal((await k.candidates(20, ALLOW, refuseOdd))[0].entries.length, MAX_PER_BUNDLE);
  assert.deepEqual(await k.candidates(20, ALLOW, async () => false), [], 'refused all: nothing offered');
});

test('a later save without good evidence never replaces evidence that was good, and a later good one replaces a bad', async () => {
  const { raw, k } = await setup();
  await k.keep('ada', 't', [entry(1, 4)]);
  await k.keep('ada', 't', [entry(1, 5)], NONE); // e.g. a rating update from an older bridge
  let row = (await raw.query<{ evidence: Evidence; stars: number }>('SELECT evidence, stars FROM leak_memory_kept')).rows[0];
  assert.equal(row.stars, 5, 'the new rating is kept');
  assert.equal(row.evidence.ticket.ok, true, 'the good evidence stays');
  await k.keep('ada', 't', [entry(2, 4)], NONE);
  await k.keep('ada', 't', [entry(2, 4)]);
  row = (await raw.query<{ evidence: Evidence; stars: number }>("SELECT evidence, stars FROM leak_memory_kept WHERE entry_id = $1", [entry(2, 4).id])).rows[0];
  assert.equal(row.evidence.ticket.ok, true, 'a good claim replaces a bad one');
});

test('the evaluator sees what the client claimed, cleaned, and nothing the client sent outside it reaches the row', async () => {
  const { raw, k } = await setup();
  const seen: (HarnessClaim | null)[] = [];
  const spy = (c: HarnessClaim | null) => (seen.push(c), GOOD());
  const e = { ...entry(1, 5), harness: { ticket: 'v1.abc.' + 'd'.repeat(30), receipt: { seconds: 4000, verifyOk: 5, verifyFail: 5, searches: 1, attempts: 2, model: 'm', strategy: 'control-lucid', extra: 'x'.repeat(5000) }, junk: 1 } };
  await k.keep('ada', 't', [e], spy);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.ticket, e.harness.ticket);
  assert.ok(!('extra' in (seen[0]?.receipt ?? {})) && !('junk' in (seen[0] ?? {})), 'cleaned to the fields it may have');
  const row = (await raw.query<{ entry: Record<string, unknown> }>('SELECT entry FROM leak_memory_kept')).rows[0];
  assert.ok(!('harness' in row.entry), 'the theorem row holds the theorem, not the claim');
  await k.keep('ada', 't', [entry(2, 5), { ...entry(3, 5), harness: 'not an object' }], spy);
  assert.equal(seen.length, 3);
  assert.equal(seen[1], null);
  assert.equal(seen[2], null);
});

// ---- a code owner's decisions on a submitted bundle ----------------------------------------------------------------------------------------

const B1 = '1'.repeat(64);
const B2 = '2'.repeat(64);
const idOf = (n: number) => entry(n, 4).id;

/** theorems 1, 2, 3 of ada's target `t`, kept, shared and put into the bundle B1 */
async function submitted(k: Awaited<ReturnType<typeof setup>>['k']) {
  await k.keep('ada', 't', [entry(1, 4), entry(2, 4), entry(3, 5)]);
  await k.setShare('ada', true);
  assert.equal(await k.markSubmitted('ada', 't', [idOf(1), idOf(2), idOf(3)], B1), 3);
}
const review = (over: Record<string, unknown> = {}) => ({ username: 'ada', target: 't', bundle: B1, returned: [], rejected: [], accepted: [], ...over }) as Parameters<ReturnType<typeof keptStore>['review']>[0];
const rowOf = async (raw: Awaited<ReturnType<typeof setup>>['raw'], n: number) =>
  (await raw.query<{ submitted_at: string | null; bundle: string | null; review_state: string | null; review_code: string | null }>(
    'SELECT submitted_at, bundle, review_state, review_code FROM leak_memory_kept WHERE entry_id = $1', [idOf(n)])).rows[0];

test('a review holds the decided theorems and frees the others, and only the others', async () => {
  const { raw, k } = await setup();
  await submitted(k);
  const r = await k.review(review({ returned: [{ id: idOf(1), code: 'merit' }], rejected: [{ id: idOf(2), code: 'hygiene' }], accepted: [idOf(3)] }));
  assert.deepEqual(r, { held: 2, freed: 1 });
  assert.deepEqual([await rowOf(raw, 1), await rowOf(raw, 2)].map((x) => [x.review_state, x.review_code, x.bundle !== null, x.submitted_at !== null]), [['returned', 'merit', true, true], ['rejected', 'hygiene', true, true]], 'held: still marked, with the verdict');
  assert.deepEqual(await rowOf(raw, 3), { submitted_at: null, bundle: null, review_state: null, review_code: null }, 'freed: waiting again');
  // the decided theorems are not offered, the freed one is
  assert.deepEqual((await k.candidates(20, ALLOW))[0].entries.map((e) => e.name), ['lemma_3']);
});

test('a decided theorem is never freed, even when a report names it as accepted', async () => {
  const { raw, k } = await setup();
  await submitted(k);
  await k.review(review({ returned: [{ id: idOf(1), code: 'merit' }] }));
  assert.equal((await k.review(review({ accepted: [idOf(1), idOf(2)] }))).freed, 1, 'only the undecided one');
  assert.equal((await rowOf(raw, 1)).review_state, 'returned');
});

test('a report is about one bundle: another bundle, another account or the same report again changes nothing', async () => {
  const { raw, k } = await setup();
  await submitted(k);
  const dud = [
    review({ bundle: B2, returned: [{ id: idOf(1), code: 'merit' }], accepted: [idOf(3)] }), // a bundle they are not in
    review({ username: 'bob', returned: [{ id: idOf(1), code: 'merit' }], accepted: [idOf(3)] }), // someone else's rows
    review({ target: 'other', returned: [{ id: idOf(1), code: 'merit' }], accepted: [idOf(3)] }),
  ];
  for (const d of dud) assert.deepEqual(await k.review(d), { held: 0, freed: 0 });
  assert.deepEqual((await rowOf(raw, 1)).review_state, null);
  const real = review({ returned: [{ id: idOf(1), code: 'merit' }], accepted: [idOf(3)] });
  assert.deepEqual(await k.review(real), { held: 1, freed: 1 });
  assert.deepEqual(await k.review(real), { held: 1, freed: 0 }, 'again: the freed one is already free, the verdict is the same');
  // the freed theorem goes into a new bundle; the old pull request is reported once more: it must not free it from there
  assert.equal(await k.markSubmitted('ada', 't', [idOf(3)], B2), 1);
  assert.deepEqual(await k.review(real), { held: 1, freed: 0 });
  assert.equal((await rowOf(raw, 3)).bundle, B2);
});

test('the latest decision of a held theorem is the one that stands', async () => {
  const { raw, k } = await setup();
  await submitted(k);
  await k.review(review({ returned: [{ id: idOf(1), code: 'merit' }] }));
  await k.review(review({ rejected: [{ id: idOf(1), code: 'scope' }] }));
  assert.deepEqual([(await rowOf(raw, 1)).review_state, (await rowOf(raw, 1)).review_code], ['rejected', 'scope']);
});

test('a returned theorem comes back when its text changed; a rejected one, an unchanged one and one still waiting in a pull request do not', async () => {
  const { raw, k } = await setup();
  await submitted(k);
  await k.review(review({ returned: [{ id: idOf(1), code: 'merit' }, { id: idOf(2), code: 'naming' }], rejected: [{ id: idOf(3), code: 'hygiene' }] }));
  assert.deepEqual(await k.candidates(20, ALLOW), [], 'all three are held');
  // the same text saved again (a rating written again): nothing comes back
  assert.equal(await k.keep('ada', 't', [entry(1, 4), entry(2, 5), entry(3, 5)]), 0);
  assert.deepEqual(await k.candidates(20, ALLOW), []);
  // theorem 1: a better proof of the same statement (the id is the hash of the statement, so it is the same id)
  assert.equal(await k.keep('ada', 't', [entry(1, 5, { closure: 'theorem lemma_1 (a : ℕ) : a + 1 = 1 + a := by\n  simp [Nat.add_comm]' })]), 1);
  // theorem 2: only the name changed; theorem 3 (rejected): a new proof
  assert.equal(await k.keep('ada', 't', [entry(2, 4, { name: 'add_two_comm' }), entry(3, 5, { closure: 'theorem lemma_3 (a : ℕ) : a + 3 = 3 + a := by\n  omega -- new' })]), 1);
  const c = (await k.candidates(20, ALLOW))[0].entries;
  assert.deepEqual(c.map((e) => e.name).sort(), ['add_two_comm', 'lemma_1']);
  assert.match(c.find((e) => e.name === 'lemma_1')!.closure, /simp \[Nat\.add_comm\]/, 'the new text replaced the held one');
  assert.deepEqual(await rowOf(raw, 1), { submitted_at: null, bundle: null, review_state: null, review_code: null }, 'and the verdict is cleared with it');
  assert.equal((await rowOf(raw, 3)).review_state, 'rejected');
  assert.match((await raw.query<{ entry: { closure: string } }>('SELECT entry FROM leak_memory_kept WHERE entry_id = $1', [idOf(3)])).rows[0].entry.closure, /omega\s*$/, 'a rejected theorem keeps the text that was judged');
});

test('a theorem waiting in an open pull request is not replaced by a later save (what was judged is what the intake saw)', async () => {
  const { raw, k } = await setup();
  await submitted(k);
  assert.equal(await k.keep('ada', 't', [entry(1, 5, { closure: 'theorem lemma_1 (a : ℕ) : a + 1 = 1 + a := by\n  simp [Nat.add_comm]' })]), 0);
  assert.equal((await rowOf(raw, 1)).bundle, B1);
});

test('cleanReview drops what the grammar does not have and keeps the rest', () => {
  const good = { username: 'ada', target: 'erdos-396', bundle: B1, returned: [{ id: idOf(1), code: 'merit' }], rejected: [{ id: idOf(2), code: 'scope' }], accepted: [idOf(3)] };
  assert.deepEqual(cleanReview(good), good);
  for (const bad of [null, 'x', { ...good, username: '' }, { ...good, target: 'No Target' }, { ...good, bundle: 'abc' }, { ...good, bundle: 'G'.repeat(64) }]) assert.equal(cleanReview(bad), null, JSON.stringify(bad));
  const r = cleanReview({
    ...good,
    returned: [{ id: idOf(1), code: 'hygiene' }, { id: idOf(1), code: 'nonsense' }, { id: 'zz', code: 'merit' }, { id: idOf(4), code: 'docs' }, 'x', null], // a reject code in a return, an unknown code, a bad id
    rejected: [{ id: idOf(2), code: 'merit' }, { id: idOf(5), code: 'report' }],
    accepted: [idOf(3), 'not hex', 7],
  })!;
  assert.deepEqual(r.returned, [{ id: idOf(4), code: 'docs' }]);
  assert.deepEqual(r.rejected, [{ id: idOf(5), code: 'report' }]);
  assert.deepEqual(r.accepted, [idOf(3)]);
  assert.equal(cleanReview({ ...good, returned: Array.from({ length: 30 }, () => ({ id: idOf(1), code: 'merit' })) })!.returned.length, 10, 'a bundle has at most ten theorems');
});

test('reviewAll applies the reviews of the accounts the owner lists and drops the rest', async () => {
  const { k } = await setup();
  await submitted(k);
  const out = await k.reviewAll([review({ returned: [{ id: idOf(1), code: 'merit' }] }), review({ username: 'mallory', returned: [{ id: idOf(2), code: 'merit' }] }), { junk: true }], new Set(['ada']));
  assert.deepEqual(out, { held: 1, freed: 0, dropped: 2 });
  assert.deepEqual(await k.reviewAll([review({ accepted: [idOf(3)] })], new Set()), { held: 0, freed: 0, dropped: 1 }, 'no list: nobody');
});
