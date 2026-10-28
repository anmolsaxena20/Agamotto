"""
baseline.py – Feature 7

Computes:
  1. Current p99 latency and error rate for each (org_id, service_name) pair
     over the 5-minute evaluation window.
  2. Historical baseline p99 (median of 1-minute bucket p99s) and baseline
     error rate over the previous 30-minute window, excluding buckets that
     already belong to an open anomaly.

DuckDB SQL notes:
  - quantile_cont(expr, 0.99) is the continuous percentile function.
  - epoch() converts a TIMESTAMP to seconds; we use nanosecond timestamps
    directly from the spans table (start_time_ns).
  - All time arithmetic is done in the database to avoid Python-side tz drift.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import NamedTuple

import duckdb

from ..config import get_settings

logger = logging.getLogger(__name__)


class ServiceWindow(NamedTuple):
    """Computed current-window metrics for one (org_id, service_name)."""

    org_id: str
    service_name: str
    span_count: int
    current_p99_ns: float
    current_error_rate: float
    window_start: datetime
    window_end: datetime


class BaselineMetrics(NamedTuple):
    """Historical baseline metrics for one (org_id, service_name)."""

    org_id: str
    service_name: str
    baseline_p99_ns: float
    baseline_error_rate: float
    bucket_count: int  # number of 1-min buckets used; 0 means insufficient data


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def compute_current_windows(
    conn: duckdb.DuckDBPyConnection,
    now: datetime | None = None,
) -> list[ServiceWindow]:
    """
    Return current evaluation window metrics for every (org_id, service_name)
    that has at least 1 span in the last EVAL_WINDOW_MINUTES minutes.

    Spans are read from the `spans` table.  The window boundary is computed
    in the database to avoid clock skew.
    """
    cfg = get_settings()
    if now is None:
        now = _utcnow()

    window_start = now - timedelta(minutes=cfg.EVAL_WINDOW_MINUTES)

    sql = """
        SELECT
            org_id,
            service_name,
            COUNT(*)                                    AS span_count,
            quantile_cont(duration_ns, 0.99)            AS p99_ns,
            SUM(CASE WHEN is_error THEN 1 ELSE 0 END)::DOUBLE
                / NULLIF(COUNT(*), 0)                   AS error_rate,
            $window_start::TIMESTAMP                    AS window_start,
            $window_end::TIMESTAMP                      AS window_end
        FROM spans
        WHERE
            start_ts >= $window_start::TIMESTAMP
            AND start_ts <  $window_end::TIMESTAMP
        GROUP BY org_id, service_name
        ORDER BY org_id, service_name
    """

    rows = conn.execute(
        sql,
        {
            "window_start": window_start.strftime("%Y-%m-%d %H:%M:%S.%f"),
            "window_end": now.strftime("%Y-%m-%d %H:%M:%S.%f"),
        },
    ).fetchall()

    results: list[ServiceWindow] = []
    for row in rows:
        org_id, svc, span_count, p99_ns, err_rate, ws, we = row
        results.append(
            ServiceWindow(
                org_id=org_id,
                service_name=svc,
                span_count=int(span_count or 0),
                current_p99_ns=float(p99_ns or 0.0),
                current_error_rate=float(err_rate or 0.0),
                window_start=_ensure_utc(ws),
                window_end=_ensure_utc(we),
            )
        )
    return results


def compute_baseline(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    service_name: str,
    now: datetime | None = None,
) -> BaselineMetrics:
    """
    Compute the historical baseline for one (org_id, service_name).

    Algorithm:
      1. Partition the BASELINE_WINDOW_MINUTES window into 1-minute buckets.
      2. Compute per-bucket p99 and error_rate.
      3. Exclude any bucket whose midpoint overlaps an open anomaly for this
         service (per the spec).
      4. Return the MEDIAN of remaining bucket p99 values as baseline_p99.
      5. Return the MEAN of remaining bucket error_rate values as baseline_error_rate.

    Zero-baseline protection:
      - If baseline_p99 <= 0 we return bucket_count=0 to signal the caller
        to skip detection for this service (avoids false positives and
        division-by-zero).
    """
    cfg = get_settings()
    if now is None:
        now = _utcnow()

    baseline_end = now - timedelta(minutes=cfg.EVAL_WINDOW_MINUTES)
    baseline_start = baseline_end - timedelta(minutes=cfg.BASELINE_WINDOW_MINUTES)

    sql = """
        WITH buckets AS (
            SELECT
                org_id,
                service_name,
                time_bucket(INTERVAL '1 minute', start_ts) AS bucket,
                quantile_cont(duration_ns, 0.99)            AS bucket_p99,
                SUM(CASE WHEN is_error THEN 1 ELSE 0 END)::DOUBLE
                    / NULLIF(COUNT(*), 0)                   AS bucket_err
            FROM spans
            WHERE
                org_id         = $org_id
                AND service_name = $service_name
                AND start_ts   >= $baseline_start::TIMESTAMP
                AND start_ts   <  $baseline_end::TIMESTAMP
            GROUP BY org_id, service_name, bucket
        ),
        open_anomalies AS (
            SELECT window_start, window_end
            FROM anomalies
            WHERE
                org_id       = $org_id
                AND service_name = $service_name
                AND status   = 'open'
        ),
        valid_buckets AS (
            SELECT b.*
            FROM buckets b
            WHERE NOT EXISTS (
                SELECT 1 FROM open_anomalies oa
                WHERE
                    -- exclude bucket if its midpoint falls inside an open anomaly
                    b.bucket + INTERVAL '30 seconds'
                        BETWEEN oa.window_start AND oa.window_end
            )
        )
        SELECT
            COUNT(*)                         AS bucket_count,
            quantile_cont(bucket_p99, 0.5)   AS median_p99,
            AVG(bucket_err)                  AS mean_err
        FROM valid_buckets
    """

    row = conn.execute(
        sql,
        {
            "org_id": org_id,
            "service_name": service_name,
            "baseline_start": baseline_start.strftime("%Y-%m-%d %H:%M:%S.%f"),
            "baseline_end": baseline_end.strftime("%Y-%m-%d %H:%M:%S.%f"),
        },
    ).fetchone()

    if row is None:
        return BaselineMetrics(
            org_id=org_id,
            service_name=service_name,
            baseline_p99_ns=0.0,
            baseline_error_rate=0.0,
            bucket_count=0,
        )

    bucket_count, median_p99, mean_err = row
    bucket_count = int(bucket_count or 0)
    median_p99 = float(median_p99 or 0.0)
    mean_err = float(mean_err or 0.0)

    if bucket_count == 0 or median_p99 <= 0:
        logger.debug(
            "Baseline insufficient for %s/%s: buckets=%d p99=%f",
            org_id,
            service_name,
            bucket_count,
            median_p99,
        )
        return BaselineMetrics(
            org_id=org_id,
            service_name=service_name,
            baseline_p99_ns=0.0,
            baseline_error_rate=0.0,
            bucket_count=0,
        )

    return BaselineMetrics(
        org_id=org_id,
        service_name=service_name,
        baseline_p99_ns=median_p99,
        baseline_error_rate=mean_err,
        bucket_count=bucket_count,
    )


def _ensure_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return _utcnow()
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt
