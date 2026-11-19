import type { Metadata } from "next";
import { InfoPage } from "../lib/components/info-page";
import { RunDrip } from "@/components/tengai/run-drip";
import {
  INDEX_URL,
  REQUESTS_URL,
  TENGAI_URL,
  loadIndex,
  loadRequests,
  type Drip,
  type Label,
  type ProofRequest,
} from "@/lib/tengai/data";

export const metadata: Metadata = {
  title: "Tengai",
  description: "Tengai, the volatile upstream of Tengoku, and anomalous-archangel, the mathematician that studies it on every drip.",
};

// The index and the queue are files in the Tengai repository; each read is cached for five minutes (src/lib/tengai/data.ts).

const LABEL_CLS: Record<Label, string> = {
  note: "border-white/20 text-white/60",
  observation: "border-sky-300/40 text-sky-200/90",
  conjecture: "border-amber-300/40 text-amber-200/90",
};

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <p className="font-code text-2xl text-white/90 leading-none">{n}</p>
      <p className="font-code text-[11px] uppercase tracking-wider text-white/40 mt-1">{label}</p>
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 16) : d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function DripCard({ d }: { d: Drip }) {
  return (
    <li className="rounded-sm border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-code text-sm text-white/90">{when(d.started)}</p>
        <p className="font-code text-[11px] text-white/40">
          {d.mode === "dry" ? "dry run" : `$${d.spentUsd.toFixed(2)}`} &middot; {d.modules} modules &middot; {d.theorems} theorems
        </p>
      </div>
      {d.summary && <p className="mt-2 text-white/70">{d.summary}</p>}
      {d.top.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {d.top.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`font-code text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 mt-0.5 shrink-0 ${LABEL_CLS[f.label]}`}>{f.label}</span>
              <span className="text-white/80">
                {f.title} <span className="font-code text-[11px] text-white/35">{f.lens}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 font-code text-[11px] text-white/45">
        {d.findings} findings &middot; {d.landed} Lean {d.landed === 1 ? "file" : "files"} landed &middot; {d.requests} proof {d.requests === 1 ? "request" : "requests"}
        {d.refused > 0 ? ` · ${d.refused} ${d.refused === 1 ? "spawn" : "spawns"} refused by the limits` : ""} &middot;{" "}
        <a href={d.reportUrl} target="_blank" rel="noopener noreferrer">
          report
        </a>
      </p>
    </li>
  );
}

function Requests({ items }: { items: ProofRequest[] }) {
  const open = items.filter((r) => r.status === "open" || r.status === "claimed");
  if (open.length === 0) return <p className="text-white/50">No statement is waiting for a proof.</p>;
  return (
    <ul className="space-y-2">
      {open.slice(0, 12).map((r) => (
        <li key={r.id} className="rounded-sm border border-white/10 bg-white/[0.02] p-3">
          <code className="font-code text-xs text-white/85 break-words whitespace-pre-wrap">{r.statement}</code>
          {r.why && <p className="mt-1.5 text-white/55 text-[13px]">{r.why}</p>}
          <p className="mt-1.5 font-code text-[11px] text-white/35">
            {r.status} &middot; asked by {r.lens || "the archangel"}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function TengaiPage() {
  const [index, requests] = await Promise.all([loadIndex(), loadRequests()]);
  const idx = index.ok ? index.data : null;
  return (
    <InfoPage kicker="tengai" title="Tengai">
      <section>
        <p>
          Tengoku is the store of verified Lean that does not change. <strong>Tengai</strong> is its upstream: the workshop where mathematics is made,
          restructured and thrown away quickly. Leak&rsquo;s proofs flow in; settled content flows out to Tengoku through its own gate.
        </p>
        <p className="mt-4">
          <strong>anomalous-archangel</strong> is sovereign over Tengai. On every drip it reads the whole tree like a working mathematician &mdash;
          maps it, pictures it, tries to abstract it (three dimensions to n, discrete to real, finite to infinite), weighs what a result does to
          other mathematics, bridges pieces that look unrelated &mdash; with angels under it (depth 2, breadth 3, one conserved budget). It may
          rewrite anything, but only Lean that passed the gate lands, and every other claim is labelled.{" "}
          <a href={TENGAI_URL} target="_blank" rel="noopener noreferrer">
            competemath/tengai
          </a>
        </p>
      </section>

      {idx && (
        <section>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <Stat n={idx.drips.length === 0 ? 0 : idx.drips.length} label="recent drips" />
            <Stat n={idx.modules} label="modules" />
            <Stat n={idx.theorems} label="theorems" />
            <Stat n={idx.openRequests} label="proof requests open" />
          </div>
        </section>
      )}

      <section>
        <h2>Latest drips</h2>
        {!index.ok && (
          <p className="mt-3 text-amber-200/90">
            Could not read the drip index from GitHub just now ({index.error}). The page tries again in a few minutes;{" "}
            <a href={INDEX_URL} target="_blank" rel="noopener noreferrer">
              the file
            </a>{" "}
            is public.
          </p>
        )}
        {idx && idx.drips.length === 0 && (
          <p className="mt-3 text-white/50">No drip has run yet. Start the first one below.</p>
        )}
        {idx && idx.drips.length > 0 && (
          <>
            <ul className="mt-4 space-y-3 list-none p-0">
              {idx.drips.slice(0, 8).map((d) => (
                <DripCard key={d.id} d={d} />
              ))}
            </ul>
            <p className="mt-3 text-white/45 text-xs">
              Labels: <span className="font-code">note</span> is a statement about what the tree contains, <span className="font-code">observation</span> was seen in a
              small case or a computation, <span className="font-code">conjecture</span> is believed and not proved. Only a Lean file that passed the gate is verified.
            </p>
          </>
        )}
      </section>

      <section>
        <h2>Statements waiting for a proof</h2>
        <p className="mt-3 text-white/60">
          The archangel queues what it wants proved; leak-archangel takes them. Each statement was compiled (with <code className="font-code text-xs">sorry</code>) before it was queued.
        </p>
        <div className="mt-4">
          {requests.ok ? (
            <Requests items={requests.data} />
          ) : (
            <p className="text-amber-200/90">
              Could not read the queue just now ({requests.error}).{" "}
              <a href={REQUESTS_URL} target="_blank" rel="noopener noreferrer">
                The file
              </a>{" "}
              is public.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2>Run a drip</h2>
        <div className="mt-4">
          <RunDrip />
        </div>
      </section>
    </InfoPage>
  );
}
