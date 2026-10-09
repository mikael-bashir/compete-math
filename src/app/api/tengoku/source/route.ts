import { NextRequest, NextResponse } from "next/server";
import { buildScript, displayUrl, extractDeclaration, openContext, parseSourceUrl, rawUrl, resolveModule, toolchainTag } from "@/app/lib/tengoku-source/extract";

// The proof and a runnable script for one search result. The index stores no proofs: this reads the file the result came from, at the commit it came
// from (a commit never changes, so the answer is cached for good). Only links to the Tengoku tree are fetched.
const MAX_BYTES = 6_000_000;
const IMMUTABLE = { "Cache-Control": "public, s-maxage=31536000, max-age=86400, immutable" };

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const url = sp.get("url") ?? "";
  const ref = parseSourceUrl(url);
  if (!ref) return NextResponse.json({ error: "not a link to a file of the Tengoku tree" }, { status: 400 });
  const name = sp.get("name") ?? "";
  if (!/^[A-Za-z_«][\w.'«»!?]*$/u.test(name)) return NextResponse.json({ error: "name" }, { status: 400 });
  let tag = "";
  if (ref.root === "core" && ref.sha) {
    // Lean's own library: read it from leanprover/lean4 at the toolchain the tree is built with (its lean-toolchain file, at that commit).
    const tc = await fetch(`https://raw.githubusercontent.com/competemath/tengoku/${ref.sha}/lean-toolchain`, { next: { revalidate: 31536000 } }).then((r) => (r.ok ? r.text() : null), () => null);
    tag = toolchainTag(tc);
  }
  const raw = rawUrl(ref, tag);
  let text: string;
  try {
    const res = await fetch(raw, { next: { revalidate: 31536000 } });
    if (!res.ok) return NextResponse.json({ error: `the file is not available at that commit (${res.status})` }, { status: 404 });
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return NextResponse.json({ error: "file too large" }, { status: 413 });
    text = await res.text();
  } catch {
    return NextResponse.json({ error: "could not read the file from GitHub" }, { status: 502 });
  }
  const decl = extractDeclaration(text, ref.line);
  if (!decl) return NextResponse.json({ error: "the declaration was not found in the file" }, { status: 404 });
  const ctx = openContext(text, decl.startLine);
  const last = name.split(".").pop() ?? name;
  const generated = decl.declared && decl.declared.split(".").pop() !== last ? decl.declared : null;
  // The index links the commit it was built from; the module is called what the tree's main branch calls it today.
  const exists = (p: string) => fetch(`https://raw.githubusercontent.com/competemath/tengoku/main/${p}`, { method: "HEAD", next: { revalidate: 3600 } }).then((r) => r.ok, () => false);
  const importModule = await resolveModule(ref.path, exists);
  const script = buildScript({
    module: importModule, kind: decl.kind, name, statement: sp.get("statement") ?? "", library: sp.get("library") ?? "", tier: sp.get("tier") ?? "",
    sourceUrl: displayUrl(ref, tag), opens: ctx.opens, namespaces: ctx.namespaces,
  });
  return NextResponse.json(
    { proof: decl.proof, declaration: decl.code, sourceUrl: displayUrl(ref, tag), startLine: decl.startLine, endLine: decl.endLine, module: importModule, generatedFrom: generated, script },
    { headers: IMMUTABLE },
  );
}
