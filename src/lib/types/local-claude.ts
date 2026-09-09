export type LocalClaudePermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "bypassPermissions"

// Non-secret run preferences. Kept in this browser's localStorage (single
// admin operator, no cross-device sync needed yet) and sent to the local
// bridge as run options; they contain no secrets and never drive an
// arbitrary binary.
export interface LocalClaudeConfigInput {
  binaryPath: string
  workingDirectory: string | null
  model: string | null
  permissionMode: LocalClaudePermissionMode
  allowedTools: string | null
  maxTurns: number | null
  timeoutMs: number
  systemPromptAppend: string | null
  extraArgs: string[]
  enabled: boolean
}

export const DEFAULT_LOCAL_CLAUDE_CONFIG: LocalClaudeConfigInput = {
  binaryPath: "claude",
  workingDirectory: null,
  model: null,
  permissionMode: "default",
  allowedTools: null,
  maxTurns: null,
  timeoutMs: 120000,
  systemPromptAppend: null,
  extraArgs: [],
  enabled: true,
}

// Connection to the user's local bridge. Machine-specific and secret, so this
// is kept in the browser's localStorage ONLY — never sent to the app server.
export interface LocalClaudeConnection {
  bridgeUrl: string
  token: string
}

export const DEFAULT_LOCAL_CLAUDE_CONNECTION: LocalClaudeConnection = {
  bridgeUrl: "http://localhost:4123",
  token: "",
}

// Shape returned by the bridge's GET /health.
export interface BridgeHealth {
  ok: boolean
  version: string
  error?: string
}

// Shape returned by the bridge's POST /run.
export interface LocalClaudeRunResult {
  ok: boolean
  text: string
  exitCode: number | null
  durationMs: number
  timedOut: boolean
  stderr: string
}
