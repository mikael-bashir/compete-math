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
every actual request uses (thread-safe auto-refresh once close to expiry).

Concurrency: each theorem needs 2 extra API calls beyond its listing page,
and Prove2Me holds 50,000+ proved theorems — sequential-with-politeness-
delay would take the better part of a day. Fetches for one page's worth of
theorems run concurrently (bounded worker pool), with retry+backoff on
transient failures (429/5xx/network) so one flaky call doesn't lose an
otherwise-good theorem.

Usage:
    export PROVE2ME_API_KEY=...   # your own agent key, never committed anywhere
    python3 harvest_prove2me.py --out ../../../tengoku/data/tentative/prove2me.jsonl
    # or bound it: --max 5000
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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
WORKERS = 20
TOKEN_REFRESH_MARGIN_SECONDS = 60
MAX_RETRIES = 4
RETRY_BASE_DELAY_SECONDS = 1.0


class Prove2MeClient:
    """Thread-safe: handles auth (API key -> short-lived access token,
    auto-refreshed) and plain JSON GET/POST against the Prove2Me API, with
    retry+backoff on transient failures. Safe to share across worker threads."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._access_token: Optional[str] = None
        self._expires_at: float = 0.0
        self._token_lock = threading.Lock()

    def _refresh_token_locked(self) -> None:
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
        with self._token_lock:
            if self._access_token is None or time.time() > self._expires_at - TOKEN_REFRESH_MARGIN_SECONDS:
                self._refresh_token_locked()
            assert self._access_token is not None
            return self._access_token

    def get(self, path: str) -> Any:
        last_error: Optional[Exception] = None
        for attempt in range(1, MAX_RETRIES + 1):
            token = self._ensure_token()
            req = urllib.request.Request(
                f"{API_BASE}{path}",
                headers={"Authorization": f"Bearer {token}"},
                method="GET",
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return json.loads(resp.read())
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", errors="replace")
                last_error = exc
                if exc.code == 401:
                    # Token might have just been invalidated server-side —
                    # force a refresh on the next attempt.
                    with self._token_lock:
                        self._access_token = None
                if exc.code not in (429, 500, 502, 503, 504):
                    log.warning("GET %s failed (non-retryable): %s %s", path, exc.code, body)
                    return None
                log.warning(
                    "GET %s failed (attempt %d/%d): %s %s", path, attempt, MAX_RETRIES, exc.code, body
                )
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last_error = exc
                log.warning("GET %s failed (attempt %d/%d): %s", path, attempt, MAX_RETRIES, exc)

            time.sleep(RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1)))

        log.error("GET %s exhausted retries, giving up: %s", path, last_error)
        return None


def normalize_toolchain(env_display_name: str) -> str:
    """"Mathlib c5ea003 (Lean v4.30.0)" -> "leanprover/lean4:v4.30.0"."""
    match = re.search(r"Lean\s+(v[\d.]+)", env_display_name)
    version = match.group(1) if match else "unknown"
    return f"leanprover/lean4:{version}"


def fetch_one(client: Prove2MeClient, theorem: dict) -> Optional[dict]:
    """Fetch one theorem's accepted solution and build its JSONL record.
    Returns None (with a logged reason) if anything about it can't be
    harvested — never raises, so one bad theorem can't kill the batch."""
    theorem_id = theorem["theorem_id"]
    name = theorem.get("theorem_name", "unnamed")

    # reject_sorry=False: formal_statement is always a `:= by sorry` stub by
    # Prove2Me's own convention (it's the POSED form) — we only want the
    # statement text here. The real proof comes from the accepted submission
    # fetched below, and THAT one keeps the default reject_sorry=True.
    decls = extract_declarations(theorem.get("formal_statement", ""), reject_sorry=False)
    if not decls:
        log.warning("no parsable statement for theorem_id=%s (%s), skipping", theorem_id, name)
        return None
    statement = decls[0].statement

    submissions = client.get(f"/theorems/{theorem_id}/submissions?status=ACCEPTED&first=true")
    accepted = (submissions or {}).get("submissions") or []
    if not accepted:
        log.warning("no ACCEPTED submission for theorem_id=%s (%s), skipping", theorem_id, name)
        return None
    submission_id = accepted[0]["id"]

    solution = client.get(f"/submissions/{submission_id}/solution")
    proof_content = (solution or {}).get("content", "").strip()
    if not proof_content:
        log.warning("empty solution content for submission_id=%s (theorem=%s), skipping", submission_id, name)
        return None

    return {
        "name": name,
        "statement": statement,
        # The accepted solution is a whole self-contained Lean file (its own
        # imports/helper lemmas + a final `theorem solution`), not just a
        # proof-tactic tail like other harvested sources — `proof` here IS
        # the full file, not something meant to be appended after `statement`.
        "proof": proof_content,
        "status": "tentative",
        "library": "prove2me",
        "source_url": f"https://prove2.me/theorems/{theorem_id}",
        "toolchain": normalize_toolchain(theorem.get("env_display_name", "")),
    }


def harvest(api_key: str, out_path: Path, max_count: int) -> int:
    client = Prove2MeClient(api_key)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    skipped = 0
    offset = 0
    write_lock = threading.Lock()
    start_time = time.monotonic()

    with out_path.open("w", encoding="utf-8") as out, ThreadPoolExecutor(max_workers=WORKERS) as pool:
        while written + skipped < max_count:
            page = client.get(f"/theorems?status=Proved&limit={PAGE_SIZE}&offset={offset}")
            if not page or not page.get("theorems"):
                log.info("no more theorems at offset=%d, stopping", offset)
                break

            theorems = page["theorems"]
            total = page.get("total")
            if offset == 0 and total:
                log.info("Prove2Me reports %d total Proved theorems", total)

            futures = [pool.submit(fetch_one, client, t) for t in theorems]
            for future in as_completed(futures):
                record = future.result()
                if record is None:
                    skipped += 1
                    continue
                with write_lock:
                    out.write(json.dumps(record) + "\n")
                    written += 1
                    if written % 200 == 0:
                        elapsed = time.monotonic() - start_time
                        rate = written / elapsed if elapsed > 0 else 0
                        log.info(
                            "progress: %d written, %d skipped, %.1f theorems/sec",
                            written, skipped, rate,
                        )

            offset += PAGE_SIZE

    log.info("done: %d written, %d skipped, %.0fs elapsed", written, skipped, time.monotonic() - start_time)
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max", type=int, default=200_000,
        help="max theorems to harvest this run (default effectively 'all')",
    )
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
