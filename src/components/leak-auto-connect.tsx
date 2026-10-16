'use client';

// Signing in registers the three public Leak services (I search, II proof states, IV compile gate) in this browser's MCP list, once, so the
// playground has its tools without any setup. See lib/mcp/leak-defaults.ts.

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { addMcpServer, listMcpServers } from '@/lib/mcp/local-mcp-store';
import { LEAK_DEFAULT_SERVERS, leakStatus, seedLeakDefaults, type LeakStatus } from '@/lib/mcp/leak-defaults';

const label = (name: string): string => name.replace('_', ' ');

export function LeakAutoConnect() {
  const { status } = useSession();
  const [state, setState] = useState<LeakStatus | null>(null);

  const refresh = useCallback(() => setState(leakStatus(listMcpServers())), []);

  const seed = useCallback(
    (force: boolean) => {
      const added = seedLeakDefaults({
        signedIn: true,
        storage: window.localStorage,
        list: listMcpServers,
        add: addMcpServer,
        force,
      });
      if (added.length) toast.success(`Connected ${added.map(label).join(', ')}`);
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    if (status === 'authenticated') seed(false);
  }, [status, seed]);

  if (status !== 'authenticated') {
    return (
      <span className="text-[10px] text-white/50">
        Sign in and Leak I, II and IV connect automatically.
      </span>
    );
  }
  if (!state) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[10px] text-white/60">
      {LEAK_DEFAULT_SERVERS.map((s) => {
        const on = state.connected.includes(s.name);
        return (
          <span key={s.name} title={s.role} className="inline-flex items-center gap-1">
            <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-white/25'}`} />
            {label(s.name)}
          </span>
        );
      })}
      {state.missing.length > 0 && (
        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => seed(true)}>
          Restore Leak defaults
        </Button>
      )}
    </span>
  );
}
