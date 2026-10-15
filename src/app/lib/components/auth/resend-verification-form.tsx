"use client";

import { useState, type FormEvent } from "react";
import { resendVerificationAction } from "@/app/lib/actions/auth";

/** "Send me a new link": the answer is the same whatever the address, so it cannot be used to find out who has an account. */
export function ResendVerificationForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setBusy(true);
    try {
      await resendVerificationAction(email);
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  if (sent) return <p className="mt-4 text-sm text-white/60">If that address has an account that is not yet confirmed, a new link is on its way.</p>;
  return (
    <form onSubmit={onSubmit} className="mt-4 flex gap-2">
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="Your account email"
        aria-label="Your account email"
        className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/40"
      />
      <button type="submit" disabled={busy} className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/25 disabled:opacity-50">
        {busy ? "…" : "Send link"}
      </button>
    </form>
  );
}
