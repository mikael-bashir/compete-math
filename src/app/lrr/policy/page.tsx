import type { Metadata } from "next";
import { InfoPage } from "../../lib/components/info-page";

export const metadata: Metadata = {
  title: "LRR Terms of Access",
  description: "Data usage policy for the Leak Research Repository.",
};

export default function LRRPolicyPage() {
  return (
    <InfoPage kicker="policy" title="LRR Terms of Access">
      <section>
        <p className="mt-3">
          By entering an access code and viewing the contents of the Leak Research Repository (LRR), you agree to the following binding terms regarding the benchmark and automated theorem proving data provided.
        </p>
      </section>

      <section>
        <h2>1. No AI/ML Training (Zero Contamination)</h2>
        <p className="mt-3">
          To preserve the integrity of the FATE-X evaluation and other mathematical benchmarks, you are strictly prohibited from using any proofs, intermediate steps, tactics, or logs contained within the LRR to train, fine-tune, or provide reinforcement learning (RLHF/RLAIF) to any artificial intelligence or machine learning models. 
        </p>
      </section>

      <section>
        <h2>2. Non-Commercial Use</h2>
        <p className="mt-3">
          The data is provided solely for the purpose of independent audit, grant evaluation, and peer review. You may not sell, license, redistribute for profit, or otherwise monetize the contents of this repository.
        </p>
      </section>

      <section>
        <h2>3. Confidentiality</h2>
        <p className="mt-3">
          Your access code is provisioned exclusively for you. You agree not to publicly distribute the raw benchmark solutions or Lean proofs in any manner that would make them accessible to public web crawlers or automated scraping tools.
        </p>
      </section>

      <section>
        <h2>4. Limitation of Liability</h2>
        <p className="mt-3">
          The repository and all contained data are provided &ldquo;as is&rdquo; without warranty of any kind, either express or implied. CompeteMath will not be held liable for any damages—direct, indirect, incidental, or consequential—that you may cause or suffer as a result of accessing, downloading, or using the contents of this repository.
        </p>
      </section>
    </InfoPage>
  );
}