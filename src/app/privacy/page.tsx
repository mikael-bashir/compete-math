import type { Metadata } from "next";
import { InfoPage } from "../lib/components/info-page";
import { CONTACT_EMAIL } from "../lib/constants/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How CompeteMath handles your data.",
};

export default function PrivacyPage() {
  return (
    <InfoPage kicker="legal" title="Privacy Policy">
      <p className="font-code text-xs text-white/35">Last updated: July 2026</p>

      <section>
        <h2>What we collect</h2>
        <p className="mt-3">
          When you create an account we store your <strong>username</strong>,{" "}
          <strong>email address</strong> and a securely hashed password. As you use
          the site we record your submissions, solved problems, streaks, badges, and
          any content you post (community problems, answers, comments and votes).
        </p>
      </section>

      <section>
        <h2>What we use it for</h2>
        <p className="mt-3">
          Your data powers the product itself: leaderboards, streaks, profiles and
          community attribution. We use privacy-friendly analytics (Vercel Analytics)
          to understand aggregate traffic. We do <strong>not</strong> sell your data,
          run third-party ad trackers, or send marketing email.
        </p>
      </section>

      <section>
        <h2>What's public</h2>
        <p className="mt-3">
          Your username, selected badge, solve count, streak, and any community
          content you post are publicly visible on your profile page. Your email is
          only displayed if you have no username set, and is otherwise private.
        </p>
      </section>

      <section>
        <h2>Data retention & deletion</h2>
        <p className="mt-3">
          We keep your data while your account is active. To delete your account and
          associated personal data, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address on
          the account and we'll process it within 30 days.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p className="mt-3">
          Questions about this policy:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </InfoPage>
  );
}
