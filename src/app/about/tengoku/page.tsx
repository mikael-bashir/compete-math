import type { Metadata } from "next";
import Link from "next/link";
import { SiGithub } from "react-icons/si";
import { InfoPage } from "../../lib/components/info-page";
import { SOURCES } from "./sources";

export const metadata: Metadata = {
  title: "Tengoku — the full breakdown",
  description:
    "How Tengoku, CompeteMath's AI-first Lean 4 library, is built, verified, grown and served.",
};

const REPO = "https://github.com/competemath/tengoku";
const EMISSARY = "https://github.com/competemath/emissary-archangel";

export default function AboutTengokuPage() {
  return (
    <InfoPage kicker="tengoku" title="Tengoku" logo="/logos/Tengoku.png">
      <section>
        <p>
          Tengoku (天国) is one self-contained Lean 4 library. It was seeded from
          Mathlib and every package Mathlib pulls in, and it grows by verified
          translations of theorems from every open formalization project we can
          find, and by direct contributions. Its purpose is continuously
          improving, reliable context for automated theorem provers: one library
          to search, one toolchain, one definition of &ldquo;trusted&rdquo;.
        </p>
        <p className="mt-4">
          This page is the full breakdown. The{" "}
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            repository README
          </a>{" "}
          is the quick start.
        </p>
      </section>

      <section>
        <h2>Using it</h2>
        <ul className="mt-3 list-disc pl-5 space-y-2">
          <li>
            <strong>Search on the web:</strong>{" "}
            <Link href="/tengoku">competemath.com/tengoku</Link> searches the whole
            library by meaning or by type shape, with the trust status on every
            result.
          </li>
          <li>
            <strong>Leak I, the free MCP service:</strong> the same search from
            inside your editor or agent, at{" "}
            <code>https://barkingtree-leak-i.hf.space/sse</code>. No auth
            configuration required. The index is managed by CompeteMath and
            follows every merge of the tree.
          </li>
          <li>
            <strong>API:</strong>{" "}
            <code>GET https://competemath.com/api/tengoku/search?q=…</code>{" "}
            returns JSON, no key. Input and output shapes:{" "}
            <a href={`${REPO}/blob/main/docs/api.md`} target="_blank" rel="noopener noreferrer">
              docs/api.md
            </a>
            .
          </li>
          <li>
            <strong>Self-serve services:</strong> proof states (Leak II) and
            verification (Leak IV), hosted or on your own machine:{" "}
            <a href="https://github.com/mikael-bashir/leak-services" target="_blank" rel="noopener noreferrer">
              github.com/mikael-bashir/leak-services
            </a>
            . What each Leak harness does is on the{" "}
            <Link href="/about/leak">Leak page</Link>.
          </li>
        </ul>
      </section>

      <section>
        <h2>The tree</h2>
        <ul className="mt-3 list-disc pl-5 space-y-2">
          <li>
            <strong>No Dependencies:</strong> Everything lives in the{" "}
            <code>Tengoku/</code> folder. The only external requirement is the
            pinned Lean toolchain (v4.34.0-rc2).
          </li>
          <li>
            <strong>Self-Contained Seed:</strong> Mathlib and its dependencies
            were copied in once. <code>SEED.md</code> tracks their origins, but we
            no longer sync with them. Original declaration names are unchanged.
          </li>
          <li>
            <strong>Strict Trust:</strong> A theorem is &ldquo;trusted&rdquo; only
            if it compiles cleanly in this tree with no errors, no missing proofs
            (<code>sorry</code>), and no extra axioms.
          </li>
          <li>
            <strong>New Additions:</strong> Saved in{" "}
            <code>Tengoku/&lt;Library&gt;/</code>. Every module is built.
          </li>
          <li>
            <strong>Zero-Build Caching:</strong> You never build from scratch.
            Nightly releases cache the compiled tree. Run{" "}
            <code>scripts/cache.sh get</code> to download the latest cache and
            only build your changes, or use <code>scripts/pin.sh</code> to sync
            perfectly and build nothing.
          </li>
          <li>
            <strong>Live Updates:</strong> Every merge publishes its compiled
            difference instantly. This keeps the hosted Leak services synced with{" "}
            <code>main</code> in minutes without compiling.
          </li>
        </ul>
      </section>

      <section>
        <h2>Tiers</h2>
        <p className="mt-3">
          Every record already has a real proof from somewhere. The tier says
          whether Leak has stamped it:
        </p>
        <ul className="mt-3 list-disc pl-5 space-y-2">
          <li>
            <strong><code>tentative</code></strong> — a real proof from a real
            source (every record carries a <code>source_url</code> pointing at
            it) that Leak has not re-verified on the pinned toolchain yet.
          </li>
          <li>
            <strong><code>staging</code></strong> — a translation of a real proof,
            produced by{" "}
            <a href={EMISSARY} target="_blank" rel="noopener noreferrer">
              Emissary-Archangel
            </a>
            : the original lived on another toolchain; this is the same claim
            restated and re-proved on Tengoku&rsquo;s, and it passed two gates —
            it compiles cleanly, and an independent entailment check confirms it
            proves at least as much as the original. Not yet in any module.
          </li>
          <li>
            <strong><code>trusted</code></strong> — compiled and certified by the
            pinned toolchain&rsquo;s own kernel, in this tree. Mathlib lives here
            by definition.
          </li>
        </ul>
        <p className="mt-4">
          Promotion only goes one way, tentative or staging → trusted, and only by
          Leak actually building the record&rsquo;s module. Nothing is trusted by
          assumption.
        </p>
      </section>

      <section>
        <h2>Record shape</h2>
        <p className="mt-3">
          Each line of every <code>data/**/*.jsonl</code> file is one record:
        </p>
        <pre className="mt-3 rounded-md bg-white/5 border border-white/10 p-4 text-[13px] overflow-x-auto">
{`{
  "name": "...",
  "statement": "theorem ... : ...",
  "proof": ":= by ...",
  "status": "tentative | staging | trusted",
  "library": "...",
  "source_url": "...",
  "toolchain": "..."
}`}
        </pre>
      </section>

      <section>
        <h2>Contributing</h2>
        <p className="mt-3">
          Every change is a pull request, and the repository does the checking:
        </p>
        <ul className="mt-3 list-disc pl-5 space-y-2">
          <li>
            <strong>The gate (about three minutes):</strong> every added record
            has the right shape, a source on the allowlist, a name its statement
            declares, no duplicate of a trusted name; no <code>sorry</code>,
            <code>axiom</code>, <code>native_decide</code>, macros, notation or
            anything that runs code; a signed-off commit; no authorship line ever
            removed.
          </li>
          <li>
            <strong>The merge queue:</strong> compiles exactly the mathematics a
            PR adds, on the pinned toolchain, before it lands. A PR the queue
            ejects is left open with the reason.
          </li>
          <li>
            <strong>Authorship stays with you.</strong> A docstring above each
            theorem names the human author, the AI system used if any, and a link
            to your identity (GitHub, LinkedIn, ORCID, or your{" "}
            <Link href="/whoami">CompeteMath ID</Link>). It travels with the
            record into the tree, permanently.
          </li>
          <li>
            <strong>Translating a whole library</strong> is automated: register
            the source, and Emissary-Archangel translates it theorem by theorem,
            each verified translation arriving as its own pull request.
          </li>
        </ul>
        <p className="mt-4">
          Details, commands and the record files to edit:{" "}
          <a href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer">
            CONTRIBUTING.md
          </a>
          ,{" "}
          <a href={`${REPO}/blob/main/docs/testing.md`} target="_blank" rel="noopener noreferrer">
            how Tengoku is tested
          </a>
          ,{" "}
          <a href={`${REPO}/blob/main/docs/topups.md`} target="_blank" rel="noopener noreferrer">
            top-ups
          </a>
          .
        </p>
      </section>

      <section>
        <h2>Why v4.34.0-rc2</h2>
        <p className="mt-3">
          Nearly every serious formalization project depends on Mathlib and tracks
          a Mathlib-compatible toolchain, so the reachable union of theorems is
          largest on the Mathlib release most projects have already moved to, not
          on a novel toolchain. When the tree was created, Mathlib&rsquo;s{" "}
          <code>master</code> and its dependencies were pinned to{" "}
          <code>v4.34.0-rc2</code>, and the largest live projects (FLT, Carleson,
          PFR) matched it exactly. Everything on another toolchain is reached by
          translation.
        </p>
      </section>

      <section>
        <h2>Sources</h2>
        <p className="mt-3">
          100+ source libraries, 500,000+ theorems. A declaration whose
          proof contains <code>sorry</code> anywhere is dropped at harvest, never
          mislabelled as tentative.
        </p>
        <details className="mt-4">
          <summary className="cursor-pointer font-code text-sm text-emerald-300/80 hover:text-emerald-300">
            Every source, largest first
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px] text-left">
              <thead className="text-white/50 font-code text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Toolchain</th>
                  <th className="py-2 text-right">Statements</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {SOURCES.map((s) => (
                  <tr key={s.repo + s.name}>
                    <td className="py-2 pr-3 align-top">
                      <a href={s.repo} target="_blank" rel="noopener noreferrer">
                        {s.name}
                      </a>
                      {s.description ? (
                        <span className="text-white/45"> — {s.description}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 align-top font-code text-white/50 whitespace-nowrap">
                      {s.toolchain.replace("leanprover/lean4:", "")}
                    </td>
                    <td className="py-2 align-top text-right font-code whitespace-nowrap">
                      {s.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section>
        <h2>Tools</h2>
        <ul className="mt-3 list-disc pl-5 space-y-2">
          <li>
            <code>tools/harvest.py</code> clones a Lean repository and extracts
            every theorem and lemma — name, statement and full proof — by a
            syntactic scan, no build needed; rerunnable against any library at any
            time.
          </li>
          <li>
            <code>tools/harvest_prove2me.py</code> pulls proved theorems and their
            accepted solutions from Prove2Me&rsquo;s API;{" "}
            <code>tools/split_jsonl.py</code> shards any file too big for GitHub.
          </li>
          <li>
            <code>scripts/seed.py</code>, <code>scripts/generate.py</code>,{" "}
            <code>scripts/promote.py</code>: the re-runnable seed, the module
            generator, and promotion (build the record&rsquo;s module, then move it
            to trusted).
          </li>
        </ul>
      </section>

      <section>
        <h2>Independence</h2>
        <p className="mt-3">
          Tengoku and the wider CompeteMath ecosystem were founded by one person.
          There is no intention of making money from this project, and it is not
          affiliated with, nor does it support, any organization, company or
          political group. No donation or partnership buys influence over the
          repository&rsquo;s governance, accessibility, or the integrity of its
          contents.
        </p>
        <p className="mt-6">
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-code text-sm no-underline text-emerald-300 hover:text-emerald-200"
          >
            <SiGithub className="w-4 h-4" /> competemath/tengoku
          </a>
        </p>
      </section>
    </InfoPage>
  );
}
