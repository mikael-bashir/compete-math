import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Shared shell for static content pages (about, faq, legal…). Keeps every
// footer-linked page visually consistent with the app's dark, code-flavoured
// theme without repeating boilerplate.
export function InfoPage({
  kicker,
  title,
  logo,
  children,
}: {
  kicker: string;
  title: string;
  /** Optional page mark rendered at heading height beside the title (e.g. "/logos/Leak.png"). */
  logo?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0f14] pt-28 pb-24">
      <div className="max-w-3xl mx-auto px-6">
        <Link
          href="/"
          className="font-code inline-flex items-center gap-2 text-white/40 hover:text-emerald-300 text-sm mb-10 transition-colors no-underline"
        >
          <ArrowLeft className="w-4 h-4" /> competemath.com
        </Link>

        <p className="font-code text-xs tracking-[0.3em] uppercase text-amber-400/80 mb-2">
          // {kicker}
        </p>
        <div className="flex items-center gap-4 mb-10">
          {logo ? (
            // `!`: a global unlayered `img { height: auto }` rule outranks Tailwind's layered utilities.
            // eslint-disable-next-line @next/next/no-img-element -- static asset, sized by height only
            <img src={logo} alt="" aria-hidden="true" className="h-12! md:h-14! w-auto shrink-0 rounded-md" />
          ) : null}
          <h1 className="font-code text-4xl md:text-5xl font-bold text-white! mb-0">{title}</h1>
        </div>

        <div className="space-y-8 text-white/70 text-[15px] leading-relaxed [&_h2]:font-code [&_h2]:text-white! [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-2 [&_a]:text-emerald-300! [&_a:hover]:text-emerald-200 [&_strong]:text-white/90">
          {children}
        </div>
      </div>
    </div>
  );
}
