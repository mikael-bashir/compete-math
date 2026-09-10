#!/usr/bin/env python3
"""Pull proved theorems + their accepted solutions from the Prove2Me API
(https://prove2.me), write JSONL for Tengoku's `tentative/` folder.

Prove2Me's own theorem listing (`GET /theorems`) only ever returns the
POSED statement (ending `:= by sorry` — see Prove2Me's own Theorems/
convention). The actual accepted proof lives on a separate ACCEPTED
submission, fetched per-theorem via two more calls. Every one of these is a
real, already-verified proof (Prove2Me's own kernel check gates ACCEPTED),
but Leak hasn't re-verified it on Leak's own toolchain — hence tentative,
same as every other harvested library.

Auth: needs an agent API key (env var PROVE2ME_API_KEY) — never pass it on
the command line or hardcode it; the key itself is exchanged here for a
short-lived access token via POST /api/v1/agent/refresh, which is what
every actual request uses (and re-exchanged automatically once it's close
to expiring).

Usage:
    export PROVE2ME_API_KEY=...   # your own agent key, never committed anywhere
    python3 harvest_prove2me.py --max 500 --out ../../../tengoku/data/tentative/prove2me.jsonl

`--max` bounds this run deliberately: Prove2Me holds 50,000+ proved
theorems, each needing 2 extra API calls beyond the listing page, so a full
harvest is its own long-running job, not something to run unbounded in one
sitting. Rerun with a higher --max (or add pagination resume logic) to grow
the corpus further; this script's job is to prove the pipeline works end to
end against the real API, with a real bounded seed.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

import urllib.error
import urllib.request

from lean_extract import extract_declarations

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("tengoku-harvest-prove2me")

API_BASE = "https://prove2.me/api/v1"
PAGE_SIZE = 50
REQUEST_DELAY_SECONDS = 0.15  # be a polite API citizen, not a hammer
TOKEN_REFRESH_MARGIN_SECONDS = 60


class Prove2MeClient:
    """Handles auth (API key -> short-lived access token, auto-refreshed)
    and plain JSON GET/POST against the Prove2Me API."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._access_token: Optional[str] = None
        self._expires_at: float = 0.0

    def _refresh_token(self) -> None:
        body = json.dumps({"api_key": self._api_key}).encode("utf-8")
        req = urllib.request.Request(
            f"{API_BASE}/agent/refresh",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        self._access_token = data["access_token"]
        self._expires_at = float(data["expires_at"])
        log.info("access token refreshed, expires_at=%s", self._expires_at)

    def _ensure_token(self) -> str:
        if self._access_token is None or time.time() > self._expires_at - TOKEN_REFRESH_MARGIN_SECONDS:
            self._refresh_token()
        assert self._access_token is not None
        return self._access_token

    def get(self, path: str) -> Any:
        token = self._ensure_token()
        req = urllib.request.Request(
            f"{API_BASE}{path}",
            headers={"Authorization": f"Bearer {token}"},
            method="GET",
        )
        time.sleep(REQUEST_DELAY_SECONDS)
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            log.warning("GET %s failed: %s %s", path, exc.code, body)
            return None


def normalize_toolchain(env_display_name: str) -> str:
    """"Mathlib c5ea003 (Lean v4.30.0)" -> "leanprover/lean4:v4.30.0"."""
    import re

    match = re.search(r"Lean\s+(v[\d.]+)", env_display_name)
    version = match.group(1) if match else "unknown"
    return f"leanprover/lean4:{version}"


def harvest(api_key: str, out_path: Path, max_count: int) -> int:
    client = Prove2MeClient(api_key)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    skipped_no_statement = 0
    skipped_no_solution = 0
    offset = 0

    with out_path.open("w", encoding="utf-8") as out:
        while written < max_count:
            page = client.get(f"/theorems?status=Proved&limit={PAGE_SIZE}&offset={offset}")
            if not page or not page.get("theorems"):
                log.info("no more theorems at offset=%d, stopping", offset)
                break

            for theorem in page["theorems"]:
                if written >= max_count:
                    break
                theorem_id = theorem["theorem_id"]
                name = theorem.get("theorem_name", "unnamed")

                decls = extract_declarations(theorem.get("formal_statement", ""))
                if not decls:
                    skipped_no_statement += 1
                    log.warning("no parsable statement for theorem_id=%s (%s), skipping", theorem_id, name)
                    continue
                statement = decls[0].statement

                submissions = client.get(
                    f"/theorems/{theorem_id}/submissions?status=ACCEPTED&first=true"
                )
                accepted = (submissions or {}).get("submissions") or []
                if not accepted:
                    skipped_no_solution += 1
                    log.warning("no ACCEPTED submission for theorem_id=%s (%s), skipping", theorem_id, name)
                    continue
                submission_id = accepted[0]["id"]

                solution = client.get(f"/submissions/{submission_id}/solution")
                proof_content = (solution or {}).get("content", "").strip()
                if not proof_content:
                    skipped_no_solution += 1
                    log.warning("empty solution content for submission_id=%s (theorem=%s), skipping", submission_id, name)
                    continue

                record = {
                    "name": name,
                    "statement": statement,
                    # The accepted solution is a whole self-contained Lean file
                    # (its own imports/helper lemmas + a final `theorem
                    # solution`), not just a proof-tactic tail like other
                    # harvested sources — so `proof` here IS the full file,
                    # not something meant to be appended after `statement`.
                    "proof": proof_content,
                    "status": "tentative",
                    "library": "prove2me",
                    "source_url": f"https://prove2.me/theorems/{theorem_id}",
                    "toolchain": normalize_toolchain(theorem.get("env_display_name", "")),
                }
                out.write(json.dumps(record) + "\n")
                written += 1
                if written % 25 == 0:
                    log.info("progress: %d/%d written", written, max_count)

            offset += PAGE_SIZE

    log.info(
        "done: %d written, %d skipped (no parsable statement), %d skipped (no accepted solution)",
        written,
        skipped_no_statement,
        skipped_no_solution,
    )
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max", type=int, default=200, help="max theorems to harvest this run")
    parser.add_argument("--out", required=True, type=Path, help="output JSONL path")
    args = parser.parse_args()

    api_key = os.environ.get("PROVE2ME_API_KEY")
    if not api_key:
        log.error("PROVE2ME_API_KEY environment variable is not set")
        return 1

    count = harvest(api_key, args.out, args.max)
    return 0 if count > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
