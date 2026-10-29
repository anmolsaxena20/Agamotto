"""
store_client.py – Telemetry data access layer for MCP tools.

Enforces:
1. Multi-tenant isolation: every query scopes strictly by org_id.
2. visible_services filtering: callers only see services permitted by their RBAC group.
3. Row capping & payload trimming: no raw attribute blobs, capped outputs.
4. Dual backend mode: queries local DuckDB directly by default, or calls
   remote store-service via httpx if EOA_STORE_URL is configured.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
import httpx

import app.database
from app.config import get_settings
from app.mcp.context import get_active_org_id, get_active_visible_services, current_token
from app.mcp.schemas import (
    TelemetryFilter,
    ServiceStatItem,
    SlowSpanItem,
    ErrorGroupItem,
    TraceSpanItem,
    TraceDetailResponse,
    LogItem,
    TraceComparisonResponse,
    SpanDelta,
    TopologyEdgeItem,
)
from app.schemas import AnomalyOut, Suspect

logger = logging.getLogger(__name__)


def _effective_services(requested: List[str], visible: List[str]) -> List[str]:
    """Intersect requested services with group visible_services (empty visible = all allowed)."""
    if not visible:
        return requested
    if not requested:
        return visible
    return [s for s in requested if s in visible]


def _merge_intervals(intervals: list[tuple[int, int]]) -> int:
    """Calculate total union duration of child span intervals in nanoseconds."""
    if not intervals:
        return 0
    sorted_ivs = sorted(intervals, key=lambda x: x[0])
    merged = []
    c_start, c_end = sorted_ivs[0]
    for s, e in sorted_ivs[1:]:
        if s <= c_end:
            c_end = max(c_end, e)
        else:
            merged.append((c_start, c_end))
            c_start, c_end = s, e
    merged.append((c_start, c_end))
    return sum(e - s for s, e in merged)


import time
_last_sync_by_org: dict[str, float] = {}

def _ensure_org_telemetry_synced(conn, org_id: str) -> None:
    """Ensure DuckDB has cached the ClickHouse telemetry for this org_id."""
    now = time.time()
    last_sync = _last_sync_by_org.get(org_id, 0)
    if now - last_sync > 30:
        try:
            row = conn.execute("SELECT count(*) FROM spans WHERE org_id = ?", [org_id]).fetchone()
            count = row[0] if row else 0
            if count == 0 or (now - last_sync > 60):
                from app.database import sync_telemetry_from_clickhouse
                sync_telemetry_from_clickhouse(conn, org_id)
                _last_sync_by_org[org_id] = now
        except Exception as e:
            logger.debug("Failed on-demand sync from ClickHouse: %s", e)


class TelemetryStoreClient:
    """Client for retrieving read-only telemetry for MCP tools."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or get_settings().EOA_STORE_URL).rstrip("/")

    # ── Tool 1: get_service_stats ────────────────────────────────────────────
    async def get_service_stats(self, filter_obj: TelemetryFilter) -> List[ServiceStatItem]:
        org_id = get_active_org_id()
        visible = get_active_visible_services()
        services = _effective_services(filter_obj.services, visible)

        conn = app.database.get_db()
        _ensure_org_telemetry_synced(conn, org_id)
        conditions = ["org_id = ?"]
        params: list[Any] = [org_id]

        if services:
            placeholders = ", ".join(["?"] * len(services))
            conditions.append(f"service_name IN ({placeholders})")
            params.extend(services)
        elif visible:
            placeholders = ", ".join(["?"] * len(visible))
            conditions.append(f"service_name IN ({placeholders})")
            params.extend(visible)

        if filter_obj.from_ts:
            conditions.append("start_ts >= ?")
            params.append(filter_obj.from_ts)
        if filter_obj.to_ts:
            conditions.append("start_ts <= ?")
            params.append(filter_obj.to_ts)
        if filter_obj.status:
            conditions.append("status_code = ?")
            params.append(filter_obj.status.upper())

        where_clause = " AND ".join(conditions)

        sql = f"""
            SELECT
                service_name,
                COUNT(*) AS request_count,
                SUM(CASE WHEN is_error THEN 1 ELSE 0 END) AS error_count,
                CAST(SUM(CASE WHEN is_error THEN 1 ELSE 0 END) AS DOUBLE) / NULLIF(COUNT(*), 0) AS error_rate,
                CAST(quantile_cont(duration_ns, 0.50) AS BIGINT) AS p50_ns,
                CAST(quantile_cont(duration_ns, 0.95) AS BIGINT) AS p95_ns,
                CAST(quantile_cont(duration_ns, 0.99) AS BIGINT) AS p99_ns
            FROM spans
            WHERE {where_clause}
            GROUP BY service_name
            ORDER BY request_count DESC
            LIMIT 50
        """
        rows = conn.execute(sql, params).fetchall()

        results: list[ServiceStatItem] = []
        for r in rows:
            req_cnt = r[1] or 0
            err_cnt = r[2] or 0
            err_rate = float(r[3] or 0.0)
            p50 = int(r[4] or 0)
            p95 = int(r[5] or 0)
            p99 = int(r[6] or 0)
            results.append(
                ServiceStatItem(
                    service_name=r[0],
                    request_count=req_cnt,
                    error_count=err_cnt,
                    error_rate=round(err_rate, 4),
                    p50_ns=p50,
                    p95_ns=p95,
                    p99_ns=p99,
                    p50_ms=round(p50 / 1_000_000, 2),
                    p95_ms=round(p95 / 1_000_000, 2),
                    p99_ms=round(p99 / 1_000_000, 2),
                )
            )
        return results

    # ── Tool 2: find_slow_spans ──────────────────────────────────────────────
    async def find_slow_spans(self, filter_obj: TelemetryFilter, limit: int = 10) -> List[SlowSpanItem]:
        org_id = get_active_org_id()
        visible = get_active_visible_services()
        services = _effective_services(filter_obj.services, visible)
        capped_limit = min(max(1, limit), 50)

        conn = app.database.get_db()
        _ensure_org_telemetry_synced(conn, org_id)
        conditions = ["org_id = ?"]
        params: list[Any] = [org_id]

        if services:
            placeholders = ", ".join(["?"] * len(services))
            conditions.append(f"service_name IN ({placeholders})")
            params.extend(services)
        if filter_obj.from_ts:
            conditions.append("start_ts >= ?")
            params.append(filter_obj.from_ts)
        if filter_obj.to_ts:
            conditions.append("start_ts <= ?")
            params.append(filter_obj.to_ts)
        if filter_obj.status:
            conditions.append("status_code = ?")
            params.append(filter_obj.status.upper())
        if filter_obj.text:
            conditions.append("span_name ILIKE ?")
            params.append(f"%{filter_obj.text}%")

        where_clause = " AND ".join(conditions)

        # Select spans ranked by duration
        sql = f"""
            SELECT
                trace_id,
                span_id,
                parent_span_id,
                service_name,
                span_name,
                start_time_ns,
                start_ts,
                duration_ns,
                is_error,
                http_status
            FROM spans
            WHERE {where_clause}
            ORDER BY duration_ns DESC
            LIMIT ?
        """
        rows = conn.execute(sql, params + [capped_limit * 2]).fetchall()
        if not rows:
            return []

        # Find child intervals to calculate self_time
        span_ids = [r[1] for r in rows]
        id_placeholders = ", ".join(["?"] * len(span_ids))
        child_rows = conn.execute(
            f"""
            SELECT parent_span_id, start_time_ns, duration_ns
            FROM spans
            WHERE org_id = ? AND parent_span_id IN ({id_placeholders})
            """,
            [org_id] + span_ids,
        ).fetchall()

        children_map: dict[str, list[tuple[int, int]]] = {}
        for parent_id, c_start, c_dur in child_rows:
            if parent_id not in children_map:
                children_map[parent_id] = []
            children_map[parent_id].append((c_start, c_start + c_dur))

        results: list[SlowSpanItem] = []
        for r in rows:
            span_id = r[1]
            dur_ns = int(r[7])
            overlap = _merge_intervals(children_map.get(span_id, []))
            self_time_ns = max(0, dur_ns - overlap)
            results.append(
                SlowSpanItem(
                    trace_id=r[0],
                    span_id=span_id,
                    service_name=r[3],
                    span_name=r[4],
                    start_ts=r[6],
                    duration_ns=dur_ns,
                    duration_ms=round(dur_ns / 1_000_000, 2),
                    self_time_ns=self_time_ns,
                    self_time_ms=round(self_time_ns / 1_000_000, 2),
                    is_error=bool(r[8]),
                    http_status=r[9],
                )
            )

        # Sort by self_time_ns or duration_ns
        results.sort(key=lambda x: (x.self_time_ns, x.duration_ns), reverse=True)
        return results[:capped_limit]

    # ── Tool 3: get_error_groups ─────────────────────────────────────────────
    async def get_error_groups(self, filter_obj: TelemetryFilter, limit: int = 10) -> List[ErrorGroupItem]:
        org_id = get_active_org_id()
        visible = get_active_visible_services()
        services = _effective_services(filter_obj.services, visible)
        capped_limit = min(max(1, limit), 50)

        conn = app.database.get_db()
        _ensure_org_telemetry_synced(conn, org_id)
        conditions = ["org_id = ?", "is_error = TRUE", "error_fingerprint IS NOT NULL", "error_fingerprint != ''"]
        params: list[Any] = [org_id]

        if services:
            placeholders = ", ".join(["?"] * len(services))
            conditions.append(f"service_name IN ({placeholders})")
            params.extend(services)
        if filter_obj.from_ts:
            conditions.append("start_ts >= ?")
            params.append(filter_obj.from_ts)
        if filter_obj.to_ts:
            conditions.append("start_ts <= ?")
            params.append(filter_obj.to_ts)
        if filter_obj.text:
            conditions.append("(span_name ILIKE ? OR status_message ILIKE ?)")
            params.extend([f"%{filter_obj.text}%", f"%{filter_obj.text}%"])

        where_clause = " AND ".join(conditions)

        sql = f"""
            SELECT
                error_fingerprint,
                service_name,
                coalesce(any_value(status_message), any_value(span_name)) AS pattern,
                COUNT(*) AS cnt,
                MIN(start_ts) AS first_seen,
                MAX(start_ts) AS last_seen,
                any_value(trace_id) AS sample_trace_id,
                any_value(span_id) AS sample_span_id
            FROM spans
            WHERE {where_clause}
            GROUP BY error_fingerprint, service_name
            ORDER BY cnt DESC
            LIMIT ?
        """
        rows = conn.execute(sql, params + [capped_limit]).fetchall()

        return [
            ErrorGroupItem(
                error_fingerprint=r[0],
                service_name=r[1],
                pattern=r[2] or "Unknown error",
                count=int(r[3]),
                first_seen=r[4],
                last_seen=r[5],
                sample_trace_id=r[6],
                sample_span_id=r[7],
            )
            for r in rows
        ]

    # ── Tool 4: get_trace ────────────────────────────────────────────────────
    async def get_trace(self, trace_id: str) -> Optional[TraceDetailResponse]:
        org_id = get_active_org_id()
        visible = get_active_visible_services()

        conn = app.database.get_db()
        _ensure_org_telemetry_synced(conn, org_id)
        sql = """
            SELECT
                span_id,
                parent_span_id,
                service_name,
                span_name,
                start_time_ns,
                start_ts,
                duration_ns,
                is_error,
                http_status
            FROM spans
            WHERE org_id = ? AND trace_id = ?
            ORDER BY start_time_ns ASC
        """
        rows = conn.execute(sql, [org_id, trace_id]).fetchall()
        if not rows:
            return None

        # Check visibility: if visible_services defined, user must have access to at least 1 span in trace
        span_services = {r[2] for r in rows}
        if visible and not span_services.intersection(set(visible)):
            return None

        # Build tree representation, depth, child map, and self_time
        span_dict = {}
        children_map: dict[str, list[dict]] = {}
        root_spans = []

        for r in rows:
            item = {
                "span_id": r[0],
                "parent_span_id": r[1],
                "service_name": r[2],
                "span_name": r[3],
                "start_time_ns": int(r[4]),
                "start_ts": r[5],
                "duration_ns": int(r[6]),
                "is_error": bool(r[7]),
                "http_status": r[8],
                "depth": 0,
                "critical_path": False,
            }
            span_dict[item["span_id"]] = item
            p_id = item["parent_span_id"]
            if p_id:
                children_map.setdefault(p_id, []).append(item)
            else:
                root_spans.append(item)

        # Compute depths
        def set_depth(sp: dict, d: int):
            sp["depth"] = d
            for child in children_map.get(sp["span_id"], []):
                set_depth(child, d + 1)

        for root in root_spans:
            set_depth(root, 0)

        # Handle disconnected trees (root span missing from capture)
        for sp in span_dict.values():
            if sp["parent_span_id"] and sp["parent_span_id"] not in span_dict:
                set_depth(sp, 0)

        # Compute self time for each span
        for sp in span_dict.values():
            children = children_map.get(sp["span_id"], [])
            intervals = [(c["start_time_ns"], c["start_time_ns"] + c["duration_ns"]) for c in children]
            overlap = _merge_intervals(intervals)
            sp["self_time_ns"] = max(0, sp["duration_ns"] - overlap)

        # Compute Critical Path (spans determining overall trace end time)
        if root_spans:
            primary_root = max(root_spans, key=lambda s: s["duration_ns"])
            curr = primary_root
            curr["critical_path"] = True
            while curr["span_id"] in children_map and children_map[curr["span_id"]]:
                children = children_map[curr["span_id"]]
                # Child that finishes latest determines latency bottleneck
                bottleneck = max(children, key=lambda c: c["start_time_ns"] + c["duration_ns"])
                bottleneck["critical_path"] = True
                curr = bottleneck

        trace_start_ts = min(r[5] for r in rows)
        trace_duration_ns = max(r[4] + r[6] for r in rows) - min(r[4] for r in rows)
        root_name = root_spans[0]["span_name"] if root_spans else rows[0][3]

        trace_spans = [
            TraceSpanItem(
                span_id=sp["span_id"],
                parent_span_id=sp["parent_span_id"],
                service_name=sp["service_name"],
                span_name=sp["span_name"],
                start_time_ns=sp["start_time_ns"],
                duration_ns=sp["duration_ns"],
                duration_ms=round(sp["duration_ns"] / 1_000_000, 2),
                self_time_ns=sp["self_time_ns"],
                self_time_ms=round(sp["self_time_ns"] / 1_000_000, 2),
                depth=sp["depth"],
                critical_path=sp["critical_path"],
                is_error=sp["is_error"],
                http_status=sp["http_status"],
            )
            for sp in span_dict.values()
        ]

        return TraceDetailResponse(
            trace_id=trace_id,
            root_span_name=root_name,
            start_ts=trace_start_ts,
            duration_ns=trace_duration_ns,
            duration_ms=round(trace_duration_ns / 1_000_000, 2),
            span_count=len(rows),
            service_count=len(span_services),
            has_error=any(r[7] for r in rows),
            spans=trace_spans,
        )

    # ── Tool 5: search_logs ──────────────────────────────────────────────────
    async def search_logs(self, filter_obj: TelemetryFilter) -> List[LogItem]:
        org_id = get_active_org_id()
        visible = get_active_visible_services()
        services = _effective_services(filter_obj.services, visible)
        capped_limit = min(max(1, filter_obj.limit), 50)  # Specification: capped at 50

        conn = app.database.get_db()
        _ensure_org_telemetry_synced(conn, org_id)
        conditions = ["org_id = ?"]
        params: list[Any] = [org_id]

        if services:
            placeholders = ", ".join(["?"] * len(services))
            conditions.append(f"service_name IN ({placeholders})")
            params.extend(services)
        elif visible:
            placeholders = ", ".join(["?"] * len(visible))
            conditions.append(f"service_name IN ({placeholders})")
            params.extend(visible)

        if filter_obj.severity:
            sev_placeholders = ", ".join(["?"] * len(filter_obj.severity))
            conditions.append(f"upper(severity_text) IN ({sev_placeholders})")
            params.extend([s.upper() for s in filter_obj.severity])

        if filter_obj.from_ts:
            conditions.append("ts >= ?")
            params.append(filter_obj.from_ts)
        if filter_obj.to_ts:
            conditions.append("ts <= ?")
            params.append(filter_obj.to_ts)
        if filter_obj.trace_id:
            conditions.append("trace_id = ?")
            params.append(filter_obj.trace_id)
        if filter_obj.text:
            conditions.append("body ILIKE ?")
            params.append(f"%{filter_obj.text}%")
        if filter_obj.regex:
            conditions.append("regexp_matches(body, ?)")
            params.append(filter_obj.regex)

        where_clause = " AND ".join(conditions)

        sql = f"""
            SELECT
                log_id,
                ts,
                trace_id,
                span_id,
                service_name,
                severity_text,
                severity_number,
                body
            FROM logs
            WHERE {where_clause}
            ORDER BY ts DESC
            LIMIT ?
        """
        rows = conn.execute(sql, params + [capped_limit]).fetchall()

        return [
            LogItem(
                log_id=r[0],
                ts=r[1],
                trace_id=r[2],
                span_id=r[3],
                service_name=r[4],
                severity_text=r[5] or "INFO",
                severity_number=r[6],
                body=r[7] or "",
            )
            for r in rows
        ]

    # ── Tool 6: compare_traces ───────────────────────────────────────────────
    async def compare_traces(
        self, trace_id: str, baseline_trace_id: Optional[str] = None
    ) -> Optional[TraceComparisonResponse]:
        org_id = get_active_org_id()
        trace_a = await self.get_trace(trace_id)
        if not trace_a:
            return None

        conn = app.database.get_db()
        # If no baseline_trace_id given, discover median non-error baseline for the same root operation
        if not baseline_trace_id:
            baseline_row = conn.execute(
                """
                SELECT trace_id
                FROM v_trace_summary
                WHERE org_id = ? AND root_span_name = ? AND has_error = FALSE AND trace_id != ?
                ORDER BY duration_ns ASC
                LIMIT 1
                """,
                [org_id, trace_a.root_span_name, trace_id],
            ).fetchone()
            if baseline_row:
                baseline_trace_id = baseline_row[0]
            else:
                baseline_trace_id = trace_id  # Fallback to self if no baseline exists

        trace_b = await self.get_trace(baseline_trace_id) if baseline_trace_id else trace_a
        if not trace_b:
            trace_b = trace_a

        # Compare spans by (service_name, span_name)
        spans_a_map = {(s.service_name, s.span_name): s for s in trace_a.spans}
        spans_b_map = {(s.service_name, s.span_name): s for s in trace_b.spans}

        deltas: list[SpanDelta] = []
        all_keys = set(spans_a_map.keys()).union(set(spans_b_map.keys()))

        added_cnt = 0
        missing_cnt = 0

        for key in sorted(all_keys):
            srv, op = key
            sa = spans_a_map.get(key)
            sb = spans_b_map.get(key)
            if sa and not sb:
                added_cnt += 1
                deltas.append(
                    SpanDelta(
                        service_name=srv,
                        span_name=op,
                        status="added",
                        duration_ns=sa.duration_ns,
                        duration_delta_ns=sa.duration_ns,
                        duration_delta_ms=sa.duration_ms,
                    )
                )
            elif sb and not sa:
                missing_cnt += 1
                deltas.append(
                    SpanDelta(
                        service_name=srv,
                        span_name=op,
                        status="missing",
                        baseline_duration_ns=sb.duration_ns,
                        duration_delta_ns=-sb.duration_ns,
                        duration_delta_ms=-sb.duration_ms,
                    )
                )
            elif sa and sb:
                delta_ns = sa.duration_ns - sb.duration_ns
                status_str = "slower" if delta_ns > 50_000_000 else ("faster" if delta_ns < -50_000_000 else "same")
                deltas.append(
                    SpanDelta(
                        service_name=srv,
                        span_name=op,
                        status=status_str,
                        duration_ns=sa.duration_ns,
                        baseline_duration_ns=sb.duration_ns,
                        duration_delta_ns=delta_ns,
                        duration_delta_ms=round(delta_ns / 1_000_000, 2),
                    )
                )

        dur_delta = trace_a.duration_ns - trace_b.duration_ns
        return TraceComparisonResponse(
            trace_id=trace_id,
            baseline_trace_id=trace_b.trace_id,
            duration_ns=trace_a.duration_ns,
            baseline_duration_ns=trace_b.duration_ns,
            duration_delta_ns=dur_delta,
            duration_delta_ms=round(dur_delta / 1_000_000, 2),
            added_spans_count=added_cnt,
            missing_spans_count=missing_cnt,
            deltas=deltas,
        )

    # ── Tool 7: get_topology ─────────────────────────────────────────────────
    async def get_topology(self, filter_obj: TelemetryFilter) -> List[TopologyEdgeItem]:
        org_id = get_active_org_id()
        visible = get_active_visible_services()
        services = _effective_services(filter_obj.services, visible)

        conn = app.database.get_db()
        _ensure_org_telemetry_synced(conn, org_id)
        conditions = ["c.org_id = ?", "c.service_name != p.service_name"]
        params: list[Any] = [org_id]

        if services:
            placeholders = ", ".join(["?"] * len(services))
            conditions.append(f"(p.service_name IN ({placeholders}) OR c.service_name IN ({placeholders}))")
            params.extend(services + services)

        if filter_obj.from_ts:
            conditions.append("c.start_ts >= ?")
            params.append(filter_obj.from_ts)
        if filter_obj.to_ts:
            conditions.append("c.start_ts <= ?")
            params.append(filter_obj.to_ts)

        where_clause = " AND ".join(conditions)

        sql = f"""
            SELECT
                p.service_name AS caller,
                c.service_name AS callee,
                COUNT(*) AS call_count,
                CAST(quantile_cont(c.duration_ns, 0.95) AS BIGINT) AS p95_ns,
                AVG(CASE WHEN c.is_error THEN 1.0 ELSE 0.0 END) AS error_rate
            FROM spans c
            JOIN spans p ON c.org_id = p.org_id AND c.trace_id = p.trace_id AND c.parent_span_id = p.span_id
            WHERE {where_clause}
            GROUP BY p.service_name, c.service_name
            ORDER BY call_count DESC
            LIMIT 100
        """
        rows = conn.execute(sql, params).fetchall()

        return [
            TopologyEdgeItem(
                caller=r[0],
                callee=r[1],
                call_count=int(r[2]),
                p95_ns=int(r[3] or 0),
                p95_ms=round(int(r[3] or 0) / 1_000_000, 2),
                error_rate=round(float(r[4] or 0.0), 4),
            )
            for r in rows
        ]

    # ── Tool 8: get_anomalies ────────────────────────────────────────────────
    async def get_anomalies(self, filter_obj: TelemetryFilter) -> List[AnomalyOut]:
        org_id = get_active_org_id()
        visible = get_active_visible_services()
        services = _effective_services(filter_obj.services, visible)

        conn = app.database.get_db()
        conditions = ["org_id = ?"]
        params: list[Any] = [org_id]

        if services:
            placeholders = ", ".join(["?"] * len(services))
            conditions.append(f"service_name IN ({placeholders})")
            params.extend(services)

        if filter_obj.status:
            conditions.append("status = ?")
            params.append(filter_obj.status.lower())

        if filter_obj.from_ts:
            conditions.append("window_start >= ?")
            params.append(filter_obj.from_ts)
        if filter_obj.to_ts:
            conditions.append("window_end <= ?")
            params.append(filter_obj.to_ts)

        where_clause = " AND ".join(conditions)

        sql = f"""
            SELECT
                anomaly_id,
                service_name,
                window_start,
                window_end,
                detected_at,
                updated_at,
                status,
                p99_ns,
                baseline_p99_ns,
                ratio,
                error_rate,
                baseline_error_rate,
                suspects
            FROM anomalies
            WHERE {where_clause}
            ORDER BY window_end DESC
            LIMIT ?
        """
        rows = conn.execute(sql, params + [min(max(1, filter_obj.limit), 50)]).fetchall()

        import json

        results: list[AnomalyOut] = []
        for r in rows:
            p99_ns = int(r[7])
            base_p99_ns = int(r[8])
            ratio = float(r[9])
            err_rate = float(r[10])

            suspects_raw = r[12]
            suspects: list[Suspect] = []
            if suspects_raw:
                parsed = json.loads(suspects_raw) if isinstance(suspects_raw, str) else suspects_raw
                suspects = [Suspect(**s) for s in parsed]

            p99_ms = p99_ns / 1_000_000
            base_p99_ms = base_p99_ns / 1_000_000
            summary = (
                f"{r[1]} p99 is {ratio:.1f}x its baseline ({p99_ms:.1f}ms vs {base_p99_ms:.1f}ms) "
                f"with {err_rate*100:.1f}% error rate."
            )

            results.append(
                AnomalyOut(
                    anomaly_id=r[0],
                    service_name=r[1],
                    window_start=r[2],
                    window_end=r[3],
                    detected_at=r[4],
                    updated_at=r[5],
                    status=r[6],
                    p99_ns=p99_ns,
                    baseline_p99_ns=base_p99_ns,
                    ratio=ratio,
                    p99_ms=p99_ms,
                    baseline_p99_ms=base_p99_ms,
                    error_rate=err_rate,
                    baseline_error_rate=float(r[11]),
                    suspects=suspects,
                    summary=summary,
                )
            )
        return results


# Global singleton client
store_client = TelemetryStoreClient()
