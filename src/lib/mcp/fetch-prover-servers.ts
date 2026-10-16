// Read the operator's active MCP servers straight out of the browser-local
// registry (see local-mcp-store.ts) so the prover gets the exact {name, url}
// pairs it needs. No live tool-inventory enrichment for now — the prover
// falls back to server-name-only guidance, same as the degraded path this
// always had when the tool-discovery backend was unreachable.

import { listMcpServers } from './local-mcp-store';
import { orderForProver } from './leak-defaults';

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
  // Known Leak servers get their real tool lists and the verifier is put first (see orderForProver): without that the prover
  // took the first registered server, Leak I, as the one that verifies, and no proof ever passed its final check.
  return orderForProver(
    listMcpServers()
      .filter((s) => s.isActive && s.name && s.url)
      .map((s): ProverMcpServer => ({ name: s.name, url: s.url })),
  );
}
