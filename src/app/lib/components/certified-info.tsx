"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";

// A single clean tick that, on hover (and keyboard focus), reveals a transient
// popover — same interaction as <LevelInfo> — explaining that the problem is
// backed by a Leak proof certificate available on request.
export function CertifiedInfo({ align = "right" }: { align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="This problem carries a Leak proof certificate"
        className="text-[#deb87f] hover:text-[#f0cd97] transition-colors outline-none focus-visible:text-[#f0cd97]"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <BadgeCheck className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="tooltip"
          className={`absolute top-6 z-50 w-72 rounded-xl border border-[#deb87f]/20 bg-[#0d141b] p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] normal-case tracking-normal ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="font-code text-[10px] tracking-[0.25em] uppercase text-[#deb87f]/80 mb-2">
            {"// leak certificate"}
          </p>
          <p className="text-[12px] text-white/70 leading-relaxed">
            This problem has, available on request, a Leak certificate — a
            machine-checked proof attesting to the truthfulness of an
            interpretation of the problem and its answer.
          </p>
        </div>
      )}
    </span>
  );
}
