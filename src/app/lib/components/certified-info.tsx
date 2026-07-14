"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { CERTIFICATE } from "../certificate";
import { PRACTICE_REVEAL_ATTEMPTS } from "../constants/site";

// A small verification mark that reveals a transient popover on hover / focus —
// same interaction and styling as <LevelInfo>, so it appears instantly rather
// than waiting on the browser's native title-tooltip delay. Explains, in
// research-grade terms, that the problem is backed by a machine-checked proof.
//
// `interactive` renders the trigger as a real <button> (keyboard focusable) for
// standalone use; pass `false` when the mark sits inside another interactive
// element (e.g. a card <Link>) to avoid nesting interactive controls.
export function CertifiedInfo({
  align = "right",
  interactive = true,
}: {
  align?: "left" | "right";
  interactive?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const triggerCls =
    "inline-flex text-amber-400/80 hover:text-amber-300 transition-colors outline-none focus-visible:text-amber-300";

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {interactive ? (
        <button
          type="button"
          aria-label="This problem carries a machine-checked proof certificate"
          className={triggerCls}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          <BadgeCheck className="w-3.5 h-3.5" />
        </button>
      ) : (
        <span
          aria-label="This problem carries a machine-checked proof certificate"
          className={triggerCls}
        >
          <BadgeCheck className="w-3.5 h-3.5" />
        </span>
      )}

      {open && (
        <div
          role="tooltip"
          className={`absolute top-6 z-50 w-72 rounded-xl border border-amber-400/20 bg-[#141013] p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] normal-case tracking-normal ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="font-code text-[10px] tracking-[0.25em] uppercase text-amber-400/70 mb-2">
            {"// proof certificate"}
          </p>
          <p className="text-[12px] text-white/70 leading-relaxed">
            This problem&rsquo;s answer is backed by a formal proof of correctness,
            machine-checked in Lean against {CERTIFICATE.toolchain} ·{" "}
            {CERTIFICATE.mathlib}. You can request the full certificate — proof
            script and provenance — once you answer correctly, or after its answer
            is revealed following {PRACTICE_REVEAL_ATTEMPTS} attempts.
          </p>
        </div>
      )}
    </span>
  );
}
