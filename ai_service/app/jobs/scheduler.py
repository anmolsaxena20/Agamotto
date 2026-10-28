"""
jobs/scheduler.py – Feature 7

Runs the anomaly detector every EOA_SCHEDULER_INTERVAL_S seconds (default 30).
Uses asyncio to avoid blocking FastAPI's event loop.

Rules followed:
  - Registers as a FastAPI lifespan task (started/stopped with the app).
  - Uses asyncio.to_thread() so the synchronous DuckDB detector does not
    block the async event loop.
  - A per-cycle lock inside detector.py prevents overlapping runs.
  - A failing cycle logs the error but does NOT crash the scheduler.
  - Shutdown is clean: the loop exits when the cancellation signal arrives.
"""

from __future__ import annotations

import asyncio
import logging

from ..database import get_db
from ..anomaly.detector import run_detection_cycle
from ..config import get_settings

logger = logging.getLogger(__name__)


async def run_scheduler() -> None:
    """
    Infinite loop that calls the detector every SCHEDULER_INTERVAL_SECONDS.
    Cancel this coroutine (via the task returned by asyncio.create_task) to
    stop the scheduler cleanly.
    """
    cfg = get_settings()
    interval = cfg.SCHEDULER_INTERVAL_SECONDS
    logger.info("Anomaly detector scheduler started (interval=%ds)", interval)

    while True:
        try:
            await asyncio.sleep(interval)
            conn = get_db()
            result = await asyncio.to_thread(run_detection_cycle, conn)
            logger.info("Detector cycle: %s", result)
        except asyncio.CancelledError:
            logger.info("Anomaly detector scheduler stopped.")
            return
        except Exception:
            logger.exception(
                "Detector cycle failed – will retry in %ds", interval
            )
