import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FROM, buildMailjetPayload, parseAddress, sendViaMailjet, type EmailMessage } from "../../src/app/lib/email/mailjet";

const msg: EmailMessage = { to: "bashir.mikael@outlook.com", subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

test("the sender is info@competemath.com, the Mailjet sender that is validated for the domain", () => {
  assert.deepEqual(parseAddress(DEFAULT_FROM), { Email: "info@competemath.com", Name: "CompeteMath" });
  const [m] = buildMailjetPayload(msg).Messages;
  assert.deepEqual(m.From, { Email: "info@competemath.com", Name: "CompeteMath" });
});

test("addresses are read with or without a display name", () => {
  assert.deepEqual(parseAddress("a@b.co"), { Email: "a@b.co" });
  assert.deepEqual(parseAddress('"Jo Q" <jo@b.co>'), { Email: "jo@b.co", Name: "Jo Q" });
  assert.deepEqual(parseAddress("<jo@b.co>"), { Email: "jo@b.co" });
});

test("the payload carries the recipient, subject, both bodies and a reply-to only when one is given", () => {
  const plain = buildMailjetPayload(msg).Messages[0];
  assert.deepEqual(plain.To, [{ Email: "bashir.mikael@outlook.com" }]);
  assert.equal(plain.Subject, "Hello");
  assert.equal(plain.HTMLPart, "<p>Hi</p>");
  assert.equal(plain.TextPart, "Hi");
  assert.equal("ReplyTo" in plain, false);
  const withReply = buildMailjetPayload({ ...msg, replyTo: "them@x.org" }).Messages[0];
  assert.deepEqual(withReply.ReplyTo, { Email: "them@x.org" });
});

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url);
    seen.init = init;
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

test("a send posts to Mailjet's v3.1 endpoint with basic auth from the key and secret", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const r = await sendViaMailjet(msg, { apiKey: "key", secretKey: "secret", fetch: fakeFetch(200, { Messages: [{ Status: "success" }] }, seen) });
  assert.deepEqual(r, { ok: true });
  assert.equal(seen.url, "https://api.mailjet.com/v3.1/send");
  assert.equal(seen.init?.method, "POST");
  assert.equal((seen.init?.headers as Record<string, string>).Authorization, `Basic ${Buffer.from("key:secret").toString("base64")}`);
  assert.equal(JSON.parse(String(seen.init?.body)).Messages[0].From.Email, "info@competemath.com");
});

test("a refusal is not ok and carries Mailjet's reason; nothing is thrown", async () => {
  const bad = await sendViaMailjet(msg, { apiKey: "k", secretKey: "s", fetch: fakeFetch(401, { ErrorMessage: "API key authentication/authorization failure" }) });
  assert.deepEqual(bad, { ok: false, error: "API key authentication/authorization failure" });
  const sender = await sendViaMailjet(msg, {
    apiKey: "k",
    secretKey: "s",
    fetch: fakeFetch(400, { Messages: [{ Status: "error", Errors: [{ ErrorMessage: 'Sender "x@y.z" is not allowed' }] }] }),
  });
  assert.deepEqual(sender, { ok: false, error: 'Sender "x@y.z" is not allowed' });
});

test("a 200 that does not say success is not ok, and a network failure is an error, not an exception", async () => {
  assert.equal((await sendViaMailjet(msg, { apiKey: "k", secretKey: "s", fetch: fakeFetch(200, { Messages: [{ Status: "error" }] }) })).ok, false);
  assert.equal((await sendViaMailjet(msg, { apiKey: "k", secretKey: "s", fetch: fakeFetch(200, {}) })).ok, false);
  const down = await sendViaMailjet(msg, {
    apiKey: "k",
    secretKey: "s",
    fetch: (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as typeof fetch,
  });
  assert.deepEqual(down, { ok: false, error: "getaddrinfo ENOTFOUND" });
});
