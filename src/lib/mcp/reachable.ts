// Is a remote MCP server answering? A cross-origin fetch cannot read the reply, but in no-cors mode it still resolves as soon as the
// server starts answering (and rejects if it cannot be reached), which is all a status light needs. The stream is closed straight away.

export async function checkReachable(url: string, timeoutMs = 7000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}
