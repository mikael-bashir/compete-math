"use client"

import Link from "next/link";
import { Heart, Mail } from "lucide-react";
import { SiGithub } from "react-icons/si";
import { DONATE_URL, GITHUB_URL, CONTACT_EMAIL } from "../../constants/site";

const LINK_COLUMNS = [
  {
    title: "Explore",
    links: [
      { label: "Home", href: "/home" },
      { label: "Community", href: "/community" },
      { label: "Practice", href: "/practice" },
      { label: "Leaderboard", href: "/global" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "About", href: "/about" },
      { label: "FAQ", href: "/faq" },
      { label: "Contribute", href: "/contribute" },
      { label: "Donate", href: DONATE_URL, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Cookie Policy", href: "/cookies" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative bg-[#070b0f] border-t border-white/10">
      {/* subtle emerald glow along the top edge */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 pt-16 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">

          {/* Brand column */}
          <div className="col-span-2">
            <p className="font-code font-bold text-lg bg-linear-to-r from-amber-300 via-yellow-200 to-amber-400 bg-size-[200%_auto] bg-clip-text text-transparent [--tw-drop-shadow:drop-shadow(0_0_5px_var(--color-yellow-200))_drop-shadow(0_0_15px_var(--color-amber-400))] filter animate-shimmer">
              CompeteMath
            </p>
            <p className="mt-3 text-sm text-white/45 leading-relaxed max-w-xs">
              A competitive mathematics arena. New problems every day,
              formally verified with Lean 4.
            </p>
            <div className="flex items-center gap-4 mt-6">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="text-white/40! hover:text-white! transition-colors"
              >
                <SiGithub className="w-5 h-5" />
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                aria-label="Email"
                className="text-white/40! hover:text-white! transition-colors"
              >
                <Mail className="w-5 h-5" />
              </a>
              <a
                href={DONATE_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Donate"
                className="text-white/40! hover:text-rose-300! transition-colors"
              >
                <Heart className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {LINK_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="font-code text-[11px]! font-semibold uppercase tracking-[0.2em] text-white/35! mb-4">
                {col.title}
              </p>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-white/55! hover:text-emerald-300! transition-colors no-underline"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-white/55! hover:text-emerald-300! transition-colors no-underline"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom line */}
        <div className="mt-14 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="font-code text-xs text-white/30">
            © {new Date().getFullYear()} CompeteMath. All rights reserved.
          </p>
          <p className="font-code text-xs text-white/25">
            <span className="text-emerald-400/50">$</span> proofs checked by Lean 4 · problems dropped every day
          </p>
        </div>
      </div>
    </footer>
  );
}
