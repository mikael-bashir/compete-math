import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderEmail } from "../../src/app/lib/email/layout";

test("nothing typed by a person can put markup into the HTML", () => {
  const evil = `<script>alert(1)</script> & "quotes" 'single' <img src=x onerror=y>`;
  const { html } = renderEmail({ heading: evil, intro: evil, qa: [{ question: evil, answer: evil }], note: evil, button: { label: evil, url: `https://x.test/?a="><script>` } });
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes('"><script>'), false);
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot; &#39;single&#39;"));
  assert.equal(escapeHtml("a&b<c>"), "a&amp;b&lt;c&gt;");
});

test("the plain-text version has every part, the link in the open, and the answers verbatim", () => {
  const { text } = renderEmail({
    heading: "Reset your password",
    intro: "Tap the button.",
    button: { label: "Choose", url: "https://competemath.com/auth/reset?token=abc" },
    qa: [{ question: "Q?", answer: "line one\nline two <b>kept as typed</b>" }],
    note: "Ignore if it was not you.",
  });
  for (const part of ["Reset your password", "Tap the button.", "Choose: https://competemath.com/auth/reset?token=abc", "Q?\nline one\nline two <b>kept as typed</b>", "Ignore if it was not you."]) {
    assert.ok(text.includes(part), part);
  }
});

test("a long answer keeps its line breaks in the HTML", () => {
  const { html } = renderEmail({ heading: "h", qa: [{ question: "q", answer: "a\nb" }] });
  assert.ok(html.includes("white-space:pre-wrap"));
});
