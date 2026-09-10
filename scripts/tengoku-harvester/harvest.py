#!/usr/bin/env python3
"""Clone a Lean 4 repo, extract every theorem/lemma statement, write JSONL.

Usage:
    python3 harvest.py --repo https://github.com/owner/name.git \\
        --library compfiles --toolchain leanprover/lean4:v4.34.0-rc1 \\
        --out ../../../tengoku/data/compfiles.jsonl

Rerunnable per-library — this is the whole pipeline, not a one-off script.
Only depends on `git` being on PATH; no Lean toolchain install required
since this never builds or elaborates the project (see lean_extract.py for
why a syntactic scan is enough for a "statements to re-attempt" corpus).
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


def harvest(repo_url: str, library: str, toolchain: str, out_path: Path) -> int:
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
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as out:
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
                        "library": library,
                        "source_url": f"{repo_web}/blob/{commit}/{rel_path}#L{decl.line}",
                        "toolchain": toolchain,
                    }
                    out.write(json.dumps(record) + "\n")
                    count += 1

        log.info(
            "done: %d declarations extracted, %d files skipped, written to %s",
            count,
            skipped_files,
            out_path,
        )
        return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="git URL to clone")
    parser.add_argument("--library", required=True, help="short library name, e.g. 'compfiles'")
    parser.add_argument("--toolchain", required=True, help="Lean toolchain string to record")
    parser.add_argument("--out", required=True, type=Path, help="output JSONL path")
    args = parser.parse_args()

    if shutil.which("git") is None:
        log.error("git is required on PATH")
        return 1

    count = harvest(args.repo, args.library, args.toolchain, args.out)
    return 0 if count > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
