#!/usr/bin/env python3
"""Split a JSONL file into git-friendly shards capped at --max-bytes each.

Some harvests (Prove2Me's full ~54k-theorem pull, for one) produce a single
JSONL file too large for GitHub (100MB hard limit per file). This splits any
already-harvested JSONL into numbered shards by cumulative byte size, the
same git-size problem harvest.py's --split-into solves for Mathlib, but
byte-size-based instead of module-keyed since a flat theorem listing (like
Prove2Me's) has no natural module key to bucket by.

Usage:
    python3 split_jsonl.py --in data/tentative/prove2me.jsonl \\
        --out-prefix data/tentative/prove2me --max-bytes 41943040
    # writes data/tentative/prove2me-001.jsonl, -002.jsonl, ...
"""

from __future__ import annotations

import argparse
from pathlib import Path

DEFAULT_MAX_BYTES = 40 * 1024 * 1024  # 40MB, safely under GitHub's 100MB hard limit


def split(in_path: Path, out_prefix: Path, max_bytes: int) -> int:
    shard_index = 0
    shard_bytes = 0
    out_fh = None

    def open_next():
        nonlocal out_fh, shard_index, shard_bytes
        if out_fh is not None:
            out_fh.close()
        shard_index += 1
        out_fh = open(f"{out_prefix}-{shard_index:03d}.jsonl", "w", encoding="utf-8")
        shard_bytes = 0

    open_next()
    with in_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line_bytes = len(line.encode("utf-8"))
            if shard_bytes > 0 and shard_bytes + line_bytes > max_bytes:
                open_next()
            out_fh.write(line)
            shard_bytes += line_bytes
    out_fh.close()
    return shard_index


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in", dest="in_path", required=True, type=Path)
    parser.add_argument("--out-prefix", required=True, type=Path)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    args = parser.parse_args()

    count = split(args.in_path, args.out_prefix, args.max_bytes)
    print(f"wrote {count} shard(s) with prefix {args.out_prefix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
