"""
detector.py – Feature 7

The heart of automated root-cause correlation.

Lifecycle state machine per (org_id, service_name):

  ┌─────────┐   threshold met        ┌──────┐
  │  normal  │──────────────────────▶│ open │
  └─────────┘                        └──┬───┘
       ▲                                │  threshold NOT met
       │  recovery_count >= 2           ▼
       │                         recovery_count++
       └─────────────────────────────(closed)

Detection conditions (both must hold):
  current_p99 > K * baseline_p99
  current_error_rate > baseline_error_rate + MARGIN
  span_count >= MIN_SPANS
  baseline_p99 > 0  (guard)

Idempotency:
  - Uses an upsert: INSERT OR REPLACE with a stable anomaly_id that does NOT
    change between runs while the anomaly remains open.
  - The anomaly_id is generated once (on first detection) and looked up on
    subsequent runs.
  - Concurrent scheduler ticks are safe: DuckDB serialises writes.
"""

from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone

import duckdb

from ..config import get_settings
from .baseline import (
    ServiceWindow,
    BaselineMetrics,
    compute_current_windows,
    compute_baseline,
    _ensure_utc,
)
from .suspects import rank_suspects, suspects_to_json, suspects_from_json, SuspectSpan

logger = logging.getLogger(__name__)

# Module-level lock prevents overlapping detector runs from the same process
_detect_lock = threading.Lock()


def _make_summary(
    svc: str,
    p99_ns: float,
    baseline_p99_ns: float,
    error_rate: float,
    ratio: float,
) -> str:
    p99_ms = p99_ns / 1_000_000
    base_ms = baseline_p99_ns / 1_000_000
    err_pct = error_rate * 100
    return (
        f"{svc} p99 is {ratio:.1f}× its baseline "
        f"({p99_ms:.0f} ms vs {base_ms:.0f} ms baseline) "
        f"and errors are at {err_pct:.1f}%"
    )


def run_detection_cycle(conn: duckdb.DuckDBPyConnection) -> dict:
    """
    Run one full detection cycle across all (org_id, service_name) pairs.

    Returns a summary dict for logging / testing:
      {
        "evaluated": int,    # services evaluated
        "opened": int,       # new anomalies opened
        "updated": int,      # existing anomalies updated
        "closed": int,       # anomalies closed this cycle
        "skipped": int,      # services skipped (insufficient baseline / data)
        "errors": int,       # per-service evaluation errors
      }
    }
    """
    if not _detect_lock.acquire(blocking=False):
        logger.warning("Detector: previous cycle still running, skipping this tick.")
        return {"skipped_overlap": True}

    try:
        return _do_cycle(conn)
    finally:
        _detect_lock.release()


def _do_cycle(conn: duckdb.DuckDBPyConnection) -> dict:
    cfg = get_settings()
    now = datetime.now(timezone.utc)

    counters = {"evaluated": 0, "opened": 0, "updated": 0, "closed": 0, "skipped": 0, "errors": 0}

    try:
        windows: list[ServiceWindow] = compute_current_windows(conn, now=now)
    except Exception:
        logger.exception("Detector: failed to compute current windows")
        return counters

    logger.debug("Detector: evaluating %d service windows", len(windows))

    # Also check for open anomalies where the service no longer appears in the
    # current window (possible closure due to data gap – we do NOT auto-close,
    # per spec: "Missing telemetry does not automatically close it").
    open_anomalies = _get_open_anomaly_ids(conn)

    seen_keys: set[tuple[str, str]] = set()

    for sw in windows:
        key = (sw.org_id, sw.service_name)
        seen_keys.add(key)
        counters["evaluated"] += 1

        try:
            _evaluate_service(conn, sw, now, cfg, counters)
        except Exception:
            logger.exception(
                "Detector: unhandled error for %s/%s", sw.org_id, sw.service_name
            )
            counters["errors"] += 1

    return counters


def _evaluate_service(
    conn: duckdb.DuckDBPyConnection,
    sw: ServiceWindow,
    now: datetime,
    cfg,
    counters: dict,
) -> None:
    """Evaluate one (org_id, service_name) window."""

    # ── 1. Minimum span guard ────────────────────────────────────────────────
    if sw.span_count < cfg.ANOMALY_MIN_SPANS:
        logger.debug(
            "Detector: %s/%s has only %d spans (min %d) – skipping",
            sw.org_id, sw.service_name, sw.span_count, cfg.ANOMALY_MIN_SPANS,
        )
        counters["skipped"] += 1
        return

    # ── 2. Compute baseline ──────────────────────────────────────────────────
    baseline = compute_baseline(
        conn, org_id=sw.org_id, service_name=sw.service_name, now=now
    )

    if baseline.bucket_count == 0 or baseline.baseline_p99_ns <= 0:
        logger.debug(
            "Detector: %s/%s has insufficient baseline – skipping",
            sw.org_id, sw.service_name,
        )
        counters["skipped"] += 1
        return

    # ── 3. Threshold evaluation ─────────────────────────────────────────────
    p99_threshold = cfg.ANOMALY_K * baseline.baseline_p99_ns
    err_threshold = baseline.baseline_error_rate + cfg.ANOMALY_MARGIN

    is_anomalous = (
        sw.current_p99_ns > p99_threshold
        and sw.current_error_rate > err_threshold
    )

    ratio = sw.current_p99_ns / baseline.baseline_p99_ns  # baseline > 0 guaranteed above

    # ── 4. Load existing open anomaly (if any) ───────────────────────────────
    existing = _get_open_anomaly(conn, sw.org_id, sw.service_name)

    if is_anomalous:
        suspects = rank_suspects(
            conn,
            org_id=sw.org_id,
            service_name=sw.service_name,
            window_start=sw.window_start,
            window_end=sw.window_end,
        )
        summary = _make_summary(
            sw.service_name,
            sw.current_p99_ns,
            baseline.baseline_p99_ns,
            sw.current_error_rate,
            ratio,
        )

        if existing is None:
            # Open a new anomaly
            anomaly_id = f"anm_{uuid.uuid4().hex}"
            _insert_anomaly(
                conn,
                anomaly_id=anomaly_id,
                org_id=sw.org_id,
                service_name=sw.service_name,
                window_start=sw.window_start,
                window_end=sw.window_end,
                p99_ns=int(sw.current_p99_ns),
                baseline_p99_ns=int(baseline.baseline_p99_ns),
                ratio=ratio,
                error_rate=sw.current_error_rate,
                baseline_error_rate=baseline.baseline_error_rate,
                suspects=suspects,
                summary=summary,
                now=now,
            )
            logger.info(
                "Detector: OPENED anomaly %s for %s/%s (ratio=%.2f, err=%.3f)",
                anomaly_id, sw.org_id, sw.service_name, ratio, sw.current_error_rate,
            )
            counters["opened"] += 1
        else:
            # Update existing anomaly – reset recovery_count
            _update_anomaly(
                conn,
                anomaly_id=existing["anomaly_id"],
                window_end=sw.window_end,
                p99_ns=int(sw.current_p99_ns),
                baseline_p99_ns=int(baseline.baseline_p99_ns),
                ratio=ratio,
                error_rate=sw.current_error_rate,
                baseline_error_rate=baseline.baseline_error_rate,
                suspects=suspects,
                recovery_count=0,  # reset – condition is still active
                now=now,
            )
            logger.debug(
                "Detector: UPDATED anomaly %s for %s/%s",
                existing["anomaly_id"], sw.org_id, sw.service_name,
            )
            counters["updated"] += 1
    else:
        # Condition NOT met this tick
        if existing is not None:
            new_recovery = existing["recovery_count"] + 1
            cfg2 = get_settings()
            if new_recovery >= cfg2.RECOVERY_WINDOWS_TO_CLOSE:
                # Close the anomaly
                _close_anomaly(conn, existing["anomaly_id"], now=now)
                logger.info(
                    "Detector: CLOSED anomaly %s for %s/%s after %d recovery windows",
                    existing["anomaly_id"], sw.org_id, sw.service_name, new_recovery,
                )
                counters["closed"] += 1
            else:
                # Increment recovery counter but keep open
                _update_anomaly(
                    conn,
                    anomaly_id=existing["anomaly_id"],
                    window_end=sw.window_end,
                    p99_ns=int(sw.current_p99_ns),
                    baseline_p99_ns=int(baseline.baseline_p99_ns),
                    ratio=ratio,
                    error_rate=sw.current_error_rate,
                    baseline_error_rate=baseline.baseline_error_rate,
                    suspects=suspects_from_json(existing.get("suspects")),
                    recovery_count=new_recovery,
                    now=now,
                )
                logger.debug(
                    "Detector: recovery tick %d/%d for anomaly %s",
                    new_recovery, cfg2.RECOVERY_WINDOWS_TO_CLOSE, existing["anomaly_id"],
                )
                counters["updated"] += 1


# ── Database helpers ──────────────────────────────────────────────────────────

def _get_open_anomaly(
    conn: duckdb.DuckDBPyConnection, org_id: str, service_name: str
) -> dict | None:
    row = conn.execute(
        """
        SELECT anomaly_id, window_start, window_end, p99_ns, baseline_p99_ns,
               ratio, error_rate, baseline_error_rate, status, suspects,
               detected_at, updated_at, recovery_count
        FROM anomalies
        WHERE org_id = ? AND service_name = ? AND status = 'open'
        LIMIT 1
        """,
        [org_id, service_name],
    ).fetchone()
    if row is None:
        return None
    cols = [
        "anomaly_id", "window_start", "window_end", "p99_ns", "baseline_p99_ns",
        "ratio", "error_rate", "baseline_error_rate", "status", "suspects",
        "detected_at", "updated_at", "recovery_count",
    ]
    return dict(zip(cols, row))


def _get_open_anomaly_ids(conn: duckdb.DuckDBPyConnection) -> list[tuple[str, str]]:
    """Return (org_id, service_name) for all open anomalies."""
    rows = conn.execute(
        "SELECT org_id, service_name FROM anomalies WHERE status = 'open'"
    ).fetchall()
    return [(r[0], r[1]) for r in rows]


def _insert_anomaly(
    conn: duckdb.DuckDBPyConnection,
    *,
    anomaly_id: str,
    org_id: str,
    service_name: str,
    window_start: datetime,
    window_end: datetime,
    p99_ns: int,
    baseline_p99_ns: int,
    ratio: float,
    error_rate: float,
    baseline_error_rate: float,
    suspects: list[SuspectSpan],
    summary: str,
    now: datetime,
) -> None:
    conn.execute(
        """
        INSERT INTO anomalies (
            org_id, anomaly_id, service_name,
            window_start, window_end,
            p99_ns, baseline_p99_ns, ratio,
            error_rate, baseline_error_rate,
            status, suspects,
            detected_at, updated_at, recovery_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 0)
        """,
        [
            org_id, anomaly_id, service_name,
            _fmt(window_start), _fmt(window_end),
            p99_ns, baseline_p99_ns, ratio,
            error_rate, baseline_error_rate,
            suspects_to_json(suspects),
            _fmt(now), _fmt(now),
        ],
    )


def _update_anomaly(
    conn: duckdb.DuckDBPyConnection,
    *,
    anomaly_id: str,
    window_end: datetime,
    p99_ns: int,
    baseline_p99_ns: int,
    ratio: float,
    error_rate: float,
    baseline_error_rate: float,
    suspects: list[SuspectSpan],
    recovery_count: int,
    now: datetime,
) -> None:
    conn.execute(
        """
        UPDATE anomalies
        SET
            window_end          = ?,
            p99_ns              = ?,
            baseline_p99_ns     = ?,
            ratio               = ?,
            error_rate          = ?,
            baseline_error_rate = ?,
            suspects            = ?,
            recovery_count      = ?,
            updated_at          = ?
        WHERE anomaly_id = ?
        """,
        [
            _fmt(window_end),
            p99_ns, baseline_p99_ns, ratio,
            error_rate, baseline_error_rate,
            suspects_to_json(suspects),
            recovery_count,
            _fmt(now),
            anomaly_id,
        ],
    )


def _close_anomaly(
    conn: duckdb.DuckDBPyConnection, anomaly_id: str, now: datetime
) -> None:
    conn.execute(
        "UPDATE anomalies SET status = 'closed', updated_at = ? WHERE anomaly_id = ?",
        [_fmt(now), anomaly_id],
    )


def _fmt(dt: datetime) -> str:
    return _ensure_utc(dt).strftime("%Y-%m-%d %H:%M:%S.%f")
