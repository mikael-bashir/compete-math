import type { Metadata } from "next";
import { InfoPage } from "../lib/components/info-page";

export const metadata: Metadata = {
  title: "Leak",
  description: "Leak, CompeteMath's automated theorem-proving research effort.",
};

// Placeholder. Reached from the navbar's Research dropdown; the real writeup
// on Leak's architecture and methodology currently lives at /about/leak — this
// route is deliberately separate rather than a redirect, so it can grow into
// its own page without disturbing that one.
export default function LeakPage() {
  return (
    <InfoPage kicker="leak" title="Leak">
      <section>
        <p className="mt-3">
          This page is under construction. In the meantime, read{" "}
          <a href="/about/leak" className="underline underline-offset-4 hover:text-emerald-200">what Leak is and how it works</a>.
        </p>
      </section>
    </InfoPage>
  );
}
