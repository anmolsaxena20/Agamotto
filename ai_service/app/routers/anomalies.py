"""
routers/anomalies.py – Feature 7

GET /anomalies  →  list anomalies for the authenticated org.

Security:
  - org_id comes from the verified JWT (Bearer token or access_token cookie).
  - Callers cannot supply their own org_id.
  - visible_services restriction (from JWT claim) is applied server-side.
  - The endpoint is compatible with Feature 8's MCP get_anomalies tool shape.

Response shape matches AnomalyListResponse from schemas.py.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ..database import get_db
from ..schemas import AnomalyOut, AnomalyListResponse, Suspect
from ..anomaly.suspects import suspects_from_json
from ..auth import get_current_org

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/anomalies", tags=["anomalies"])


def _row_to_anomaly(row: tuple) -> AnomalyOut:
    cols = [
        "org_id", "anomaly_id", "service_name",
        "window_start", "window_end",
        "p99_ns", "baseline_p99_ns", "ratio",
        "error_rate", "baseline_error_rate",
        "status", "suspects",
        "detected_at", "updated_at", "recovery_count",
    ]
    d = dict(zip(cols, row))

    suspects_raw = suspects_from_json(d.get("suspects") or "[]")
    suspects_out = [
        Suspect(
            span_id=s.span_id,
            span_name=s.span_name,
            service_name=s.service_name,
            trace_id=s.trace_id,
            duration_ns=s.duration_ns,
            self_time_ns=s.self_time_ns,
            is_error=s.is_error,
        )
        for s in suspects_raw
    ]

    p99_ns = int(d["p99_ns"] or 0)
    baseline_p99_ns = int(d["baseline_p99_ns"] or 0)
    ratio = float(d["ratio"] or 0.0)
    err = float(d["error_rate"] or 0.0)
    svc = d["service_name"]

    summary = (
        f"{svc} p99 is {ratio:.1f}× its baseline "
        f"({p99_ns / 1_000_000:.0f} ms vs {baseline_p99_ns / 1_000_000:.0f} ms baseline) "
        f"and errors are at {err * 100:.1f}%"
    )

    def _to_dt(v) -> datetime:
        if isinstance(v, datetime):
            return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        if isinstance(v, str):
            dt = datetime.fromisoformat(v)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc)

    return AnomalyOut(
        anomaly_id=d["anomaly_id"],
        service_name=svc,
        window_start=_to_dt(d["window_start"]),
        window_end=_to_dt(d["window_end"]),
        detected_at=_to_dt(d["detected_at"]),
        updated_at=_to_dt(d["updated_at"]),
        status=d["status"],
        p99_ns=p99_ns,
        baseline_p99_ns=baseline_p99_ns,
        ratio=ratio,
        p99_ms=p99_ns / 1_000_000,
        baseline_p99_ms=baseline_p99_ns / 1_000_000,
        error_rate=err,
        baseline_error_rate=float(d["baseline_error_rate"] or 0.0),
        suspects=suspects_out,
        summary=summary,
    )


@router.get("", response_model=AnomalyListResponse)
async def list_anomalies(
    service: Optional[str] = Query(default=None, description="Filter by service_name"),
    anomaly_status: Optional[str] = Query(
        default=None, alias="status", description="'open' or 'closed'"
    ),
    from_ts: Optional[datetime] = Query(default=None, description="window_start >= from_ts"),
    to_ts: Optional[datetime] = Query(default=None, description="window_end <= to_ts"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    auth: dict = Depends(get_current_org),
) -> AnomalyListResponse:
    """
    List anomalies for the authenticated organisation.

    The `org_id` is derived from the JWT token – callers cannot override it.
    Results are further filtered by `visible_services` from the token when that
    claim is present and non-empty.
    """
    org_id = auth["org_id"]
    visible_services: list[str] = auth.get("visible_services") or []

    if anomaly_status and anomaly_status not in ("open", "closed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="status must be 'open' or 'closed'",
        )

    conn = get_db()

    # Build dynamic WHERE clauses
    conditions = ["org_id = ?"]
    params: list = [org_id]

    if service:
        conditions.append("service_name = ?")
        params.append(service)

    if anomaly_status:
        conditions.append("status = ?")
        params.append(anomaly_status)

    if from_ts:
        conditions.append("window_start >= ?")
        params.append(from_ts.strftime("%Y-%m-%d %H:%M:%S.%f"))

    if to_ts:
        conditions.append("window_end <= ?")
        params.append(to_ts.strftime("%Y-%m-%d %H:%M:%S.%f"))

    if visible_services:
        placeholders = ", ".join("?" * len(visible_services))
        conditions.append(f"service_name IN ({placeholders})")
        params.extend(visible_services)

    where = " AND ".join(conditions)

    # Count
    total_row = conn.execute(
        f"SELECT COUNT(*) FROM anomalies WHERE {where}", params
    ).fetchone()
    total = int(total_row[0] if total_row else 0)

    # Fetch page
    rows = conn.execute(
        f"""
        SELECT org_id, anomaly_id, service_name,
               window_start, window_end,
               p99_ns, baseline_p99_ns, ratio,
               error_rate, baseline_error_rate,
               status, suspects,
               detected_at, updated_at, recovery_count
        FROM anomalies
        WHERE {where}
        ORDER BY detected_at DESC
        LIMIT ? OFFSET ?
        """,
        params + [limit, offset],
    ).fetchall()

    anomalies = []
    for row in rows:
        try:
            anomalies.append(_row_to_anomaly(row))
        except Exception:
            logger.exception("Failed to deserialise anomaly row: %s", row)

    return AnomalyListResponse(anomalies=anomalies, total=total)
