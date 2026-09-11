'use client';

// Client-only registry of the operator's Lean MCP servers (Leak_I search,
// Leak_II proof daemon, etc.) — kept in this browser's localStorage rather
// than a DB table, since this is single-admin tooling and every server here
// is just a name + URL the prover is handed directly.

import type { MCPServer } from '@/lib/types/mcp';

const STORAGE_KEY = 'lca.mcpServers';

function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function listMcpServers(): MCPServer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(servers: MCPServer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  } catch {
    /* storage unavailable/full — nothing else to do */
  }
}

export function addMcpServer(input: { name: string; url: string }): MCPServer {
  const server: MCPServer = {
    id: genId(),
    name: input.name.trim(),
    url: input.url.trim(),
    isActive: true,
  };
  save([...listMcpServers(), server]);
  return server;
}

export function setMcpServerActive(id: string, isActive: boolean) {
  save(listMcpServers().map((s) => (s.id === id ? { ...s, isActive } : s)));
}

export function removeMcpServer(id: string) {
  save(listMcpServers().filter((s) => s.id !== id));
}
