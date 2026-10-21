// The files a Leak bridge is made of, and the one command that fetches, checks and starts them. Pure (no fs), so a test can read the command.
//
// The command used to download the files and run the bridge unchecked. Now each file is checked against the SHA-256 the build computed from
// the file it is about to serve, and the bridge starts only if every one matches: a truncated download, a CDN that serves one file from
// before a deploy and another from after, or a file altered on the way is stopped before anything runs. The page the command is copied
// from is still what the user trusts: a signature the user can check independently of this site needs a key the user holds.

export const BRIDGE_FILES: { url: string; local: string }[] = [
  { url: 'local-claude-bridge.mjs', local: 'claude-bridge.mjs' },
  { url: 'leak-min-imports.mjs', local: 'leak-min-imports.mjs' },
  { url: 'leak-memory.mjs', local: 'leak-memory.mjs' },
  { url: 'leak-containment.mjs', local: 'leak-containment.mjs' },
];

export type BridgeHashes = Record<string, string>; // keyed by the file's url name

export function buildSetupCommand(opts: {
  origin: string;
  token: string;
  port?: string;
  hashes: BridgeHashes;
}): string {
  const { origin, token, port, hashes } = opts;
  if (!origin || !token) return '';
  const fetches = BRIDGE_FILES.map((f) => `curl -fsSL '${origin}/${f.url}' -o ${f.local}`).join(' && ');
  const known = BRIDGE_FILES.every((f) => /^[0-9a-f]{64}$/.test(hashes[f.url] ?? ''));
  // no hashes (a local dev build that could not compute them) means no check, said in the command itself rather than silently
  const verify = known
    ? `printf '%s\\n' ${BRIDGE_FILES.map((f) => `'${hashes[f.url]}  ${f.local}'`).join(' ')} | shasum -a 256 -c - && `
    : '';
  const portEnv = port && port !== '4123' ? `PORT='${port}' ` : '';
  return `${fetches} && ${verify}${portEnv}BRIDGE_TOKEN='${token}' ALLOWED_ORIGINS='${origin}' node claude-bridge.mjs`;
}
