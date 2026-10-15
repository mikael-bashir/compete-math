"use client";

import { useState, type FormEvent } from "react";
import { EMAIL_NOTE, MAX_ANSWER, MONEY_NOTE, QUESTIONS } from "@/app/lib/join/questions";

type Errors = Partial<Record<"github" | "email" | "sixMonths" | "fiveYears", string>>;

const field =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/40";

/** The application form. The owner receives it by email, and the applicant a copy when there is an address to send it to. */
export function JoinForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [copyTo, setCopyTo] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState("sending");
    setErrors({});
    setProblem(null);
    try {
      const res = await fetch("/api/contribute/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          github: data.get("github"),
          email: data.get("email"),
          sixMonths: data.get("sixMonths"),
          fiveYears: data.get("fiveYears"),
          company: data.get("company"),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; copyTo?: string | null; error?: string; errors?: Errors };
      if (res.ok && body.ok) {
        setCopyTo(body.copyTo ?? null);
        setState("sent");
        return;
      }
      setErrors(body.errors ?? {});
      setProblem(body.error ?? "Something went wrong. Please try again.");
    } catch {
      setProblem("We could not reach the server. Please try again.");
    }
    setState("idle");
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5 font-code text-sm text-emerald-200">
        <p className="font-semibold">Sent. Thank you.</p>
        {copyTo ? <p className="mt-2 text-emerald-100/70">A copy of your answers is on its way to {copyTo}.</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6 font-code text-sm">
      <div>
        <label htmlFor="join-github" className="mb-2 block text-white/90">
          1. What is your GitHub username?
        </label>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-white/40">@</span>
          <input id="join-github" name="github" required maxLength={40} autoComplete="off" spellCheck={false} className={field} aria-invalid={Boolean(errors.github)} />
        </div>
        {errors.github ? <p className="mt-1 text-xs text-amber-300">{errors.github}</p> : null}
      </div>

      <div>
        <label htmlFor="join-six" className="mb-2 block text-white/90">
          2. {QUESTIONS.sixMonths}
        </label>
        <p className="mb-2 text-xs text-white/45">(Note: {MONEY_NOTE})</p>
        <textarea id="join-six" name="sixMonths" required rows={5} maxLength={MAX_ANSWER} className={field} aria-invalid={Boolean(errors.sixMonths)} />
        {errors.sixMonths ? <p className="mt-1 text-xs text-amber-300">{errors.sixMonths}</p> : null}
      </div>

      <div>
        <label htmlFor="join-five" className="mb-2 block text-white/90">
          3. {QUESTIONS.fiveYears}
        </label>
        <p className="mb-2 text-xs text-white/45">(Note: {MONEY_NOTE})</p>
        <textarea id="join-five" name="fiveYears" required rows={5} maxLength={MAX_ANSWER} className={field} aria-invalid={Boolean(errors.fiveYears)} />
        {errors.fiveYears ? <p className="mt-1 text-xs text-amber-300">{errors.fiveYears}</p> : null}
      </div>

      <div>
        <label htmlFor="join-email" className="mb-2 block text-white/90">
          4. {QUESTIONS.email}
        </label>
        <p className="mb-2 text-xs text-white/45">{EMAIL_NOTE}</p>
        <input id="join-email" name="email" type="email" maxLength={254} autoComplete="email" className={field} aria-invalid={Boolean(errors.email)} />
        {errors.email ? <p className="mt-1 text-xs text-amber-300">{errors.email}</p> : null}
      </div>

      {/* A real person never sees or fills this: a bot that fills every field gives itself away. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="join-company">Company</label>
        <input id="join-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      {problem ? (
        <p role="alert" className="text-amber-300">
          {problem}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-5 py-2 font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : "Send application"}
        </button>
      </div>
    </form>
  );
}
