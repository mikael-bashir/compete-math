import type { Metadata } from "next";
import { InfoPage } from "../lib/components/info-page";
import { CONTACT_EMAIL } from "../lib/constants/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "The cookies CompeteMath uses, and why.",
};

export default function CookiesPage() {
  return (
    <InfoPage kicker="legal" title="Cookie Policy">
      <p className="font-code text-xs text-white/35">Last updated: July 2026</p>

      <section>
        <h2>The short version</h2>
        <p className="mt-3">
          We use a small number of <strong>strictly necessary</strong> cookies to
          keep you signed in. No advertising cookies, no cross-site trackers.
        </p>
      </section>

      <section>
        <h2>Cookies we set</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="font-code text-left text-white/50 border-b border-white/10">
                <th className="py-2 pr-4">Cookie</th>
                <th className="py-2 pr-4">Purpose</th>
                <th className="py-2">Lifetime</th>
              </tr>
            </thead>
            <tbody className="text-white/65">
              <tr className="border-b border-white/5">
                <td className="py-2 pr-4 font-code">authjs.session-token</td>
                <td className="py-2 pr-4">Keeps you signed in across visits (session authentication).</td>
                <td className="py-2">30 days</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2 pr-4 font-code">authjs.csrf-token</td>
                <td className="py-2 pr-4">Protects sign-in forms against cross-site request forgery.</td>
                <td className="py-2">Session</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-code">authjs.callback-url</td>
                <td className="py-2 pr-4">Returns you to the right page after signing in.</td>
                <td className="py-2">Session</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Managing cookies</h2>
        <p className="mt-3">
          Because every cookie we set is required for sign-in to function, there's no
          consent banner to click — if you block these cookies in your browser, you
          can still browse problems but won't be able to stay logged in.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p className="mt-3">
          Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </InfoPage>
  );
}
