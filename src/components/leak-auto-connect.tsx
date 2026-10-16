'use client';

// Signing in registers the three public Leak services (I search, II proof states, IV compile gate) in this browser's MCP list, once, so the
// playground has its tools without any setup. It renders nothing: how the services are doing is shown in the MCP Servers manager, and
// nowhere else. See lib/mcp/leak-defaults.ts.

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { addMcpServer, listMcpServers } from '@/lib/mcp/local-mcp-store';
import { seedLeakDefaults } from '@/lib/mcp/leak-defaults';

export function LeakAutoConnect() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== 'authenticated') return;
    const added = seedLeakDefaults({ signedIn: true, storage: window.localStorage, list: listMcpServers, add: addMcpServer });
    if (added.length) toast.success(`Added ${added.map((n) => n.replace('_', ' ')).join(', ')} to your MCP servers`);
  }, [status]);
  return null;
}
