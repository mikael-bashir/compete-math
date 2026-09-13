"use client";

import { useId, useState, type ReactNode } from "react";

const TONES = {
  neutral: "border-white/10 bg-white/[0.03] text-white/70",
  trusted: "border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-300/80",
  tentative: "border-amber-400/20 bg-amber-500/[0.06] text-amber-300/80",
  muted: "border-white/10 bg-white/[0.03] text-white/50",
} as const;

/**
 * A stat pill that explains itself on hover (and on keyboard focus): the note
 * opens in a small card styled like the app's dialogs. The card hangs off a
 * padded wrapper rather than a margin, so the pointer can travel from the
 * pill into the card (its link is clickable) without closing it.
 */
export function StatPill({
  tone,
  note,
  children,
}: {
  tone: keyof typeof TONES;
  note?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        tabIndex={note ? 0 : undefined}
        aria-describedby={note && open ? id : undefined}
        className={`rounded-full border px-4 py-1.5 ${TONES[tone]} ${note ? "cursor-help" : ""}`}
      >
        {children}
      </span>
      {note && open ? (
        <span className="absolute left-1/2 top-full z-50 w-64 -translate-x-1/2 pt-2">
          <span
            role="tooltip"
            id={id}
            className="leak-dark-scope block rounded-lg border bg-background p-3 text-left font-code text-xs font-normal leading-relaxed text-foreground shadow-lg [&_a]:text-emerald-300 [&_a:hover]:text-emerald-200 [&_a]:underline [&_a]:underline-offset-4"
          >
            {note}
          </span>
        </span>
      ) : null}
    </span>
  );
}
