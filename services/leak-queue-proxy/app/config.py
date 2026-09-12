"""Environment-driven configuration for the queue proxy.

All settings come from environment variables (see README.md for the full
list and examples). Two of them are JSON-encoded maps:

    BACKEND_URLS='{"leak-ii": "https://leak-ii.example.com/sse", \
"leak-iv": "https://leak-iv.example.com/sse"}'
    CONCURRENCY_LIMITS='{"leak-ii": 1, "leak-iv": 8}'

`QUEUE_BACKEND` only accepts "memory" today. A Redis-backed (or otherwise
shared/distributed) store is deliberately out of scope for this PR -- see
`queue_manager.QueueStore` for the interface a future implementation would
need to satisfy to be swapped in without touching any caller.
"""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Dict

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

#: Leak-II is a single resident, stateful proof daemon: it must never see
#: more than one in-flight request or its internal state desyncs. This is
#: the built-in default for a backend named "leak-ii"; CONCURRENCY_LIMITS can
#: still override it explicitly (though doing so would be unsafe).
DEFAULT_CONCURRENCY_LIMITS: Dict[str, int] = {"leak-ii": 1}

#: Concurrency limit used for any configured backend that DEFAULT_CONCURRENCY_LIMITS
#: and CONCURRENCY_LIMITS both stay silent on (e.g. "leak-iv", whose safe
#: concurrency is a function of available compute, not a fixed protocol
#: constraint -- operators are expected to set CONCURRENCY_LIMITS for it, but
#: the service still has to boot with *some* sane number if they haven't).
FALLBACK_CONCURRENCY_LIMIT = 4

#: The only queue storage backend implemented so far.
SUPPORTED_QUEUE_BACKENDS = ("memory",)


class Settings(BaseSettings):
    """Service configuration, sourced from environment variables (case-insensitive)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    backend_urls: Dict[str, str] = {}
    concurrency_limits: Dict[str, int] = dict(DEFAULT_CONCURRENCY_LIMITS)
    default_concurrency_limit: int = FALLBACK_CONCURRENCY_LIMIT
    queue_backend: str = "memory"
    log_level: str = "INFO"
    host: str = "0.0.0.0"
    port: int = 8000

    @field_validator("backend_urls", "concurrency_limits", mode="before")
    @classmethod
    def _parse_json_map_from_env(cls, value: Any) -> Any:
        """Accept either an already-parsed dict or a JSON-object string.

        pydantic-settings decodes JSON for complex env values on its own, so
        by the time this runs `value` is often already a dict; this validator
        exists for the direct-construction path (`Settings(backend_urls="...")`)
        and to turn a malformed value into a clear error instead of a cryptic
        pydantic one.
        """
        if isinstance(value, str) and value.strip():
            try:
                value = json.loads(value)
            except json.JSONDecodeError as exc:
                raise ValueError(f"expected a JSON object, got invalid JSON: {value!r}") from exc
        if value is not None and not isinstance(value, dict):
            raise ValueError(f"expected a JSON object (a map), got: {value!r}")
        return value

    @field_validator("concurrency_limits", mode="after")
    @classmethod
    def _apply_concurrency_defaults(cls, value: Dict[str, int]) -> Dict[str, int]:
        merged = dict(DEFAULT_CONCURRENCY_LIMITS)
        merged.update(value)
        return merged

    @field_validator("queue_backend")
    @classmethod
    def _only_supported_queue_backend(cls, value: str) -> str:
        if value not in SUPPORTED_QUEUE_BACKENDS:
            raise ValueError(
                f"QUEUE_BACKEND={value!r} is not supported; only "
                f"{SUPPORTED_QUEUE_BACKENDS!r} is implemented in this release "
                "(see app/memory_queue_store.py)."
            )
        return value


@lru_cache
def get_settings() -> Settings:
    """Process-wide cached Settings instance, built from the environment."""
    return Settings()
