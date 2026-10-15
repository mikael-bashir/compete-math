import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_NOTE,
  MONEY_NOTE,
  PER_ADDRESS_LIMIT,
  QUESTIONS,
  applicantMessage,
  ensureJoinTable,
  hashAddress,
  ownerMessage,
  sqlJoinStore,
  submitApplication,
  validateApplication,
  type JoinDeps,
} from "../../src/app/lib/join/join-core";
import type { EmailMessage } from "../../src/app/lib/email/mailjet";
import { newDatabase } from "../helpers/pglite";

const good = { github: "ada-lovelace", sixMonths: "Ship the proofs we promised.", fiveYears: "Mathematics people trust, built by people I respect." };

async function setup(sendOk: (m: EmailMessage) => boolean = () => true) {
  const d = await newDatabase();
  await ensureJoinTable(d.db);
  const sent: EmailMessage[] = [];
  const deps: JoinDeps = {
    store: sqlJoinStore(d.db),
    send: async (m) => {
      sent.push(m);
      return { ok: sendOk(m) };
    },
    ownerEmail: "bashir.mikael@outlook.com",
  };
  return { ...d, sent, deps };
}
const ip = hashAddress("203.0.113.7", "salt");

test("the form asks exactly the questions it was given, with their notes", () => {
  assert.equal(QUESTIONS.email, "What is your email (optional)?");
  assert.equal(
    EMAIL_NOTE,
    "We will use this email if it is different to your account email, or if you are not logged in. If you don't put an email and are not logged in, Github will notify your linked email.",
  );
  assert.equal(QUESTIONS.sixMonths, "What would need to occur over the next 6 months for you to be pleased with yourself?");
  assert.equal(QUESTIONS.fiveYears, "What would need to occur over the next 5 years for you to be pleased with yourself?");
  assert.equal(MONEY_NOTE, "Exclude all monetary gains or financial targets. If your ambition naturally involves money, state what remains once the money is removed.");
});

test("a GitHub username is checked by GitHub's own rule", () => {
  const ok = (github: string) => validateApplication({ ...good, github }).ok;
  for (const name of ["a", "ada", "ada-lovelace", "A1", "0xdead", "x".repeat(39), "@ada"]) assert.equal(ok(name), true, name);
  for (const name of ["", "-ada", "ada-", "ad--a", "ad a", "ada!", "x".repeat(40), "ada/../x", "a@b.c", "<script>"]) assert.equal(ok(name), false, name);
  const v = validateApplication({ ...good, github: "@ada" });
  assert.equal(v.ok && v.value.github, "ada"); // the @ is dropped
});

test("the email is optional, but a typo is turned away", () => {
  const ok = (email: string | undefined) => validateApplication({ ...good, email }).ok;
  for (const e of [undefined, "", "   ", "ada@example.org", "ada.l+org@sub.example.co.uk"]) assert.equal(ok(e), true, String(e));
  for (const e of ["ada", "ada@", "@example.org", "ada@example", "a b@example.org", "ada@@example.org", "<a>@x.org", `${"x".repeat(250)}@e.org`]) assert.equal(ok(e), false, e);
  const none = validateApplication({ ...good, email: "  " });
  assert.equal(none.ok && "email" in none.value, false);
  const some = validateApplication({ ...good, email: " ada@example.org " });
  assert.equal(some.ok && some.value.email, "ada@example.org");
});

test("every answer is required and capped", () => {
  const v = validateApplication({ github: "ada", sixMonths: "  ", fiveYears: "x".repeat(4001) });
  assert.equal(v.ok, false);
  if (!v.ok) assert.deepEqual(Object.keys(v.errors).sort(), ["fiveYears", "sixMonths"]);
});

test("an application is saved, emailed to the owner with the applicant as reply-to, and copied to a signed-in applicant", async () => {
  const s = await setup();
  const r = await submitApplication(good, { userId: "u1", username: "ada", email: "ada@example.org" }, ip, s.deps);
  assert.deepEqual(r, { status: "ok", copyTo: "ada@example.org" });
  assert.equal(s.sent.length, 2);

  const [owner, copy] = s.sent;
  assert.equal(owner.to, "bashir.mikael@outlook.com");
  assert.equal(owner.subject, "Org application: @ada-lovelace");
  assert.equal(owner.replyTo, "ada@example.org");
  for (const part of ["https://github.com/ada-lovelace", "ada", QUESTIONS.sixMonths, good.sixMonths, QUESTIONS.fiveYears, good.fiveYears]) assert.ok(owner.text?.includes(part), part);

  assert.equal(copy.to, "ada@example.org");
  assert.ok(copy.text?.includes(good.sixMonths) && copy.text?.includes(good.fiveYears)); // their answers, as they wrote them
  assert.equal(copy.replyTo, undefined);

  const row = (await s.raw.query<{ github: string; emailed: boolean; user_id: string; email: string }>("SELECT github, emailed, user_id, email FROM join_applications")).rows[0];
  assert.deepEqual(row, { github: "ada-lovelace", emailed: true, user_id: "u1", email: "ada@example.org" });
});

test("the email they type is the one used, when it differs from the account's: the copy goes there and replies are addressed to it", async () => {
  const s = await setup();
  const r = await submitApplication({ ...good, email: "ada.other@example.org" }, { username: "ada", email: "ada@example.org" }, ip, s.deps);
  assert.deepEqual(r, { status: "ok", copyTo: "ada.other@example.org" });
  assert.deepEqual(s.sent.map((m) => m.to), ["bashir.mikael@outlook.com", "ada.other@example.org"]); // nothing to the account email
  assert.equal(s.sent[0].replyTo, "ada.other@example.org");
  assert.ok(s.sent[0].text?.includes("ada.other@example.org"));
  assert.equal((await s.raw.query<{ email: string }>("SELECT email FROM join_applications")).rows[0].email, "ada.other@example.org");
});

test("not signed in but with an email typed: the copy goes to it", async () => {
  const s = await setup();
  assert.deepEqual(await submitApplication({ ...good, email: "grace@example.org" }, {}, ip, s.deps), { status: "ok", copyTo: "grace@example.org" });
  assert.deepEqual(s.sent.map((m) => m.to), ["bashir.mikael@outlook.com", "grace@example.org"]);
  assert.equal(s.sent[0].replyTo, "grace@example.org");
});

test("a typed email that is not an address is refused, and nothing is sent", async () => {
  const s = await setup();
  const r = await submitApplication({ ...good, email: "not an email" }, {}, ip, s.deps);
  assert.equal(r.status, "invalid");
  assert.equal(s.sent.length, 0);
});

test("someone who is not signed in and gives no email sends the application and gets no copy (GitHub's invitation reaches them)", async () => {
  const s = await setup();
  assert.deepEqual(await submitApplication(good, {}, ip, s.deps), { status: "ok", copyTo: undefined });
  assert.deepEqual(s.sent.map((m) => m.to), ["bashir.mikael@outlook.com"]);
  assert.equal(s.sent[0].replyTo, undefined);
});

test("a signed-in user without an email on file gets no copy", async () => {
  const s = await setup();
  await submitApplication(good, { username: "ada", email: "" }, ip, s.deps);
  assert.equal(s.sent.length, 1);
});

test("if the owner's email cannot be sent, the applicant is told, nothing is copied, and the answers are still saved", async () => {
  const s = await setup(() => false);
  const r = await submitApplication(good, { email: "ada@example.org" }, ip, s.deps);
  assert.deepEqual(r, { status: "send_failed" });
  assert.equal(s.sent.length, 1); // no copy of an application the owner never got
  const row = (await s.raw.query<{ emailed: boolean; six_months: string }>("SELECT emailed, six_months FROM join_applications")).rows[0];
  assert.deepEqual(row, { emailed: false, six_months: good.sixMonths });
  // a failed one does not count against the person's limits: they can try again at once
  const retry = await submitApplication(good, {}, ip, { ...s.deps, send: async () => ({ ok: true }) });
  assert.equal(retry.status, "ok");
});

test("a failed copy to the applicant never fails the application", async () => {
  const s = await setup((m) => m.to === "bashir.mikael@outlook.com");
  // the application went through; the copy did not, so the response does not claim one
  assert.deepEqual(await submitApplication(good, { email: "ada@example.org" }, ip, s.deps), { status: "ok", copyTo: undefined });
});

test("a bot that fills the hidden field is thanked and nothing is sent or saved", async () => {
  const s = await setup();
  assert.deepEqual(await submitApplication({ ...good, company: "Acme" }, {}, ip, s.deps), { status: "ok" });
  assert.equal(s.sent.length, 0);
  assert.equal((await s.raw.query("SELECT 1 FROM join_applications")).rows.length, 0);
});

test("an invalid form is refused with the reasons, and sends nothing", async () => {
  const s = await setup();
  const r = await submitApplication({ github: "no spaces", sixMonths: "", fiveYears: "ok" }, {}, ip, s.deps);
  assert.equal(r.status, "invalid");
  assert.equal(s.sent.length, 0);
});

test("one GitHub name may apply once in ten minutes, in any case; another name from the same address may", async () => {
  const s = await setup();
  assert.equal((await submitApplication(good, {}, ip, s.deps)).status, "ok");
  assert.equal((await submitApplication({ ...good, github: "ADA-Lovelace" }, {}, ip, s.deps)).status, "rate_limited");
  assert.equal((await submitApplication({ ...good, github: "grace" }, {}, ip, s.deps)).status, "ok");
  await s.raw.query("UPDATE join_applications SET created_at = now() - interval '11 minutes'");
  assert.equal((await submitApplication(good, {}, ip, s.deps)).status, "ok");
});

test("one address may send only a few applications an hour", async () => {
  const s = await setup();
  for (let i = 0; i < PER_ADDRESS_LIMIT; i++) assert.equal((await submitApplication({ ...good, github: `user-${i}` }, {}, ip, s.deps)).status, "ok");
  assert.equal((await submitApplication({ ...good, github: "one-more" }, {}, ip, s.deps)).status, "rate_limited");
  assert.equal((await submitApplication({ ...good, github: "one-more" }, {}, hashAddress("198.51.100.1", "salt"), s.deps)).status, "ok"); // someone else
});

test("what someone types cannot put markup in the owner's email, and a person's address is only ever stored as a hash", async () => {
  const s = await setup();
  const evil = { github: "ada", sixMonths: "<script>alert(1)</script>", fiveYears: `"><img src=x onerror=y>` };
  await submitApplication(evil, { username: "<b>ada</b>" }, ip, s.deps);
  const html = s.sent[0].html;
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("<b>ada</b>"), false);
  assert.ok(s.sent[0].text?.includes("<script>alert(1)</script>")); // plain text keeps what was written
  const stored = (await s.raw.query<{ ip_hash: string }>("SELECT ip_hash FROM join_applications")).rows[0].ip_hash;
  assert.equal(stored.includes("203.0.113.7"), false);
  assert.equal(hashAddress("a", "salt1") === hashAddress("a", "salt2"), false);
});

test("the emails are built from the application alone", () => {
  const a = { github: "ada", sixMonths: "six", fiveYears: "five" };
  assert.equal(ownerMessage(a, {}, "o@x.org").to, "o@x.org");
  assert.equal(applicantMessage(a, "ada@example.org").subject, "We received your application to the CompeteMath organisation");
});
