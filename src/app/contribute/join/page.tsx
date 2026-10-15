import type { Metadata } from "next";
import { InfoPage } from "../../lib/components/info-page";
import { JoinForm } from "@/components/join/join-form";

export const metadata: Metadata = {
  title: "Apply to join the organisation",
  description: "Apply to join the CompeteMath GitHub organisation.",
};

export default function JoinPage() {
  return (
    <InfoPage kicker="contribute" title="Apply to join the organisation">
      <section className="not-prose">
        <JoinForm />
      </section>
    </InfoPage>
  );
}
