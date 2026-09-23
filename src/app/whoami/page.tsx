'use client'

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Check, Copy, Loader2 } from "lucide-react";
import { InfoPage } from "../lib/components/info-page";

// The signed-in user's CompeteMath ID, to paste into a Tengoku authorship
// docstring. The proxy sends anyone not signed in to /auth/login and back here.
export default function WhoAmIPage() {
  const { data: session, status } = useSession();
  const [copied, setCopied] = useState(false);
  const user = session?.user as { id?: string; username?: string } | undefined;
  const id = user?.id ?? "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the ID is still selectable */
    }
  };

  return (
    <InfoPage kicker="account" title="Your CompeteMath ID">
      <section>
        <p>
          Put this ID in the authorship docstring above a theorem you contribute
          to Tengoku, or give it to the bulk attribution tool, and the record
          links back to you permanently.
        </p>
        {status === "loading" ? (
          <p className="mt-6 inline-flex items-center gap-2 text-white/50">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </p>
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <code className="font-code text-emerald-300 bg-white/5 border border-white/10 rounded-md px-3 py-2 select-all break-all">
              {id || "—"}
            </code>
            <button
              type="button"
              onClick={copy}
              disabled={!id}
              className="font-code inline-flex items-center gap-2 text-sm rounded-md border border-white/15 px-3 py-2 text-white/80 hover:text-white hover:border-emerald-300/60 disabled:opacity-40 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        {user?.username ? (
          <p className="mt-3 text-white/40 text-sm">Signed in as {user.username}.</p>
        ) : null}
      </section>
    </InfoPage>
  );
}
