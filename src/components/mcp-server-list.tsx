'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  listMcpServers,
  removeMcpServer,
  setMcpServerActive,
} from '@/lib/mcp/local-mcp-store';
import type { MCPServer } from '@/lib/types/mcp';

interface MCPServerListProps {
  refreshTrigger?: number;
}

export function MCPServerList({ refreshTrigger }: MCPServerListProps) {
  const [servers, setServers] = useState<MCPServer[]>([]);

  useEffect(() => {
    setServers(listMcpServers());
  }, [refreshTrigger]);

  const toggle = (id: string, isActive: boolean) => {
    setMcpServerActive(id, isActive);
    setServers(listMcpServers());
  };

  const remove = (id: string, name: string) => {
    removeMcpServer(id);
    setServers(listMcpServers());
    toast.success(`Removed "${name}"`);
  };

  if (servers.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No MCP servers configured yet.</p>
        <p className="text-sm">Add your first server to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {servers.map((server) => (
        <Card key={server.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base">{server.name}</CardTitle>
                <p className="truncate text-sm text-muted-foreground">
                  {server.url}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={server.isActive}
                  onCheckedChange={(checked) => toggle(server.id, checked)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex justify-end pt-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => remove(server.id, server.name)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
