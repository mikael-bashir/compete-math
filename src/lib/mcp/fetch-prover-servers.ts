// Read the operator's active MCP servers straight out of the browser-local
// registry (see local-mcp-store.ts) so the prover gets the exact {name, url}
// pairs it needs. No live tool-inventory enrichment for now — the prover
// falls back to server-name-only guidance, same as the degraded path this
// always had when the tool-discovery backend was unreachable.

import { listMcpServers } from './local-mcp-store';

export interface ProverMcpTool {
  name: string;
  args: string[];
}

export interface ProverMcpServer {
  name: string;
  url: string;
  tools?: ProverMcpTool[];
}

export async function fetchProverMcpServers(): Promise<ProverMcpServer[]> {
  return listMcpServers()
    .filter((s) => s.isActive && s.name && s.url)
    .map((s) => ({ name: s.name, url: s.url }));
}
