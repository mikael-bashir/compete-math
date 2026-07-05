import type { Metadata } from "next";
import { InfoPage } from "../lib/components/info-page";
import { CONTACT_EMAIL } from "../lib/constants/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules of the arena.",
};

export default function TermsPage() {
  return (
    <InfoPage kicker="legal" title="Terms of Service">
      <p className="font-code text-xs text-white/35">Last updated: July 2026</p>

      <section>
        <h2>The deal</h2>
        <p className="mt-3">
          CompeteMath is provided free of charge, as-is. By creating an account you
          agree to these terms. If you don't agree, don't use the site.
        </p>
      </section>

      <section>
        <h2>Fair play</h2>
        <p className="mt-3">
          Competitions only mean something if they're honest. Don't share answers to
          live weekly problems before they close, don't automate submissions, and
          don't operate multiple accounts to farm points. Violations can lead to
          score resets or account removal.
        </p>
      </section>

      <section>
        <h2>Your content</h2>
        <p className="mt-3">
          You keep ownership of problems, answers and comments you post, and grant
          CompeteMath a licence to display and distribute them on the platform.
          Post only content you have the right to share; problems lifted verbatim
          from copyrighted collections will be removed.
        </p>
      </section>

      <section>
        <h2>Conduct</h2>
        <p className="mt-3">
          Keep it civil. Harassment, spam, and abusive content have no place here
          and will be moderated. Admin decisions on content review are final.
        </p>
      </section>

      <section>
        <h2>Liability</h2>
        <p className="mt-3">
          We work hard to keep the site accurate and available, but we provide no
          warranties. To the maximum extent permitted by law, CompeteMath is not
          liable for any damages arising from your use of the service.
        </p>
      </section>

      <section>
        <h2>Changes & contact</h2>
        <p className="mt-3">
          We may update these terms; material changes will be announced on the site.
          Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </InfoPage>
  );
}
