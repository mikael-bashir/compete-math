'use client';

import type React from 'react';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addMcpServer } from '@/lib/mcp/local-mcp-store';

interface MCPServerDialogProps {
  onServerAdded?: () => void;
}

// Registers a Lean MCP server (name + URL) in this browser's local registry —
// no auth types, no server-side connection test. Every Leak MCP endpoint in
// current use is a plain HTTP/SSE URL, so this stays deliberately simple.
export function MCPServerDialog({ onServerAdded }: MCPServerDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    addMcpServer({ name, url });
    toast.success(`Added MCP server "${name}"`);
    setOpen(false);
    setName('');
    setUrl('');
    onServerAdded?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="size-4" />
          Add MCP Server
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>
            Register a Lean MCP endpoint (e.g. a Leak_I search or Leak_II proof
            daemon URL) for the prover to use.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mcp-name">Server Name</Label>
            <Input
              id="mcp-name"
              placeholder="Leak_II"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-url">Server URL</Label>
            <Input
              id="mcp-url"
              type="url"
              placeholder="https://example.com/sse"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add server</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
