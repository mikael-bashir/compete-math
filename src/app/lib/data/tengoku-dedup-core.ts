// The pure part of counting a theorem once. Tentative files in competemath/tengoku are append-only, so a record stays when its
// library arrives as a bundle after the harvest, and when it is promoted: the theorem is then also a manifest line or a trusted
// record. scripts/stats.py (count_already_trusted) counts such a record as trusted only, and so does this: same identity rule.
//
//   a tentative record is already trusted when its name is a trusted record's name, or its statement, leading @[...] attributes
//   and whitespace aside, is a manifest line's or a trusted record's statement
import { countNewlines } from "./tengoku-live-count-core";

const ATTRIBUTES = /^\s*(?:@\[[^\]]*\]\s*)+/;

export function statementKey(statement: unknown): string | null {
  if (typeof statement !== "string" || !statement) return null;
  return statement.replace(ATTRIBUTES, "").split(/\s+/).filter(Boolean).join(" ");
}

export interface Trusted {
  names: Set<string>;
  keys: Set<string>;
}

/** Walks a JSONL body line by line, whatever way the bytes are cut into chunks; a line that is not a JSON object is skipped. */
export async function* records(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let rest = "";
  const parse = (line: string): Record<string, unknown> | null => {
    try {
      const v: unknown = JSON.parse(line);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  for await (const chunk of chunks) {
    rest += decoder.decode(chunk, { stream: true });
    let at: number;
    while ((at = rest.indexOf("\n")) !== -1) {
      const line = rest.slice(0, at);
      rest = rest.slice(at + 1);
      if (line.trim()) {
        const r = parse(line);
        if (r) yield r;
      }
    }
  }
  rest += decoder.decode();
  if (rest.trim()) {
    const r = parse(rest);
    if (r) yield r;
  }
}

/** The identities a trusted file (names and statements) or a manifest (statements only) contributes. */
export async function collectTrusted(into: Trusted, chunks: AsyncIterable<Uint8Array>, withNames: boolean): Promise<void> {
  for await (const r of records(chunks)) {
    if (withNames && typeof r.name === "string") into.names.add(r.name);
    const k = statementKey(r.statement);
    if (k) into.keys.add(k);
  }
}

/** How many records of a tentative file the tree already trusts. */
export async function countAlreadyTrusted(trusted: Trusted, chunks: AsyncIterable<Uint8Array>): Promise<number> {
  if (trusted.names.size === 0 && trusted.keys.size === 0) return 0;
  let n = 0;
  for await (const r of records(chunks)) {
    const k = statementKey(r.statement);
    if ((typeof r.name === "string" && trusted.names.has(r.name)) || (k !== null && trusted.keys.has(k))) n++;
  }
  return n;
}

export { countNewlines };
