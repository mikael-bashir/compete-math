// Turn a search result's source link (commit, file, line) into what the results list shows: the proof, and a complete script that runs in a Tengoku
// checkout. The index does not store proofs (the library is the source of truth); the proof is read from the file at the commit the result came from.

export interface SourceRef {
  /** The Tengoku commit the index linked (absent for a link that already names Lean's repository). */
  sha: string | null;
  /** The Lean toolchain tag of a core file (known when the link is already a leanprover/lean4 link). */
  tag: string | null;
  path: string; line: number;
  /** `tree`: a file of the Tengoku repository. `core`: Lean's own library (Init, Std, Lean), which the index links under the tree's commit although it is not in that repository. */
  root: "tree" | "core";
}

const TREE_URL = /^https:\/\/github\.com\/competemath\/tengoku\/blob\/([0-9a-f]{40})\/((?:Tengoku|Init|Std|Lean)\/[A-Za-z0-9_./«»'-]+\.lean)#L(\d{1,7})$/;
const CORE_URL = /^https:\/\/github\.com\/leanprover\/lean4\/blob\/(v[0-9A-Za-z.\-]+)\/src\/((?:Init|Std|Lean)\/[A-Za-z0-9_./«»'-]+\.lean)#L(\d{1,7})$/;

/** The only links the source route will fetch: a file of the Tengoku tree at a commit, or of Lean's core library at a release tag. */
export function parseSourceUrl(url: string): SourceRef | null {
  const tree = TREE_URL.exec(url);
  if (tree && !tree[2].includes("..") && !tree[2].includes("//")) {
    return { sha: tree[1], tag: null, path: tree[2], line: Number(tree[3]), root: tree[2].startsWith("Tengoku/") ? "tree" : "core" };
  }
  const core = CORE_URL.exec(url);
  if (core && !core[2].includes("..") && !core[2].includes("//")) return { sha: null, tag: core[1], path: core[2], line: Number(core[3]), root: "core" };
  return null;
}

/** The toolchain tag of a `lean-toolchain` file (`leanprover/lean4:v4.34.0-rc2`), or the default the tree is seeded from. */
export function toolchainTag(file: string | null | undefined, fallback = "v4.34.0-rc2"): string {
  const m = /^leanprover\/lean4:(v[0-9A-Za-z.\-]+)\s*$/.exec((file ?? "").trim());
  return m ? m[1] : fallback;
}

/** Where the file can be read: the tree at the result's commit, or Lean's repository at the tree's toolchain. */
export function rawUrl(ref: SourceRef, tag: string): string {
  return ref.root === "tree"
    ? `https://raw.githubusercontent.com/competemath/tengoku/${ref.sha}/${ref.path}`
    : `https://raw.githubusercontent.com/leanprover/lean4/${ref.tag ?? tag}/src/${ref.path}`;
}

/** The link a person can open: core declarations are in leanprover/lean4, not in the Tengoku repository. */
export function displayUrl(ref: SourceRef, tag: string): string {
  return ref.root === "tree"
    ? `https://github.com/competemath/tengoku/blob/${ref.sha}/${ref.path}#L${ref.line}`
    : `https://github.com/leanprover/lean4/blob/${ref.tag ?? tag}/src/${ref.path}#L${ref.line}`;
}

export const moduleOf = (path: string) => path.replace(/\.lean$/, "").split("/").join(".");

/** The module a file of an older commit is called in the tree today: the Mathlib seed moved to `Tengoku/Seed/` (2026-10-05); the index still links the commit it was built from. */
export function moduleCandidates(path: string): string[] {
  const mod = moduleOf(path);
  return path.startsWith("Tengoku/") && !path.startsWith("Tengoku/Seed/") ? [mod, `Tengoku.Seed.${mod.slice("Tengoku.".length)}`] : [mod];
}

/** The first candidate module that is a file of the tree's main branch; `Tengoku.All` (the whole tree, slower to load) when the module has moved on. */
export async function resolveModule(path: string, existsOnMain: (modulePath: string) => Promise<boolean>): Promise<string> {
  for (const m of moduleCandidates(path)) if (await existsOnMain(`${m.split(".").join("/")}.lean`)) return m;
  return /^(Init|Std|Lean)\//.test(path) ? moduleOf(path) : "Tengoku.All";
}

// A declaration's lines are indented; the next command starts in column 0. A few column-0 lines still belong to the declaration.
const CONTINUATION = /^(?:\||termination_by\b|decreasing_by\b|deriving\b|where\b|:=|by\b|fun\b|\)|\]|\}|⟩|<;>|·)/;

/** Lines with `/- … -/` comments blanked out (they nest), so a column-0 word inside a comment is not read as a command. */
function maskBlockComments(lines: string[]): string[] {
  let depth = 0;
  return lines.map((ln) => {
    let out = "";
    for (let i = 0; i < ln.length; i++) {
      if (ln.startsWith("/-", i)) { depth++; i++; out += "  "; continue; }
      if (depth > 0 && ln.startsWith("-/", i)) { depth--; i++; out += "  "; continue; }
      out += depth > 0 ? " " : ln[i];
    }
    return out;
  });
}

export interface Declaration {
  startLine: number; endLine: number;     // 1-based, inclusive
  code: string;                           // the whole declaration, docstring and attributes included
  header: string;                         // up to the declaration's own `:=` (or all of it)
  proof: string;                          // from `:=` on, or the `|` alternatives; empty for a structure or a class
  declared: string | null;                // the name the keyword line declares
  kind: string | null;                    // its keyword
}

/** The declaration that starts at `line` (the index's `line`: the first line of the declaration, attributes and docstring included). */
export function extractDeclaration(text: string, line: number): Declaration | null {
  const lines = text.split("\n");
  if (line < 1 || line > lines.length) return null;
  const masked = maskBlockComments(lines);
  let start = line - 1;
  // The index may point at the keyword line: take the attributes and the docstring right above it.
  while (start > 0 && /^@\[/.test(lines[start - 1])) start--;
  if (start > 0 && /-\/\s*$/.test(lines[start - 1])) {
    let j = start - 1;
    while (j >= 0 && !/^\/--/.test(lines[j])) j--;
    if (j >= 0 && start - j < 200) start = j;
  }
  // The keyword line is the first line after the attributes and the docstring; it starts in column 0 like the lines it follows.
  let kw = Math.max(line - 1, start);
  while (kw < lines.length - 1 && (/^@\[[^\n]*\]\s*$/.test(masked[kw]) || masked[kw].trim() === "" )) kw++;
  let end = kw;
  for (let i = kw + 1; i < lines.length; i++) {
    const m = masked[i];
    if (m.trim() === "") { continue; }
    if (/^\S/.test(m) && !CONTINUATION.test(m)) break;
    end = i;
  }
  // trailing blank lines and comment-only lines belong to the next thing
  while (end > start && masked[end].trim() === "") end--;
  const code = lines.slice(start, end + 1).join("\n");
  const split = splitHeaderAndProof(code);
  const declared = declaredName(code);
  return { startLine: start + 1, endLine: end + 1, code, header: split.header, proof: split.proof, declared, kind: declaredKeyword(code) };
}

const KEYWORD = /^(?:(?:@\[[^\]]*\]\s*|private\s+|protected\s+|noncomputable\s+|unsafe\s+|partial\s+|nonrec\s+|public\s+|meta\s+|scoped\s+|local\s+)*)(theorem|lemma|def|abbrev|instance|structure|class|inductive|axiom|opaque|example)\b\s*([^\s:({\[⦃]*)/;

/** The keyword of the declaration (`theorem`, `lemma`, `def`, `instance`, …), `null` when no keyword line is found. */
export function declaredKeyword(code: string): string | null {
  const rest = code.replace(/^\s*\/--[\s\S]*?-\/\s*/, "");
  for (const ln of rest.split("\n")) {
    const m = KEYWORD.exec(ln.trimStart());
    if (m) return m[1];
    if (!/^\s*(@\[|\/--|--|$)/.test(ln) && !/^\s*[A-Za-z_]+\s*$/.test(ln)) break;
  }
  return null;
}

/** The name the declaration's keyword line gives, `null` for an instance without one or an example. */
export function declaredName(code: string): string | null {
  let rest = code;
  // skip the docstring and the attribute lines above the keyword
  rest = rest.replace(/^\s*\/--[\s\S]*?-\/\s*/, "");
  for (const ln of rest.split("\n")) {
    const m = KEYWORD.exec(ln.trimStart());
    if (m) return m[2] || null;
    if (!/^\s*(@\[|\/--|--|$)/.test(ln) && !/^\s*[A-Za-z_]+\s*$/.test(ln)) break;
  }
  return null;
}

/** Split a declaration at its own `:=` (outside brackets, comments and strings); equation-style definitions split at the first `|` line. */
export function splitHeaderAndProof(code: string): { header: string; proof: string } {
  const n = code.length;
  let depth = 0, block = 0, i = 0;
  const open = "([{⟨⦃", close = ")]}⟩⦄";
  // the docstring and attributes come first: start counting at the keyword line
  const kw = /^(?:\s*(?:@\[[^\]]*\]|private|protected|noncomputable|unsafe|partial|nonrec|public|meta|scoped|local))*\s*(?:theorem|lemma|def|abbrev|instance|structure|class|inductive|axiom|opaque|example)\b/m;
  const body = code.replace(/^\s*\/--[\s\S]*?-\/\s*/, (s) => " ".repeat(s.length));
  const km = kw.exec(body);
  i = km ? km.index : 0;
  for (; i < n; i++) {
    const c = body[i];
    if (block > 0) { if (body.startsWith("-/", i)) { block--; i++; } else if (body.startsWith("/-", i)) { block++; i++; } continue; }
    if (body.startsWith("/-", i)) { block++; i++; continue; }
    if (body.startsWith("--", i)) { while (i < n && body[i] !== "\n") i++; continue; }
    if (c === '"') { i++; while (i < n && body[i] !== '"') { if (body[i] === "\\") i++; i++; } continue; }
    if (open.includes(c)) depth++;
    else if (close.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && body.startsWith(":=", i)) return { header: code.slice(0, i).trimEnd(), proof: code.slice(i + 2).trim() };
  }
  const alt = /\n[ \t]*\|/.exec(body);
  if (alt) return { header: code.slice(0, alt.index).trimEnd(), proof: code.slice(alt.index + 1).trim() };
  return { header: code.trimEnd(), proof: "" };
}

export interface OpenContext { opens: string[]; namespaces: string[] }

/** The namespaces and `open` commands in scope at `line`: what the declaration's file had set up above it. */
export function openContext(text: string, line: number): OpenContext {
  const lines = maskBlockComments(text.split("\n")).slice(0, Math.max(0, line - 1));
  const scopes: { kind: "namespace" | "section"; name: string; opens: string[] }[] = [{ kind: "section", name: "", opens: [] }];
  for (const ln of lines) {
    let m = /^namespace\s+(\S+)/.exec(ln);
    if (m) { scopes.push({ kind: "namespace", name: m[1], opens: [] }); continue; }
    m = /^section\b\s*(\S*)/.exec(ln);
    if (m) { scopes.push({ kind: "section", name: m[1], opens: [] }); continue; }
    if (/^end\b/.test(ln) && scopes.length > 1) { scopes.pop(); continue; }
    m = /^open\s+(.+)$/.exec(ln);
    if (m && !/\bin\s*$/.test(m[1]) && !/\bin\b/.test(m[1])) scopes[scopes.length - 1].opens.push(m[1].trim());
  }
  return { opens: scopes.flatMap((s) => s.opens), namespaces: scopes.filter((s) => s.kind === "namespace").map((s) => s.name) };
}

const UNIVERSE = /\b(u_\d+|u|v|w)\b(?=[^\w]|$)/g;

export interface ScriptInput { kind?: string | null; module: string; name: string; statement: string; library: string; tier: string; sourceUrl: string; opens: string[]; namespaces: string[] }

/** A complete file that runs in a Tengoku checkout: `lake env lean example.lean` after `scripts/cache.sh get`. */
export function buildScript(s: ScriptInput): string {
  const universes = new Set<string>();
  for (const m of s.statement.matchAll(/\b(?:Type|Sort)\s*\(?([^)]*?)(?:\)|,|\]|$)/g)) for (const u of m[1].matchAll(UNIVERSE)) universes.add(u[1]);
  for (const m of s.statement.matchAll(/\bu_\d+\b/g)) universes.add(m[0]);
  const opens = [...new Set([...s.namespaces.map((n) => n), ...s.opens])];
  // A printed statement does not always elaborate again: an inaccessible name (a✝), or a lambda whose binder type was left out (`fun p => max p.1 p.2`).
  const typeable = s.statement.trim() !== "" && !s.statement.includes("✝") && !/\bfun\b|↦|λ|\.\d\b/.test(s.statement);
  const out: string[] = [
    "/-",
    `  Tengoku: ${s.name}  (library ${s.library}, ${s.tier})`,
    `  ${s.sourceUrl}`,
    "  Run it in a Tengoku checkout, after `scripts/cache.sh get` has downloaded the compiled library:",
    "    lake env lean example.lean",
    "-/",
    `import ${s.module}`,
    "",
    "set_option linter.unusedVariables false  -- the statement below names its instance arguments",
  ];
  if (universes.size) out.push(`universe ${[...universes].sort().join(" ")}`);
  if (opens.length) out.push(...opens.map((o) => `open ${o}`));
  out.push("");
  out.push(`#check @${s.name}`, `#print axioms ${s.name}`, "");
  const proves = !s.kind || s.kind === "theorem" || s.kind === "lemma";
  if (!proves) {
    // a definition, instance, structure or class: its statement is its type, and what it is made of is what a reader wants
    out.push("-- what it is", `#print ${s.name}`, "");
  } else if (typeable) {
    // A printed statement does not always elaborate again (an elaboration order, a numeral): the example stays silent then, and the checks above are the script.
    out.push("-- the statement, written out, closed by the theorem from the tree (silent if the printed form does not elaborate again on its own)", "#guard_msgs (drop all) in", `example : ${s.statement} :=`, `  @${s.name}`, "");
  } else {
    out.push("-- (the statement is not repeated as an example: as printed it does not elaborate again on its own; `#check` above shows it)", "");
  }
  return out.join("\n");
}
