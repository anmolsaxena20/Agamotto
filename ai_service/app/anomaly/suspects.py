"""
suspects.py – Feature 7

Ranks suspect spans by *self time* for a given (org_id, service_name, window).

Self-time definition:
    self_time = span.duration_ns - overlap_with_children

"Overlap with children" means the total duration of the time ranges covered
by direct child spans, using an interval-merge approach to handle overlapping
children correctly.  We do this in Python after fetching the relevant spans
because DuckDB lacks native interval-merge aggregates.

Algorithm:
  1. Fetch all spans for the affected service + window (bounded query).
  2. Build a parent → children mapping.
  3. For each span, merge child time ranges and subtract covered time from
     the parent's duration to get self_time.
  4. Sort descending by self_time, keep top 5.
  5. Tie-break by span_id (lexicographic) for determinism.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import NamedTuple

import duckdb

logger = logging.getLogger(__name__)

_TOP_N = 5


class SuspectSpan(NamedTuple):
    span_id: str
    span_name: str
    service_name: str
    trace_id: str
    duration_ns: int
    self_time_ns: int
    is_error: bool


def _merge_intervals(intervals: list[tuple[int, int]]) -> int:
    """Return the total length of merged (non-overlapping) intervals."""
    if not intervals:
        return 0
    sorted_ivs = sorted(intervals)
    merged_end = sorted_ivs[0][1]
    total = 0
    cur_start = sorted_ivs[0][0]
    for start, end in sorted_ivs[1:]:
        if start <= merged_end:
            merged_end = max(merged_end, end)
        else:
            total += merged_end - cur_start
            cur_start = start
            merged_end = end
    total += merged_end - cur_start
    return total


def rank_suspects(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    service_name: str,
    window_start: datetime,
    window_end: datetime,
) -> list[SuspectSpan]:
    """
    Return the top-5 suspect spans ranked by descending self time.

    Only spans within the affected service and evaluation window are candidates.
    Children from *other* services are NOT subtracted (they represent downstream
    latency added on top of the parent span's own work).
    """
    # Fetch all spans in the window for this org+service (plus their children
    # that may start slightly before/after the window edge).
    sql = """
        SELECT
            span_id,
            parent_span_id,
            span_name,
            service_name,
            trace_id,
            start_time_ns,
            duration_ns,
            is_error
        FROM spans
        WHERE
            org_id       = $org_id
            AND service_name = $service_name
            AND start_ts >= $window_start::TIMESTAMP
            AND start_ts <  $window_end::TIMESTAMP
        ORDER BY start_time_ns, span_id
    """

    rows = conn.execute(
        sql,
        {
            "org_id": org_id,
            "service_name": service_name,
            "window_start": window_start.strftime("%Y-%m-%d %H:%M:%S.%f"),
            "window_end": window_end.strftime("%Y-%m-%d %H:%M:%S.%f"),
        },
    ).fetchall()

    if not rows:
        return []

    # Build lookup structures
    # row: span_id, parent_span_id, span_name, svc, trace_id, start_ns, dur_ns, is_error
    span_map: dict[str, dict] = {}
    children_map: dict[str, list[tuple[int, int]]] = {}  # parent_id → [(start,end)]

    for row in rows:
        sid, pid, sname, svc, tid, start_ns, dur_ns, is_err = row
        span_map[sid] = {
            "span_id": sid,
            "parent_span_id": pid,
            "span_name": sname,
            "service_name": svc,
            "trace_id": tid,
            "start_ns": int(start_ns),
            "duration_ns": int(dur_ns),
            "is_error": bool(is_err),
        }
        if pid:
            children_map.setdefault(pid, [])
            children_map[pid].append((int(start_ns), int(start_ns) + int(dur_ns)))

    suspects: list[SuspectSpan] = []
    for sid, span in span_map.items():
        child_intervals = children_map.get(sid, [])
        covered = _merge_intervals(child_intervals)
        # Self time cannot be negative (would happen if children overflow parent due to clock skew)
        self_time = max(0, span["duration_ns"] - covered)

        suspects.append(
            SuspectSpan(
                span_id=sid,
                span_name=span["span_name"],
                service_name=span["service_name"],
                trace_id=span["trace_id"],
                duration_ns=span["duration_ns"],
                self_time_ns=self_time,
                is_error=span["is_error"],
            )
        )

    # Sort by descending self_time; tie-break deterministically by span_id
    suspects.sort(key=lambda s: (-s.self_time_ns, s.span_id))
    return suspects[:_TOP_N]


def suspects_to_json(suspects: list[SuspectSpan]) -> str:
    """Serialise suspects list to a JSON string for storage in DuckDB."""
    return json.dumps(
        [
            {
                "span_id": s.span_id,
                "span_name": s.span_name,
                "service_name": s.service_name,
                "trace_id": s.trace_id,
                "duration_ns": s.duration_ns,
                "self_time_ns": s.self_time_ns,
                "is_error": s.is_error,
            }
            for s in suspects
        ]
    )


def suspects_from_json(raw: str | None) -> list[SuspectSpan]:
    """Deserialise suspects JSON back to SuspectSpan list."""
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return [
            SuspectSpan(
                span_id=d["span_id"],
                span_name=d["span_name"],
                service_name=d["service_name"],
                trace_id=d["trace_id"],
                duration_ns=int(d["duration_ns"]),
                self_time_ns=int(d["self_time_ns"]),
                is_error=bool(d.get("is_error", False)),
            )
            for d in data
        ]
    except Exception:
        logger.exception("Failed to deserialise suspects JSON")
        return []
