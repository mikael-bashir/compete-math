import type { Metadata } from "next";
import { InfoPage } from "../lib/components/info-page";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about CompeteMath.",
};

const FAQS = [
  {
    q: "When do new problems drop?",
    a: "Every Friday at 06:00 BST. The countdown on your home page is always live.",
  },
  {
    q: "How does scoring work?",
    a: "Each weekly problem carries a points value based on difficulty. Correct submissions earn full points; the leaderboard tracks totals per season.",
  },
  {
    q: "What counts towards my streak?",
    a: "Solving at least one problem correctly on a given day extends your streak. Miss a day and it resets — brutal, but that's the game.",
  },
  {
    q: "Can I submit my own problems?",
    a: "Yes! Head to the Problem Forge (Community), draft your problem with full LaTeX support, preview it, and submit. An admin reviews every submission before it goes live.",
  },
  {
    q: "Who reviews community problems?",
    a: "A site admin checks every draft for correctness, clarity and difficulty before approving it to the public arena.",
  },
  {
    q: "What are upvotes?",
    a: "Answers on community problems can be upvoted (there are no downvotes). The best solutions rise to the top.",
  },
  {
    q: "What does “verified with Lean 4” mean?",
    a: "Some problems and solutions are machine-checked with the Lean 4 proof assistant against Mathlib, guaranteeing the mathematics is airtight.",
  },
  {
    q: "Is CompeteMath free?",
    a: "Completely. If you want to support the servers, there's a donate link in the footer.",
  },
];

export default function FaqPage() {
  return (
    <InfoPage kicker="faq" title="Questions, answered">
      <div className="space-y-4">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="group rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4 open:border-emerald-400/30 transition-colors"
          >
            <summary className="font-code text-white cursor-pointer list-none flex items-center justify-between gap-4">
              {f.q}
              <span className="text-emerald-400/60 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
            </summary>
            <p className="mt-3 text-white/60">{f.a}</p>
          </details>
        ))}
      </div>
    </InfoPage>
  );
}
