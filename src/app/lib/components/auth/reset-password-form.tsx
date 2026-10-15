"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/app/lib/actions/auth";

type State = "form" | "sending" | "done" | "expired" | "invalid";

const input = "w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/40";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? "form" : "invalid");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirm") ?? "")) {
      setMessage("The two passwords are not the same.");
      return;
    }
    setMessage(null);
    setState("sending");
    try {
      const result = await resetPasswordAction(token, password);
      if (result.status === "ok") setState("done");
      else if (result.status === "weak") {
        setMessage(result.message);
        setState("form");
      } else setState(result.status);
    } catch {
      setMessage("Something went wrong. Please try again.");
      setState("form");
    }
  }

  if (state === "done") {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold">Password changed</h1>
        <p className="mt-2 text-sm text-white/60">Your email is confirmed too. You can sign in with the new password.</p>
        <Link href="/auth/login" className="mt-6 inline-block rounded-lg bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/25">
          Sign in
        </Link>
      </div>
    );
  }

  if (state === "expired" || state === "invalid") {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold">{state === "expired" ? "Link expired" : "Invalid link"}</h1>
        <p className="mt-2 text-sm text-white/60">
          {state === "expired" ? "That link is more than an hour old." : "That link is invalid or has already been used."} Ask for a new one from the sign-in page.
        </p>
        <Link href="/auth/login" className="mt-6 inline-block text-sm text-white/60 hover:text-white">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-center text-xl font-semibold">Choose a new password</h1>
      <div className="space-y-1">
        <label htmlFor="reset-password" className="text-sm text-white/80">New password</label>
        <input id="reset-password" name="password" type="password" required minLength={9} maxLength={32} autoComplete="new-password" className={input} />
        <p className="text-xs text-white/40">9 to 32 characters.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="reset-confirm" className="text-sm text-white/80">Type it again</label>
        <input id="reset-confirm" name="confirm" type="password" required autoComplete="new-password" className={input} />
      </div>
      {message ? <p role="alert" className="text-sm text-amber-300">{message}</p> : null}
      <button type="submit" disabled={state === "sending"} className="w-full rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium hover:bg-white/30 disabled:opacity-50">
        {state === "sending" ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
