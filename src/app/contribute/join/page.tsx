import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/app/(auth)/auth";
import { InfoPage } from "../../lib/components/info-page";
import { JoinForm } from "@/components/join/join-form";
import { ORG_URL } from "../../lib/constants/site";

export const metadata: Metadata = {
  title: "Apply to join the organisation",
  description: "Three short questions to apply to join the CompeteMath GitHub organisation.",
};

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const session = await auth().catch(() => null);
  const email = session?.user?.email || null;

  return (
    <InfoPage kicker="contribute" title="Apply to join the organisation">
      <section>
        <p>
          Three short questions. Your answers are emailed to me, and I read every one. If you are{" "}
          <Link href="/auth/login">signed in</Link> with an email address, you also get a copy of what you sent. After that, the{" "}
          <a href={ORG_URL} target="_blank" rel="noreferrer">GitHub organisation</a> invitation comes from GitHub to the username you give.
        </p>
      </section>
      <section className="not-prose">
        <JoinForm signedInAs={email} />
      </section>
    </InfoPage>
  );
}
