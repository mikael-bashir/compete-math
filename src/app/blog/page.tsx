import type { Metadata } from "next";
import { InfoPage } from "../lib/components/info-page";

export const metadata: Metadata = {
  title: "Blog",
  description: "Writeups, whitepapers, and video resources from CompeteMath.",
};

// Placeholder. Reached from the navbar's Research dropdown; will hold real
// blog posts, whitepapers, and YouTube resources.
export default function BlogPage() {
  return (
    <InfoPage kicker="blog" title="Blog">
      <section>
        <p className="mt-3">
          Nothing here yet — this is where blog posts, whitepapers, and video
          resources will live. Check back soon.
        </p>
      </section>
    </InfoPage>
  );
}
