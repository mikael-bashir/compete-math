// The pure part of counting a theorem once. Tentative files in competemath/tengoku are append-only, so a record stays when its
// library arrives as a bundle after the harvest, and when it is promoted: the theorem is then also a manifest line or a trusted
// record. scripts/stats.py (count_already_trusted) counts such a record as trusted only, and so does this: same rule.
//
//   every trusted record and every manifest line is one theorem, one token; it accounts for AT MOST ONE tentative record, found by
//   its name (a promoted record keeps it) or by its statement, leading @[...] attributes and whitespace aside (a manifest line's
//   name is fully qualified and the harvester's is bare). A token is spent when it matches, so a statement repeated in a file, or
//   in two namespaces, is never removed more often than the tree holds it.
//
// A record is a newline-terminated line, the boundary the line counts use: a last line with no newline is not a record yet.
import { countNewlines } from "./tengoku-live-count-core";

const ATTRIBUTES = /^\s*(?:@\[[^\]]*\]\s*)+/;

export function statementKey(statement: unknown): string | null {
  if (typeof statement !== "string" || !statement) return null;
  return statement.replace(ATTRIBUTES, "").split(/\s+/).filter(Boolean).join(" ");
}

/** What a library's trusted side can account for. */
export class TrustedTokens {
  private readonly byName = new Map<string, number[]>();
  private readonly byKey = new Map<string, number[]>();
  private readonly used: boolean[] = [];

  add(name: string | null, key: string | null): void {
    const i = this.used.length;
    this.used.push(false);
    if (name) this.push(this.byName, name, i);
    if (key) this.push(this.byKey, key, i);
  }

  get size(): number {
    return this.used.length;
  }

  /** Spends one token for this tentative record, if there is a matching one left. */
  match(record: Record<string, unknown>): boolean {
    return this.take(typeof record.name === "string" ? record.name : null, this.byName) || this.take(statementKey(record.statement), this.byKey);
  }

  private push(index: Map<string, number[]>, ident: string, i: number): void {
    const list = index.get(ident);
    if (list) list.push(i);
    else index.set(ident, [i]);
  }

  private take(ident: string | null, index: Map<string, number[]>): boolean {
    const pending = ident ? index.get(ident) : undefined;
    while (pending && pending.length > 0) {
      const i = pending.pop() as number;
      if (!this.used[i]) {
        this.used[i] = true;
        return true;
      }
    }
    return false;
  }
}

/** Walks a JSONL body line by line, whatever way the bytes are cut into chunks. Only newline-terminated lines are records; one that
 * is not a JSON object is skipped. */
export async function* records(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of chunks) {
    rest += decoder.decode(chunk, { stream: true });
    let at: number;
    while ((at = rest.indexOf("\n")) !== -1) {
      const line = rest.slice(0, at);
      rest = rest.slice(at + 1);
      const r = parseRecord(line);
      if (r) yield r;
    }
  }
}

function parseRecord(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const v: unknown = JSON.parse(line);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Adds a trusted file's records (each by its name and statement) or a manifest's lines (by statement only) as tokens. */
export async function collectTrusted(into: TrustedTokens, chunks: AsyncIterable<Uint8Array>, withNames: boolean): Promise<void> {
  for await (const r of records(chunks)) {
    into.add(withNames && typeof r.name === "string" ? r.name : null, statementKey(r.statement));
  }
}

/** How many records of a tentative file the tree already trusts, each trusted theorem accounting for one. */
export async function countAlreadyTrusted(tokens: TrustedTokens, chunks: AsyncIterable<Uint8Array>): Promise<number> {
  if (tokens.size === 0) return 0;
  let n = 0;
  for await (const r of records(chunks)) if (tokens.match(r)) n++;
  return n;
}

export { countNewlines };
