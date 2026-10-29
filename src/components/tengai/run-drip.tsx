'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { bridgeConnection } from '@/lib/prover/run-prover-stream';
import { DRY_RUN_COMMAND, RUN_COMMAND, WORKFLOW_URL } from '@/lib/tengai/data';

// "Run a drip": on GitHub (a workflow dispatch, the commands below) or on this machine, through the local bridge when it is connected
// (public/tengai-drip.mjs there starts anomalous-archangel in the operator's own checkout of competemath/tengai).

type Local = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  dryRun: boolean;
  budget: number;
  dir: string;
  tail: string[];
};
type Link_ = { kind: 'checking' } | { kind: 'offline' } | { kind: 'old' } | { kind: 'token' } | { kind: 'ready'; local: Local };

const btn = 'font-code text-xs px-3 py-1.5 rounded-md border border-white/15 text-white/80 hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default';

function baseOf(url?: string): string {
  let b = (url || 'http://localhost:4123').replace(/\/$/, '');
  if (!/^https?:\/\//i.test(b)) b = `http://${b}`;
  return b;
}

function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <code className="font-code text-xs text-white/80 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 break-all flex-1">{text}</code>
      <button
        type="button"
        className={btn}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => undefined,
          );
        }}
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}

export function RunDrip() {
  const [link, setLink] = useState<Link_>({ kind: 'checking' });
  const [budget, setBudget] = useState('8');
  const [dry, setDry] = useState(true);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const call = useCallback(async (method: 'GET' | 'POST', body?: object): Promise<Link_> => {
    const conn = bridgeConnection();
    if (!conn.token) return { kind: 'offline' };
    try {
      const res = await fetch(`${baseOf(conn.bridgeUrl)}/tengai-drip`, {
        method,
        headers: { 'content-type': 'application/json', 'x-bridge-token': conn.token },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 401) return { kind: 'token' };
      if (res.status === 501 || res.status === 404) return { kind: 'old' };
      const j = (await res.json().catch(() => ({}))) as Partial<Local> & { error?: string };
      if (!res.ok && j.error) {
        setError(j.error);
        return { kind: 'ready', local: emptyLocal() };
      }
      return { kind: 'ready', local: { ...emptyLocal(), ...j, tail: Array.isArray(j.tail) ? j.tail.map(String).slice(-40) : [] } };
    } catch {
      return { kind: 'offline' };
    }
  }, []);

  useEffect(() => {
    let live = true;
    void call('GET').then((l) => live && setLink(l));
    return () => {
      live = false;
    };
  }, [call]);

  const running = link.kind === 'ready' && link.local.running;
  useEffect(() => {
    if (!running) return;
    timer.current = setTimeout(() => void call('GET').then(setLink), 2000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [running, link, call]);

  const start = async () => {
    setError('');
    setLink(await call('POST', { budget: Number(budget), dryRun: dry }));
  };
  const stop = async () => setLink(await call('POST', { stop: true }));

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-2">
        <p className="font-code text-xs uppercase tracking-wider text-white/50">On GitHub</p>
        <p className="text-white/60">
          The drip workflow runs daily. Start one now from the{' '}
          <a href={WORKFLOW_URL} target="_blank" rel="noopener noreferrer">
            workflow page
          </a>{' '}
          (Run workflow), or with the GitHub CLI:
        </p>
        <Command text={RUN_COMMAND} />
        <Command text={DRY_RUN_COMMAND} />
        <p className="text-white/40 text-xs">A dry run uses a fake agent and a fake gate: nothing is spent and nothing is committed.</p>
      </div>

      <div className="space-y-2">
        <p className="font-code text-xs uppercase tracking-wider text-white/50">On this machine</p>
        {link.kind === 'checking' && <p className="text-white/50">Looking for your local bridge&hellip;</p>}
        {link.kind === 'offline' && (
          <p className="text-white/60">
            No local bridge is connected. Connect your local agent on the <Link href="/leak">Leak page</Link>, or run{' '}
            <code className="font-code text-xs">python -m anomalous_archangel drip</code> in a checkout of the repository.
          </p>
        )}
        {link.kind === 'token' && <p className="text-white/60">The bridge refused the saved token. Reconnect it on the <Link href="/leak">Leak page</Link>.</p>}
        {link.kind === 'old' && (
          <p className="text-white/60">
            This bridge does not know the drip yet. Run the setup command on the <Link href="/leak">Leak page</Link> again, then reload.
          </p>
        )}
        {link.kind === 'ready' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="font-code text-xs text-white/60 inline-flex items-center gap-2">
                budget $
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  disabled={running}
                  className="w-16 bg-transparent border border-white/15 rounded px-2 py-1 text-white/80"
                />
              </label>
              <label className="font-code text-xs text-white/60 inline-flex items-center gap-2">
                <input type="checkbox" checked={dry} onChange={(e) => setDry(e.target.checked)} disabled={running} />
                dry run
              </label>
              {!running ? (
                <button type="button" className={btn} onClick={() => void start()}>
                  Run a drip
                </button>
              ) : (
                <button type="button" className={btn} onClick={() => void stop()}>
                  Stop
                </button>
              )}
            </div>
            {error && <p className="text-amber-300/90 text-xs">{error}</p>}
            {link.local.startedAt && (
              <div className="space-y-1">
                <p className="font-code text-xs text-white/50">
                  {link.local.running ? 'running' : `finished (exit ${link.local.exitCode})`} &middot; {link.local.dryRun ? 'dry run' : `budget $${link.local.budget}`}
                  {link.local.dir ? ` · ${link.local.dir}` : ''}
                </p>
                <pre className="font-code text-[11px] leading-snug text-white/70 bg-white/[0.03] border border-white/10 rounded p-3 max-h-64 overflow-auto whitespace-pre-wrap break-words">
                  {link.local.tail.join('\n') || '(no output yet)'}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function emptyLocal(): Local {
  return { running: false, startedAt: null, finishedAt: null, exitCode: null, dryRun: false, budget: 0, dir: '', tail: [] };
}
