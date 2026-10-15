"""For every library with a pinned source checkout in competemath/tengoku's schemas/sources.json: how many theorem and lemma declarations
Tengoku's own harvester (tools/lean_extract.py) finds in the pinned commit's .lean files, read from the tarball and never stored.
That is the library's total for the "yield" on /tengoku. Writes src/app/lib/data/tengoku-source-counts.json (library -> count).

    python3 scripts/tengoku-source-counts.py <path to schemas/sources.json> <directory holding lean_extract.py> <out.json>

Rerun when a library is added or a pin moves. A library the scanner cannot finish in 7 minutes is left out, not guessed."""
import io, json, re, signal, subprocess, sys, tarfile, concurrent.futures as cf

SOURCES, SCANNER_DIR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, SCANNER_DIR)
corpora = json.load(open(SOURCES))["corpora"]
from lean_extract import extract_declarations  # noqa: E402

class Slow(Exception): pass
def _alarm(*_): raise Slow()

def count_repo(name, c):
    signal.signal(signal.SIGALRM, _alarm); signal.alarm(420)  # the scanner can be slow on one huge file; give up on that library, do not stall the rest
    try:
        return _count_repo(name, c)
    except Slow:
        return name, {"error": "scanner timed out"}
    finally:
        signal.alarm(0)

def _count_repo(name, c):
    m = re.match(r"https://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$", c["repo"])
    if not m: return name, {"error": f"repo {c['repo']}"}
    url = f"https://codeload.github.com/{m.group(1)}/{m.group(2)}/tar.gz/{c['commit']}"
    p = subprocess.run(["curl", "-sfL", "--max-time", "300", url], capture_output=True)
    if p.returncode: return name, {"error": f"download {p.returncode}"}
    base = (c.get("path") or "").strip("/")
    roots = c.get("roots") or []
    n = files = 0
    with tarfile.open(fileobj=io.BytesIO(p.stdout), mode="r:gz") as t:
        for mem in t:
            if not mem.isfile() or not mem.name.endswith(".lean"): continue
            rel = mem.name.split("/", 1)[1] if "/" in mem.name else mem.name
            if base:
                if not rel.startswith(base + "/"): continue
                rel = rel[len(base) + 1:]
            text = t.extractfile(mem).read().decode("utf-8", "replace")
            n += len(extract_declarations(text)); files += 1
    return name, {"theorems": n, "files": files, "repo": c["repo"], "commit": c["commit"], "roots": roots}

out = {}
if __name__ == "__main__":
    with cf.ProcessPoolExecutor(6) as ex:
        futs = [ex.submit(count_repo, k, v) for k, v in corpora.items()]
        for f in cf.as_completed(futs):
            name, r = f.result()
            out[name] = r
            print(name, r.get("theorems", r.get("error")), file=sys.stderr, flush=True)
    counts = {k: v["theorems"] for k, v in sorted(out.items()) if v.get("theorems")}
    json.dump(counts, open(OUT, "w"), separators=(",", ":"))
