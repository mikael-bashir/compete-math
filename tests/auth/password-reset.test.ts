import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  RESET_COOLDOWN_SECONDS,
  RESET_TTL_MS,
  ensureResetTable,
  hashToken,
  requestPasswordReset,
  resetPassword,
  resetMessage,
  sqlResetStore,
  type ResetDeps,
} from "../../src/app/lib/auth/password-reset-core";
import type { EmailMessage } from "../../src/app/lib/email/mailjet";
import { ensureVerificationTables } from "../../src/app/lib/email/verification-core";
import { newDatabase } from "../helpers/pglite";

async function setup() {
  const d = await newDatabase();
  await ensureResetTable(d.db);
  await ensureVerificationTables(d.db);
  const sent: EmailMessage[] = [];
  let n = 0;
  const deps: ResetDeps = {
    store: sqlResetStore(d.db),
    send: async (m) => (sent.push(m), { ok: true }),
    hash: (pw) => bcrypt.hash(pw, 4),
    siteUrl: "https://competemath.com/",
    token: () => `token-${++n}`,
  };
  return { ...d, sent, deps };
}
const linkOf = (m: EmailMessage) => /https:\/\/\S+/.exec(m.text ?? "")![0];

test("asking for a reset emails a link to the account's address, with a token that is not stored", async () => {
  const s = await setup();
  await s.addUser("ada", "ada@example.org");
  await requestPasswordReset("ada@example.org", s.deps);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].to, "ada@example.org");
  assert.equal(s.sent[0].subject, "Reset your CompeteMath password");
  assert.equal(linkOf(s.sent[0]), "https://competemath.com/auth/reset?token=token-1");
  const rows = (await s.raw.query<{ token_hash: string }>("SELECT token_hash FROM password_reset_tokens")).rows;
  assert.deepEqual(rows.map((r) => r.token_hash), [hashToken("token-1")]);
  assert.equal(JSON.stringify(rows).includes("token-1"), false); // only the SHA-256 is kept
});

test("the same address in another case finds the account", async () => {
  const s = await setup();
  await s.addUser("ada", "Ada@Example.org");
  await requestPasswordReset("  ada@EXAMPLE.org ", s.deps);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].to, "Ada@Example.org");
});

test("an address with no account gets nothing, and the call resolves just the same", async () => {
  const s = await setup();
  await s.addUser("ada", "ada@example.org");
  assert.equal(await requestPasswordReset("nobody@example.org", s.deps), undefined);
  assert.equal(await requestPasswordReset("", s.deps), undefined);
  assert.equal(await requestPasswordReset("x".repeat(300), s.deps), undefined);
  assert.equal(s.sent.length, 0);
  assert.equal((await s.raw.query("SELECT 1 FROM password_reset_tokens")).rows.length, 0);
});

test("the mail goes out after the answer when it is deferred", async () => {
  const s = await setup();
  await s.addUser("ada", "ada@example.org");
  const jobs: (() => Promise<unknown>)[] = [];
  await requestPasswordReset("ada@example.org", { ...s.deps, defer: (job) => void jobs.push(job) });
  assert.equal(s.sent.length, 0); // answered, nothing sent yet
  await jobs[0]();
  assert.equal(s.sent.length, 1);
});

test("a second request inside the cooldown does nothing; after it, the new token replaces the old", async () => {
  const s = await setup();
  await s.addUser("ada", "ada@example.org");
  await requestPasswordReset("ada@example.org", s.deps);
  await requestPasswordReset("ada@example.org", s.deps);
  assert.equal(s.sent.length, 1);
  assert.ok(RESET_COOLDOWN_SECONDS >= 30);
  await s.raw.query("UPDATE password_reset_tokens SET created_at = now() - interval '10 minutes'");
  await requestPasswordReset("ada@example.org", s.deps);
  assert.equal(s.sent.length, 2);
  assert.equal((await s.raw.query("SELECT 1 FROM password_reset_tokens")).rows.length, 1); // one live token
  assert.equal((await resetPassword("token-1", "Brand new pass 1", s.deps)).status, "invalid"); // the older link is dead
  assert.equal((await resetPassword("token-2", "Brand new pass 1", s.deps)).status, "ok");
});

test("choosing a new password changes it, confirms the email, and the link works once", async () => {
  const s = await setup();
  const id = await s.addUser("ada", "ada@example.org", await bcrypt.hash("old password", 4));
  await requestPasswordReset("ada@example.org", s.deps);
  const result = await resetPassword("token-1", "A new passphrase 9", s.deps);
  assert.deepEqual(result, { status: "ok" });
  const user = (await s.raw.query<{ password_hash: string; email_verified: string | null }>("SELECT password_hash, email_verified FROM users WHERE id = $1", [id])).rows[0];
  assert.equal(await bcrypt.compare("A new passphrase 9", user.password_hash), true);
  assert.equal(await bcrypt.compare("old password", user.password_hash), false);
  assert.notEqual(user.email_verified, null); // the link proved they read that mailbox
  assert.deepEqual(await resetPassword("token-1", "Another passphrase 9", s.deps), { status: "invalid" });
});

test("a password that is too short or too long is refused without using up the link", async () => {
  const s = await setup();
  await s.addUser("ada", "ada@example.org");
  await requestPasswordReset("ada@example.org", s.deps);
  assert.equal((await resetPassword("token-1", "short", s.deps)).status, "weak");
  assert.equal((await resetPassword("token-1", "x".repeat(33), s.deps)).status, "weak");
  assert.equal((await resetPassword("token-1", "", s.deps)).status, "weak");
  assert.deepEqual(await resetPassword("token-1", "A long enough one", s.deps), { status: "ok" });
});

test("an expired link says so and changes nothing", async () => {
  const s = await setup();
  const id = await s.addUser("ada", "ada@example.org", "old-hash");
  const now = new Date();
  await requestPasswordReset("ada@example.org", { ...s.deps, now: () => new Date(now.getTime() - RESET_TTL_MS - 60_000) });
  assert.deepEqual(await resetPassword("token-1", "A long enough one", { ...s.deps, now: () => now }), { status: "expired" });
  assert.equal((await s.raw.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [id])).rows[0].password_hash, "old-hash");
});

test("a made-up or empty token is invalid", async () => {
  const s = await setup();
  assert.deepEqual(await resetPassword("made-up", "A long enough one", s.deps), { status: "invalid" });
  assert.deepEqual(await resetPassword("", "A long enough one", s.deps), { status: "invalid" });
});

test("one person's link cannot change another person's password", async () => {
  const s = await setup();
  const ada = await s.addUser("ada", "ada@example.org", "ada-old");
  const bob = await s.addUser("bob", "bob@example.org", "bob-old");
  await requestPasswordReset("ada@example.org", s.deps);
  await resetPassword("token-1", "A long enough one", s.deps);
  const hashes = Object.fromEntries((await s.raw.query<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users")).rows.map((r) => [r.id, r.password_hash]));
  assert.notEqual(hashes[ada], "ada-old");
  assert.equal(hashes[bob], "bob-old");
});

test("a failing mail provider does not break the request", async () => {
  const s = await setup();
  await s.addUser("ada", "ada@example.org");
  await requestPasswordReset("ada@example.org", { ...s.deps, send: async () => ({ ok: false }) });
  assert.equal((await s.raw.query("SELECT 1 FROM password_reset_tokens")).rows.length, 1);
});

test("the email says what it is, links the reset page and promises one use and an hour", () => {
  const m = resetMessage("ada@example.org", "https://competemath.com/auth/reset?token=abc");
  assert.ok(m.html.includes("https://competemath.com/auth/reset?token=abc"));
  assert.ok(m.text?.includes("works once and expires in 1 hour"));
  assert.ok(m.text?.includes("your password has not changed"));
});
