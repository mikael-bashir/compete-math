#!/usr/bin/env python3
"""Clone a Lean 4 repo, extract every theorem/lemma statement AND its proof,
write JSONL for Tengoku's `tentative/` folder.

Usage:
    python3 harvest.py --repo https://github.com/owner/name.git \\
        --library compfiles --toolchain leanprover/lean4:v4.34.0-rc1 \\
        --out ../../../tengoku/data/tentative/compfiles.jsonl

Rerunnable per-library — this is the whole pipeline, not a one-off script.
Only depends on `git` being on PATH; no Lean toolchain install required
since this never builds or elaborates the project (see lean_extract.py).

Output always has status="tentative": these are real proofs from a real
library, but Leak's own services haven't re-verified them yet — that's
what `source_url` is for (the reason to believe it's correct until then).
Only Leak's own certification moves an entry to `trusted/` — see
export-competemath-theorems.ts, which reads already-Leak-certified proofs
straight from the database.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from lean_extract import extract_declarations

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("tengoku-harvest")


def clone_repo(repo_url: str, dest: Path) -> None:
    log.info("cloning %s (shallow, depth=1)...", repo_url)
    subprocess.run(
        ["git", "clone", "--depth", "1", "--quiet", repo_url, str(dest)],
        check=True,
    )
    log.info("clone complete: %s", dest)


def iter_lean_files(root: Path):
    yield from root.rglob("*.lean")


def _split_key(rel_path: str) -> str:
    """The second path component, lowercased (e.g. "Mathlib/Algebra/Group/
    Defs.lean" -> "algebra") — used to bucket a huge library's output into
    multiple git-friendly files instead of one massive one. Falls back to
    the first component for a shallower path."""
    parts = Path(rel_path).parts
    key = parts[1] if len(parts) > 2 else parts[0]
    return key.lower()


def harvest(
    repo_url: str,
    library: str,
    toolchain: str,
    out_path: Path | None = None,
    split_dir: Path | None = None,
) -> int:
    """Either write everything to one `out_path`, or — for a library too big
    for one git-friendly file (e.g. Mathlib itself, 100k+ declarations) —
    pass `split_dir` instead to bucket output into `<split_dir>/<library>-
    <module>.jsonl` files by each declaration's second path component."""
    assert (out_path is None) != (split_dir is None), "pass exactly one of out_path/split_dir"

    with tempfile.TemporaryDirectory(prefix="tengoku-harvest-") as tmp:
        repo_dir = Path(tmp) / "repo"
        clone_repo(repo_url, repo_dir)

        # Best-effort: point resource URLs at the actual pinned commit rather
        # than a moving branch ref, so a link never silently changes meaning.
        try:
            commit = subprocess.run(
                ["git", "-C", str(repo_dir), "rev-parse", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
        except subprocess.CalledProcessError:
            commit = "main"
            log.warning("could not resolve HEAD commit, falling back to 'main' in URLs")

        repo_web = repo_url.removesuffix(".git")
        count = 0
        skipped_files = 0
        open_files: dict[str, Any] = {}

        try:
            if out_path is not None:
                out_path.parent.mkdir(parents=True, exist_ok=True)
                open_files["__single__"] = out_path.open("w", encoding="utf-8")

            for lean_file in iter_lean_files(repo_dir):
                rel_path = lean_file.relative_to(repo_dir).as_posix()
                try:
                    source = lean_file.read_text(encoding="utf-8")
                except (UnicodeDecodeError, OSError) as e:
                    skipped_files += 1
                    log.warning("skipping unreadable file %s: %s", rel_path, e)
                    continue

                for decl in extract_declarations(source):
                    record = {
                        "name": decl.name,
                        "statement": decl.statement,
                        "proof": decl.proof,
                        "status": "tentative",
                        "library": library,
                        "source_url": f"{repo_web}/blob/{commit}/{rel_path}#L{decl.line}",
                        "toolchain": toolchain,
                    }
                    if out_path is not None:
                        fh = open_files["__single__"]
                    else:
                        key = f"{library}-{_split_key(rel_path)}"
                        if key not in open_files:
                            split_dir.mkdir(parents=True, exist_ok=True)
                            open_files[key] = (split_dir / f"{key}.jsonl").open("w", encoding="utf-8")
                        fh = open_files[key]
                    fh.write(json.dumps(record) + "\n")
                    count += 1

                if skipped_files and skipped_files % 200 == 0:
                    log.info("progress: %d declarations so far, %d files skipped", count, skipped_files)
        finally:
            for fh in open_files.values():
                fh.close()

        log.info(
            "done: %d declarations extracted across %d file(s), %d source files skipped",
            count,
            len(open_files),
            skipped_files,
        )
        return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="git URL to clone")
    parser.add_argument("--library", required=True, help="short library name, e.g. 'compfiles'")
    parser.add_argument("--toolchain", required=True, help="Lean toolchain string to record")
    parser.add_argument("--out", type=Path, help="single output JSONL path")
    parser.add_argument(
        "--split-into", type=Path,
        help="directory to write <library>-<module>.jsonl files into, for a library too "
             "big for one git-friendly file (e.g. Mathlib itself). Mutually exclusive with --out.",
    )
    args = parser.parse_args()

    if bool(args.out) == bool(args.split_into):
        log.error("pass exactly one of --out or --split-into")
        return 1

    if shutil.which("git") is None:
        log.error("git is required on PATH")
        return 1

    count = harvest(args.repo, args.library, args.toolchain, out_path=args.out, split_dir=args.split_into)
    return 0 if count > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
