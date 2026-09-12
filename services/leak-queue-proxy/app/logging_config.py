"""One shared logging setup, used by every module in this service.

Every enqueue / dispatch / release / evict event is logged with a request id,
ticket id, backend name and the current queue depth so an operator can
reconstruct exactly what the queue was doing without attaching a debugger.
Call `configure_logging()` exactly once, from `main.py`, before anything else
in the app logs.
"""
from __future__ import annotations

import logging
import sys

#: Root logger namespace for this whole service. Every module logs under
#: "leak_queue_proxy.<module>" so a single `logging.getLogger("leak_queue_proxy")`
#: level change controls all of them at once.
LOGGER_NAMESPACE = "leak_queue_proxy"

_LOG_FORMAT = (
    "%(asctime)s %(levelname)-8s %(name)s: %(message)s"
)
_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S%z"

_configured = False


def configure_logging(level: str = "INFO") -> None:
    """Configure the shared `leak_queue_proxy` logger hierarchy.

    Idempotent: calling this more than once (e.g. once from `main.py` and
    again from a test fixture) only reconfigures the level, it never attaches
    duplicate handlers.
    """
    global _configured

    logger = logging.getLogger(LOGGER_NAMESPACE)
    logger.setLevel(level.upper())

    if not _configured:
        handler = logging.StreamHandler(stream=sys.stdout)
        handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
        logger.addHandler(handler)
        logger.propagate = False
        _configured = True
    else:
        for handler in logger.handlers:
            handler.setLevel(level.upper())


def get_logger(module_name: str) -> logging.Logger:
    """Return a child logger under the shared `leak_queue_proxy` namespace.

    `module_name` is typically `__name__`; this function strips a leading
    `app.` so log lines read `leak_queue_proxy.queue_manager` rather than
    `leak_queue_proxy.app.queue_manager`.
    """
    short_name = module_name.removeprefix("app.")
    return logging.getLogger(f"{LOGGER_NAMESPACE}.{short_name}")
