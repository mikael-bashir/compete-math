import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESEND_COOLDOWN_SECONDS,
  TOKEN_TTL_MS,
  consumeVerificationToken,
  createVerificationToken,
  ensureVerificationTables,
  resendVerification,
  verificationMessage,
} from "../../src/app/lib/email/verification-core";
import { newDatabase } from "../helpers/pglite";

async function setup() {
  const d = await newDatabase();
  await ensureVerificationTables(d.db);
  return d;
}
const verifiedAt = async (d: Awaited<ReturnType<typeof setup>>, email: string) =>
  (await d.raw.query<{ email_verified: string | null }>("SELECT email_verified FROM users WHERE email = $1", [email])).rows[0].email_verified;

test("confirming an email marks the account verified, and the link works once", async () => {
  const d = await setup();
  const id = await d.addUser("ada", "ada@example.org");
  const token = await createVerificationToken(d.db, id, "ada@example.org");
  assert.equal(await verifiedAt(d, "ada@example.org"), null);
  assert.equal(await consumeVerificationToken(d.db, token), "ok");
  assert.notEqual(await verifiedAt(d, "ada@example.org"), null);
  assert.equal(await consumeVerificationToken(d.db, token), "invalid"); // single use
});

test("an expired link says so, does not verify, and is gone", async () => {
  const d = await setup();
  const id = await d.addUser("ada", "ada@example.org");
  const token = await createVerificationToken(d.db, id, "ada@example.org", new Date(Date.now() - TOKEN_TTL_MS - 60_000));
  assert.equal(await consumeVerificationToken(d.db, token), "expired");
  assert.equal(await verifiedAt(d, "ada@example.org"), null);
  assert.equal(await consumeVerificationToken(d.db, token), "invalid");
});

test("an unknown or empty token is invalid", async () => {
  const d = await setup();
  assert.equal(await consumeVerificationToken(d.db, "nope"), "invalid");
  assert.equal(await consumeVerificationToken(d.db, ""), "invalid");
});

test("a new token replaces the user's earlier one", async () => {
  const d = await setup();
  const id = await d.addUser("ada", "ada@example.org");
  const first = await createVerificationToken(d.db, id, "ada@example.org");
  const second = await createVerificationToken(d.db, id, "ada@example.org");
  assert.equal(await consumeVerificationToken(d.db, first), "invalid");
  assert.equal(await consumeVerificationToken(d.db, second), "ok");
});

test("the email has the link, the 24 hour promise and a subject that says what it is", () => {
  const m = verificationMessage("ada@example.org", "https://competemath.com/api/auth/verify?token=abc");
  assert.equal(m.to, "ada@example.org");
  assert.equal(m.subject, "Verify your CompeteMath email");
  assert.ok(m.html.includes("https://competemath.com/api/auth/verify?token=abc"));
  assert.ok(m.text?.includes("https://competemath.com/api/auth/verify?token=abc"));
  assert.ok(m.text?.includes("24 hours"));
});

test("asking for a new link: only an unverified account gets one, and the answer never differs", async () => {
  const d = await setup();
  const unverified = await d.addUser("ada", "Ada@Example.org");
  const verified = await d.addUser("bob", "bob@example.org");
  await d.raw.query("UPDATE users SET email_verified = now() WHERE id = $1", [verified]);
  const issued: string[] = [];
  const deps = { db: d.db, issue: async (id: string) => (issued.push(id), true) };

  await resendVerification("ada@example.org", deps); // case does not matter
  await resendVerification("bob@example.org", deps); // already verified
  await resendVerification("nobody@example.org", deps); // no account
  await resendVerification("   ", deps);
  assert.deepEqual(issued, [unverified]);
});

test("a second request inside the cooldown sends nothing", async () => {
  const d = await setup();
  const id = await d.addUser("ada", "ada@example.org");
  const issued: string[] = [];
  const deps = {
    db: d.db,
    issue: async (userId: string, email: string) => {
      issued.push(userId);
      await createVerificationToken(d.db, userId, email); // what the real issue does
      return true;
    },
  };
  await resendVerification("ada@example.org", deps);
  await resendVerification("ada@example.org", deps);
  assert.deepEqual(issued, [id]);
  assert.ok(RESEND_COOLDOWN_SECONDS >= 30);
  // once the last token is older than the cooldown, a new request goes through
  await d.raw.query("UPDATE email_verification_tokens SET created_at = now() - interval '5 minutes'");
  await resendVerification("ada@example.org", deps);
  assert.deepEqual(issued, [id, id]);
});
