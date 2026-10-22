import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { cleanEntry, leakMemoryStore } from '../../src/app/lib/leak-memory/memory-core';
import { asSqlTag } from '../helpers/pglite';

// The per-account memory against a real Postgres. The promise it has to keep: what one account saved for a target is invisible to every
// other account, and nothing but the account's own nominations can leave its rows.

const entry = (n: number, extra: Record<string, unknown> = {}) => ({
  id: n.toString(16).padStart(40, 'a'),
  name: `lemma_${n}`,
  statement: `theorem lemma_${n} (a : ℕ) : a + ${n} = ${n} + a`,
  closure: `theorem lemma_${n} (a : ℕ) : a + ${n} = ${n} + a := by\n  omega`,
  origin: 'verified',
  savedAt: `2026-10-18T00:00:${String(n % 60).padStart(2, '0')}Z`,
  attempt: 1,
  isTarget: false,
  nominated: false,
  subsumes: [],
  subsumedBy: null,
  hits: 0,
  ...extra,
});

async function store(limits = {}) {
  const raw = new PGlite();
  return { raw, s: leakMemoryStore(asSqlTag(raw), limits) };
}

test('one account never sees, changes or deletes another account\'s memory for the same target', async () => {
  const { s } = await store();
  await s.save('ada', 'erdos-396', [entry(1), entry(2)]);
  await s.save('bob', 'erdos-396', [entry(2, { closure: 'theorem lemma_2 (a : ℕ) : a + 2 = 2 + a := by\n  simp [add_comm]' })]);
  assert.deepEqual((await s.list('ada', 'erdos-396')).map((e) => e.name).sort(), ['lemma_1', 'lemma_2']);
  assert.deepEqual((await s.list('bob', 'erdos-396')).map((e) => e.name), ['lemma_2']);
  assert.deepEqual(await s.list('carol', 'erdos-396'), []);
  // the same statement, saved by both, is two rows with their own proofs
  assert.match((await s.list('bob', 'erdos-396'))[0].closure, /simp \[add_comm\]/);
  assert.match((await s.list('ada', 'erdos-396')).find((e) => e.name === 'lemma_2')!.closure, /omega/);
  // nominating and deleting are the account's own
  assert.equal((await s.setNominated('bob', 'erdos-396', entry(1).id, true)).ok, false, 'bob cannot nominate what only ada has');
  assert.equal(await s.remove('bob', 'erdos-396', entry(1).id), false, 'bob cannot delete ada\'s entry');
  assert.equal((await s.setNominated('ada', 'erdos-396', entry(2).id, true)).ok, true);
  assert.equal((await s.list('bob', 'erdos-396'))[0].nominated, false, 'ada\'s nomination is not bob\'s');
  assert.equal(await s.remove('ada', 'erdos-396', entry(2).id), true);
  assert.equal((await s.list('bob', 'erdos-396')).length, 1, 'bob still has his');
});

test('targets do not mix, and a username is matched exactly (case and wildcard characters included)', async () => {
  const { s } = await store();
  await s.save('ada', 'erdos-396', [entry(1)]);
  await s.save('ada', 'other-target', [entry(2)]);
  assert.deepEqual((await s.list('ada', 'erdos-396')).map((e) => e.name), ['lemma_1']);
  assert.deepEqual((await s.list('ada', 'other-target')).map((e) => e.name), ['lemma_2']);
  for (const who of ['Ada', 'ada ', 'a%', '%', 'a_a', "ada' OR '1'='1"]) assert.deepEqual(await s.list(who, 'erdos-396'), [], `"${who}" must not match ada`);
});

test('saving again replaces the proof and keeps the nomination; the caller cannot set it', async () => {
  const { s } = await store();
  await s.save('ada', 't', [entry(1, { nominated: true })]);
  assert.equal((await s.list('ada', 't'))[0].nominated, false, 'a nominated flag in the payload is ignored');
  await s.setNominated('ada', 't', entry(1).id, true);
  await s.save('ada', 't', [entry(1, { closure: 'theorem lemma_1 (a : ℕ) : a + 1 = 1 + a := by\n  exact Nat.add_comm a 1' })]);
  const [e] = await s.list('ada', 't');
  assert.match(e.closure, /Nat\.add_comm/);
  assert.equal(e.nominated, true);
  assert.equal((await s.list('ada', 't')).length, 1);
});

test('at most ten theorems can be nominated per target, un-nominating frees a place, and a second target has its own ten', async () => {
  const { s } = await store();
  await s.save('ada', 't', Array.from({ length: 12 }, (_, i) => entry(i + 1)));
  for (let i = 1; i <= 10; i++) assert.equal((await s.setNominated('ada', 't', entry(i).id, true)).ok, true, `nominate ${i}`);
  const eleventh = await s.setNominated('ada', 't', entry(11).id, true);
  assert.equal(eleventh.ok, false);
  assert.match(eleventh.reason!, /At most 10/);
  assert.equal(eleventh.nominated, 10);
  assert.equal((await s.setNominated('ada', 't', entry(3).id, true)).ok, true, 're-nominating one that is already nominated is fine');
  assert.equal((await s.setNominated('ada', 't', entry(1).id, false)).nominated, 9);
  assert.equal((await s.setNominated('ada', 't', entry(11).id, true)).ok, true);
  await s.save('ada', 'u', [entry(1)]);
  assert.equal((await s.setNominated('ada', 'u', entry(1).id, true)).ok, true);
});

test('nominating at the same moment cannot exceed the cap', async () => {
  const { s } = await store({ nominated: 3 });
  await s.save('ada', 't', Array.from({ length: 8 }, (_, i) => entry(i + 1)));
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => s.setNominated('ada', 't', entry(i + 1).id, true)));
  assert.equal(results.filter((r) => r.ok).length, 3);
  assert.equal((await s.list('ada', 't')).filter((e) => e.nominated).length, 3);
});

test('the per-target and per-account limits stop new rows but still let existing ones update', async () => {
  const { s } = await store({ perTarget: 3, perAccount: 5 });
  assert.deepEqual(await s.save('ada', 'a', [1, 2, 3, 4, 5].map((n) => entry(n))), { saved: 3, skipped: 2 });
  assert.equal((await s.save('ada', 'a', [entry(1, { hits: 7 })])).saved, 1, 'updating a stored entry is not a new row');
  assert.deepEqual(await s.save('ada', 'b', [10, 11, 12].map((n) => entry(n))), { saved: 2, skipped: 1 }, 'the account-wide cap');
  assert.deepEqual(await s.save('bob', 'a', [1, 2, 3].map((n) => entry(n))), { saved: 3, skipped: 0 }, 'another account has its own budget');
});

test('nothing unproved, malformed or foreign is stored', async () => {
  const { s } = await store();
  const bad = [
    entry(1, { closure: 'theorem x : True := by\n  sorry' }),
    entry(2, { closure: 'theorem x : True := by\n  admit' }),
    entry(3, { id: 'not-hex' }),
    entry(4, { closure: '' }),
    entry(5, { origin: 'seed' }),
    entry(6, { origin: 'something-else' }),
    entry(7, { closure: 'x'.repeat(60_001) }),
    null,
    'a string',
  ];
  assert.deepEqual(await s.save('ada', 't', [...bad, entry(8)]), { saved: 1, skipped: bad.length });
  assert.deepEqual((await s.list('ada', 't')).map((e) => e.name), ['lemma_8']);
  assert.equal(cleanEntry(entry(9, { subsumes: ['abcdef12', 'nope'], subsumedBy: 'zzz' }))!.subsumedBy, null);
  assert.deepEqual(cleanEntry(entry(9, { subsumes: ['abcdef12', 'nope'] }))!.subsumes, ['abcdef12']);
});

test('creating the table twice is harmless', async () => {
  const { s, raw } = await store();
  await s.ensure();
  await s.ensure();
  const again = leakMemoryStore(asSqlTag(raw));
  await again.ensure();
  await again.save('ada', 't', [entry(1)]);
  assert.equal((await s.list('ada', 't')).length, 1);
});

// ---- a full target makes room instead of refusing, and clearing a target puts things away without deleting them ----------------------------

type RawRow = { entry_id: string; entry: Record<string, unknown> };
const rawRows = async (raw: PGlite, user: string, target: string): Promise<RawRow[]> =>
  (await raw.query<RawRow>('SELECT entry_id, entry FROM leak_memory WHERE username = $1 AND target_id = $2 ORDER BY entry_id', [user, target])).rows;

test('a full target puts away what is merged first, then what is rated low, and skips a new theorem only when nothing can be put away', async () => {
  const { raw, s } = await store({ perTarget: 3, perAccount: 100 });
  const merged = entry(1, { subsumedBy: entry(9).id });
  const low = entry(2, { quality: { s: 1, u: 0 } });
  const fine = entry(3, { quality: { s: 4, u: 2 } });
  assert.deepEqual(await s.save('ada', 't', [merged, low, fine]), { saved: 3, skipped: 0 });
  assert.deepEqual(await s.save('ada', 't', [entry(4)]), { saved: 1, skipped: 0 }, 'full, so the merged one is put away to make room');
  assert.deepEqual((await s.list('ada', 't')).map((e) => e.name).sort(), ['lemma_2', 'lemma_3', 'lemma_4']);
  assert.deepEqual(await s.save('ada', 't', [entry(5)]), { saved: 1, skipped: 0 }, 'then the one rated a single star');
  assert.deepEqual((await s.list('ada', 't')).map((e) => e.name).sort(), ['lemma_3', 'lemma_4', 'lemma_5']);
  assert.deepEqual(await s.save('ada', 't', [entry(6), entry(7)]), { saved: 0, skipped: 2 }, 'nothing left that can be put away: skipped, as before');
  // nothing was deleted: the two put away are still rows, as stubs
  const rows = await rawRows(raw, 'ada', 't');
  assert.equal(rows.length, 5);
  const stub = rows.find((r: RawRow) => r.entry_id === merged.id)!.entry as { closure: string; statement: string; subsumedBy: string; archived: { why: string } };
  assert.equal(stub.closure, '', 'the proof is dropped');
  assert.equal(stub.statement, merged.statement, 'the statement stays');
  assert.equal(stub.subsumedBy, merged.subsumedBy);
  assert.equal(stub.archived.why, 'made room');
  assert.equal((rows.find((r: RawRow) => r.entry_id === low.id)!.entry as { quality: { s: number } }).quality.s, 1, 'and so does the rating');
});

test('making room never takes a nominated theorem, the target\'s own proof, or a general lemma that stands in for others', async () => {
  const { s } = await store({ perTarget: 3, perAccount: 100 });
  const nominated = entry(1, { quality: { s: 1, u: 0 } });
  const target = entry(2, { isTarget: true, quality: { s: 1, u: 0 } });
  const general = entry(3, { origin: 'abstracted', subsumes: [entry(8).id], quality: { s: 2, u: 0 } });
  await s.save('ada', 't', [nominated, target, general]);
  assert.equal((await s.setNominated('ada', 't', nominated.id, true)).ok, true);
  assert.deepEqual(await s.save('ada', 't', [entry(4)]), { saved: 0, skipped: 1 });
  assert.equal((await s.list('ada', 't')).length, 3);
});

test('a put-away row is not listed and not counted, and the same statement saved again is live again', async () => {
  const { s } = await store({ perTarget: 2, perAccount: 100 });
  const old = entry(1, { subsumedBy: entry(9).id });
  await s.save('ada', 't', [old, entry(2)]);
  assert.equal((await s.save('ada', 't', [entry(3)])).saved, 1, 'the merged one is put away');
  assert.deepEqual((await s.list('ada', 't')).map((e) => e.name).sort(), ['lemma_2', 'lemma_3']);
  // the agent proves the put-away statement again: it comes back with its proof, and since the target is full again another row is put away
  assert.deepEqual(await s.save('ada', 't', [entry(1, { quality: { s: 1, u: 0 } })]), { saved: 0, skipped: 1 }, 'nothing can be put away now, so it is skipped rather than refused silently');
  assert.deepEqual(await s.save('ada', 't', [entry(2, { quality: { s: 1, u: 0 } })]), { saved: 1, skipped: 0 }, 'an update of a live row is never refused');
  assert.deepEqual(await s.save('ada', 't', [entry(1)]), { saved: 1, skipped: 0 }, 'now lemma_2 is rated low, so it makes the room');
  const live = (await s.list('ada', 't')).map((e) => e.name).sort();
  assert.deepEqual(live, ['lemma_1', 'lemma_3']);
  assert.match((await s.list('ada', 't')).find((e) => e.name === 'lemma_1')!.closure, /omega/, 'with its proof');
});

test('clearing a target puts everything away except the nominated theorems, deletes nothing, and touches no other target or account', async () => {
  const { raw, s } = await store();
  await s.save('ada', 't', [1, 2, 3, 4].map((n) => entry(n)));
  await s.save('ada', 'other', [entry(5)]);
  await s.save('bob', 't', [entry(1), entry(6)]);
  await s.setNominated('ada', 't', entry(2).id, true);
  assert.equal(await s.archiveAll('ada', 't'), 3);
  assert.deepEqual((await s.list('ada', 't')).map((e) => e.name), ['lemma_2'], 'the nominated one stays');
  assert.equal((await rawRows(raw, 'ada', 't')).length, 4, 'every row is still there');
  assert.equal((await s.list('ada', 'other')).length, 1);
  assert.equal((await s.list('bob', 't')).length, 2);
  assert.equal(await s.archiveAll('ada', 't'), 0, 'clearing twice puts nothing more away');
  // and a cleared library starts empty: new theorems are saved, and a put-away statement proved again is live again
  assert.deepEqual(await s.save('ada', 't', [entry(1), entry(7)]), { saved: 2, skipped: 0 });
  assert.deepEqual((await s.list('ada', 't')).map((e) => e.name).sort(), ['lemma_1', 'lemma_2', 'lemma_7']);
});

test('the limits are higher than they were, and count live rows only', async () => {
  const core = await import('../../src/app/lib/leak-memory/memory-core');
  assert.equal(core.MAX_ENTRIES_PER_TARGET, 1500, 'it was 600, and a full target refused new theorems without a word');
  assert.equal(core.MAX_ENTRIES_PER_ACCOUNT, 6000);
});
