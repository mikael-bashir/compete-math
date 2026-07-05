"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { LEVELS } from "../constants/site";

// A small circled "i" that reveals a temporary popover explaining the 1–5
// level scale on hover (and keyboard focus, for accessibility). The popover is
// purely transient — it disappears the moment the pointer leaves.
export function LevelInfo({ align = "right" }: { align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="What do the levels mean?"
        className="text-white/40 hover:text-emerald-300 transition-colors outline-none focus-visible:text-emerald-300"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="tooltip"
          className={`absolute top-6 z-50 w-72 rounded-xl border border-white/10 bg-[#0d141b] p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] normal-case tracking-normal ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="font-code text-[10px] tracking-[0.25em] uppercase text-amber-400/80 mb-3">
            // knowledge levels
          </p>
          <ul className="space-y-2.5">
            {LEVELS.map((l, i) => (
              <li key={l.value} className="flex gap-2.5">
                <span className="font-code shrink-0 grid place-items-center h-5 w-5 rounded-md bg-emerald-400/10 border border-emerald-400/30 text-emerald-200 text-[11px]">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="font-code block text-[12px] text-white/90">{l.short}</span>
                  <span className="block text-[11px] text-white/45 leading-snug">{l.blurb}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
