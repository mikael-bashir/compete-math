// Looking a lemma up without shipping any names: names.bin holds the FNV-1a hash of every trusted lemma's last name component with its star index.

const KEYWORDS = new Set([
  'theorem', 'lemma', 'example', 'by', 'fun', 'have', 'show', 'from', 'with', 'then', 'else', 'let', 'in', 'at', 'import', 'open', 'namespace',
  'end', 'variable', 'instance', 'def', 'structure', 'class', 'Type', 'Prop', 'Sort', 'sorry', 'exact', 'apply', 'intro', 'simp', 'rfl', 'rw',
  'omega', 'linarith', 'norm_num', 'constructor', 'cases', 'rcases', 'obtain', 'calc', 'using', 'only', 'refine', 'use', 'ring', 'decide',
]);

export function fnv1a(s: string): number {
  const bytes = new TextEncoder().encode(s.toLowerCase());
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const lastComponent = (name: string): string => name.slice(name.lastIndexOf('.') + 1);

export class NameIndex {
  constructor(
    private readonly keys: Uint32Array,
    private readonly vals: Uint32Array,
  ) {}

  /** names.bin layout: u32 count, count sorted u32 hashes, count u32 star indices */
  static fromBuffer(buf: ArrayBuffer): NameIndex {
    const n = new Uint32Array(buf, 0, 1)[0];
    return new NameIndex(new Uint32Array(buf, 4, n), new Uint32Array(buf, 4 + 4 * n, n));
  }

  /** Every star whose lemma has this name's last component. */
  find(name: string): number[] {
    const key = fnv1a(lastComponent(name));
    let lo = 0;
    let hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.keys[mid] < key) lo = mid + 1;
      else hi = mid;
    }
    const out: number[] = [];
    for (let i = lo; i < this.keys.length && this.keys[i] === key; i++) out.push(this.vals[i]);
    return out;
  }
}

/** Identifier-like tokens in a piece of Lean or tool output, first occurrence first. */
export function extractNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_'.\u2080-\u2089!?]*/g)) {
    const tok = m[0].replace(/\.+$/, '');
    if (tok.length < 3 || KEYWORDS.has(tok) || seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

/** Names a search result lists: loogle's `Name: X` lines and moogle's `theorem X : …` lines. */
export function resultNames(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/^\s*Name:\s+(\S+)/gm)) out.push(m[1]);
  for (const m of body.matchAll(/^(?:theorem|lemma|def|instance|structure|class|abbrev|axiom|opaque)\s+([^\s:(\[{]+)/gm)) out.push(m[1]);
  return [...new Set(out)];
}
