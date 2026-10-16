'use client';

// The one place the Leak services' state is shown: inside the MCP Server Management dialog. Each row says whether the service is in this
// browser's list and switched on, and whether it is answering right now.

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { addMcpServer, listMcpServers } from '@/lib/mcp/local-mcp-store';
import { LEAK_DEFAULT_SERVERS, leakStatus, seedLeakDefaults } from '@/lib/mcp/leak-defaults';
import { checkReachable } from '@/lib/mcp/reachable';

type Reach = 'checking' | 'online' | 'offline';

const label = (name: string): string => name.replace('_', ' ');

export function LeakServicesPanel({ refreshTrigger, onChange }: { refreshTrigger: number; onChange: () => void }) {
  const [status, setStatus] = useState(() => leakStatus([]));
  const [reach, setReach] = useState<Record<string, Reach>>({});

  // Only the newest probe may write: a slow first probe (a sleeping Space) used to land its "not answering" after a later, successful check.
  const generation = useRef(0);
  const probe = useCallback(() => {
    const mine = ++generation.current;
    setStatus(leakStatus(listMcpServers()));
    setReach(Object.fromEntries(LEAK_DEFAULT_SERVERS.map((s) => [s.name, 'checking'])));
    for (const s of LEAK_DEFAULT_SERVERS) {
      const started = Date.now();
      void checkReachable(s.url).then((ok) => {
        // a check that answers at once still shows "checking" for a moment, so the click is seen to do something
        setTimeout(() => {
          if (mine === generation.current) setReach((r) => ({ ...r, [s.name]: ok ? 'online' : 'offline' }));
        }, Math.max(0, 450 - (Date.now() - started)));
      });
    }
  }, []);

  useEffect(() => setStatus(leakStatus(listMcpServers())), [refreshTrigger]);
  useEffect(() => {
    const g = generation;
    probe();
    return () => {
      g.current++;
    };
  }, [probe]);

  const restore = () => {
    seedLeakDefaults({ signedIn: true, storage: window.localStorage, list: listMcpServers, add: addMcpServer, force: true });
    onChange();
  };

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Leak services</h3>
        <button type="button" onClick={probe} className="text-[11px] text-muted-foreground underline-offset-4 hover:underline">
          Check again
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {LEAK_DEFAULT_SERVERS.map((s) => {
          const connected = status.connected.includes(s.name);
          const r = reach[s.name] ?? 'checking';
          return (
            <li key={s.name} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0">
                <span className="font-medium">{label(s.name)}</span> <span className="text-muted-foreground">{s.role}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className={connected ? 'text-emerald-400' : 'text-muted-foreground'}>{connected ? 'in your list' : 'not in your list'}</span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className={`size-1.5 rounded-full ${r === 'online' ? 'bg-emerald-400' : r === 'offline' ? 'bg-rose-400' : 'animate-pulse bg-white/30'}`} />
                  {r === 'online' ? 'answering' : r === 'offline' ? 'not answering' : 'checking'}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">Added once when you first sign in. Changes you make here are never reset.</p>
        {status.missing.length > 0 && (
          <Button variant="outline" size="sm" className="h-6 shrink-0 px-2 text-[10px]" onClick={restore}>
            Restore Leak defaults
          </Button>
        )}
      </div>
    </div>
  );
}
