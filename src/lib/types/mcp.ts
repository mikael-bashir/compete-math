// A registered Lean MCP server (e.g. a Leak_I search endpoint, a Leak_II proof
// daemon). Kept simple on purpose — no auth types / OAuth — because every Leak
// MCP endpoint in current use is a plain HTTP/SSE URL.
export interface MCPServer {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
}
