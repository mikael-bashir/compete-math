"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * Wraps whatever says "yield" and explains it on hover or keyboard focus (a tap focuses it on a phone): a small card styled like the stat pills' notes.
 * The card hangs off a padded wrapper, so the pointer can travel from the word into the card without closing it.
 */
export function YieldHint({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      <span className="cursor-help underline decoration-white/20 decoration-dotted underline-offset-4">{children}</span>
      {open ? (
        <span className={`absolute top-full z-50 w-64 pt-2 normal-case tracking-normal ${align === "right" ? "right-0" : "left-0"}`}>
          <span
            role="tooltip"
            id={id}
            className="leak-dark-scope block rounded-lg border bg-background p-3 text-left font-code text-xs font-normal leading-relaxed text-foreground shadow-lg"
          >
            <strong className="text-emerald-300">Yield</strong> is how much of a library&apos;s own theorems were actually kept: the Leak-trusted theorems in Tengoku, out of the
            theorems and lemmas in the library&apos;s source at the version Tengoku pins. A dash means the library has no pinned source to compare with.
          </span>
        </span>
      ) : null}
    </span>
  );
}
