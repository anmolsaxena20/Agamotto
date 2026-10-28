"""
test_mcp_server.py – Comprehensive unit and integration test suite for Feature 8: MCP Server.

Covers:
  1. Tool discovery and metadata
  2. Individual execution for all 8 read-only tools
  3. Multi-tenant isolation and cross-organization boundary enforcement
  4. Service visibility filtering (visible_services claim)
  5. Admin tool toggle and execution refusal
  6. Row caps and data sanitization
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
import duckdb
import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import _ensure_schema
from app.main import app as fastapi_app
from app.mcp.context import set_auth_context, set_tool_disabled
from app.mcp.schemas import TelemetryFilter
from app.mcp.store_client import TelemetryStoreClient
from app.mcp.tools import (
    ALL_TOOL_NAMES,
    run_get_service_stats,
    run_find_slow_spans,
    run_get_error_groups,
    run_get_trace,
    run_search_logs,
    run_compare_traces,
    run_get_topology,
    run_get_anomalies,
)

JWT_SECRET = "c8e6a18d9f4e2b0a7c5d3f1e9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b"


def make_token(
    org_id: str,
    sub: str = "user-123",
    visible_services: list[str] | None = None,
) -> str:
    payload = {
        "sub": sub,
        "org_id": org_id,
        "visible_services": visible_services or [],
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture
def mem_db():
    """In-memory DuckDB fixture with full schema initialized."""
    conn = duckdb.connect(":memory:")
    _ensure_schema(conn)
    yield conn
    conn.close()


def insert_span(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    trace_id: str,
    span_id: str,
    service_name: str,
    span_name: str,
    start_ts: datetime,
    duration_ns: int,
    parent_span_id: str | None = None,
    is_error: bool = False,
    error_fingerprint: str | None = None,
    status_code: str = "OK",
    http_status: int = 200,
):
    start_ns = int(start_ts.timestamp() * 1_000_000_000)
    conn.execute(
        """
        INSERT INTO spans (
            org_id, trace_id, span_id, parent_span_id, service_name, span_name,
            span_kind, start_time_ns, start_ts, duration_ns, status_code,
            http_status, is_error, error_fingerprint
        ) VALUES (?, ?, ?, ?, ?, ?, 'SERVER', ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            org_id,
            trace_id,
            span_id,
            parent_span_id,
            service_name,
            span_name,
            start_ns,
            start_ts,
            duration_ns,
            status_code,
            http_status,
            is_error,
            error_fingerprint,
        ],
    )


def insert_log(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    log_id: str,
    service_name: str,
    body: str,
    ts: datetime,
    severity_text: str = "INFO",
    trace_id: str | None = None,
    span_id: str | None = None,
):
    time_ns = int(ts.timestamp() * 1_000_000_000)
    conn.execute(
        """
        INSERT INTO logs (
            org_id, log_id, time_ns, ts, trace_id, span_id, service_name,
            severity_text, severity_number, body
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 9, ?)
        """,
        [org_id, log_id, time_ns, ts, trace_id, span_id, service_name, severity_text, body],
    )


def insert_anomaly(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    anomaly_id: str,
    service_name: str,
    window_start: datetime,
    window_end: datetime,
    p99_ns: int = 400_000_000,
    baseline_p99_ns: int = 100_000_000,
    ratio: float = 4.0,
    status: str = "open",
):
    import json
    suspects_json = json.dumps([
        {
            "span_id": "sp-suspect-1",
            "span_name": "POST /charge",
            "service_name": service_name,
            "trace_id": "tr-suspect-1",
            "duration_ns": p99_ns,
            "self_time_ns": p99_ns,
            "is_error": True,
        }
    ])
    conn.execute(
        """
        INSERT INTO anomalies (
            org_id, anomaly_id, service_name, window_start, window_end,
            p99_ns, baseline_p99_ns, ratio, error_rate, baseline_error_rate,
            status, suspects
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.15, 0.01, ?, ?)
        """,
        [org_id, anomaly_id, service_name, window_start, window_end, p99_ns, baseline_p99_ns, ratio, status, suspects_json],
    )


# ── Suite 1: Tool Discovery & Listing ─────────────────────────────────────────

def test_all_eight_tools_registered():
    """Verify that exactly the 8 canonical read-only tools are exposed."""
    expected = {
        "get_service_stats",
        "find_slow_spans",
        "get_error_groups",
        "get_trace",
        "search_logs",
        "compare_traces",
        "get_topology",
        "get_anomalies",
    }
    assert set(ALL_TOOL_NAMES) == expected


def test_rest_api_list_tools(monkeypatch, mem_db):
    """GET /api/v1/mcp/tools returns all 8 tools with enabled states."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    client = TestClient(fastapi_app)
    token = make_token("org-test")

    resp = client.get("/api/v1/mcp/tools", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    tools = resp.json()
    assert len(tools) == 8
    names = [t["name"] for t in tools]
    assert "get_service_stats" in names
    assert "get_anomalies" in names
    for t in tools:
        assert t["enabled"] is True


def test_rest_api_config_endpoint(monkeypatch, mem_db):
    """GET /api/v1/mcp/config returns connection snippet for Claude Desktop."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    client = TestClient(fastapi_app)
    token = make_token("org-test")

    resp = client.get("/api/v1/mcp/config", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    cfg = resp.json()
    assert cfg["read_only"] is True
    assert cfg["raw_sql_allowed"] is False
    assert "claude_desktop_config" in cfg
    assert "mcpServers" in cfg["claude_desktop_config"]


# ── Suite 2: Contract Tests for all 8 Tools ───────────────────────────────────

@pytest.mark.asyncio
async def test_tool_get_service_stats(monkeypatch, mem_db):
    """Tool 1: get_service_stats computes accurate request counts and percentiles."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    set_auth_context(org_id="org-1")

    now = datetime.now(timezone.utc)
    for i in range(10):
        insert_span(
            mem_db,
            org_id="org-1",
            trace_id=f"tr-{i}",
            span_id=f"sp-{i}",
            service_name="payment",
            span_name="POST /pay",
            start_ts=now,
            duration_ns=100_000_000 + i * 10_000_000,
            is_error=(i >= 8),  # 2 errors out of 10
        )

    stats = await run_get_service_stats(TelemetryFilter())
    assert len(stats) == 1
    s = stats[0]
    assert s.service_name == "payment"
    assert s.request_count == 10
    assert s.error_count == 2
    assert s.error_rate == 0.2
    assert s.p50_ns > 0
    assert s.p99_ns >= s.p50_ns


@pytest.mark.asyncio
async def test_tool_find_slow_spans(monkeypatch, mem_db):
    """Tool 2: find_slow_spans ranks spans by duration and self-time."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    set_auth_context(org_id="org-1")

    now = datetime.now(timezone.utc)
    insert_span(mem_db, "org-1", "tr-1", "sp-fast", "order", "GET /item", now, duration_ns=10_000_000)
    insert_span(mem_db, "org-1", "tr-2", "sp-slow", "payment", "POST /charge", now, duration_ns=500_000_000)

    slow_spans = await run_find_slow_spans(TelemetryFilter(), limit=5)
    assert len(slow_spans) == 2
    assert slow_spans[0].span_id == "sp-slow"
    assert slow_spans[0].duration_ms == 500.0


@pytest.mark.asyncio
async def test_tool_get_error_groups(monkeypatch, mem_db):
    """Tool 3: get_error_groups clusters errors by fingerprint."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    set_auth_context(org_id="org-1")

    now = datetime.now(timezone.utc)
    for i in range(3):
        insert_span(
            mem_db,
            "org-1",
            f"tr-{i}",
            f"sp-{i}",
            "payment",
            "POST /charge",
            now,
            duration_ns=50_000_000,
            is_error=True,
            error_fingerprint="fp-db-timeout",
        )

    groups = await run_get_error_groups(TelemetryFilter(), limit=5)
    assert len(groups) == 1
    assert groups[0].error_fingerprint == "fp-db-timeout"
    assert groups[0].count == 3


@pytest.mark.asyncio
async def test_tool_get_trace(monkeypatch, mem_db):
    """Tool 4: get_trace computes depth, self time, and critical path."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    set_auth_context(org_id="org-1")

    now = datetime.now(timezone.utc)
    # Root span
    insert_span(mem_db, "org-1", "trace-100", "span-root", "gateway", "GET /checkout", now, duration_ns=300_000_000)
    # Child span
    insert_span(
        mem_db,
        "org-1",
        "trace-100",
        "span-child",
        "payment",
        "POST /charge",
        now + timedelta(milliseconds=20),
        duration_ns=200_000_000,
        parent_span_id="span-root",
    )

    trace = await run_get_trace("trace-100")
    assert trace is not None
    assert trace.trace_id == "trace-100"
    assert trace.span_count == 2
    assert trace.root_span_name == "GET /checkout"

    spans_by_id = {s.span_id: s for s in trace.spans}
    root = spans_by_id["span-root"]
    child = spans_by_id["span-child"]

    assert root.depth == 0
    assert child.depth == 1
    assert root.critical_path is True
    assert child.critical_path is True
    # Self time of root = 300ms - 200ms child = 100ms
    assert root.self_time_ns == 100_000_000


@pytest.mark.asyncio
async def test_tool_search_logs(monkeypatch, mem_db):
    """Tool 5: search_logs filters by body and severity, capped at 50."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    set_auth_context(org_id="org-1")

    now = datetime.now(timezone.utc)
    for i in range(60):
        insert_log(
            mem_db,
            "org-1",
            f"log-{i}",
            "payment",
            f"Processing transaction {i} with database timeout",
            now,
            severity_text="ERROR",
        )

    # Capped at 50 rows per specification
    logs = await run_search_logs(TelemetryFilter(text="timeout", limit=100))
    assert len(logs) == 50
    assert "timeout" in logs[0].body


@pytest.mark.asyncio
async def test_tool_compare_traces(monkeypatch, mem_db):
    """Tool 6: compare_traces finds added/missing/slower spans."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    set_auth_context(org_id="org-1")

    now = datetime.now(timezone.utc)
    # Trace A (slow incident)
    insert_span(mem_db, "org-1", "tr-incident", "sp-1", "payment", "POST /charge", now, duration_ns=800_000_000)
    insert_span(mem_db, "org-1", "tr-incident", "sp-2", "payment", "SELECT retry", now, duration_ns=100_000_000)

    # Trace B (fast baseline)
    insert_span(mem_db, "org-1", "tr-baseline", "sp-3", "payment", "POST /charge", now, duration_ns=200_000_000)

    cmp = await run_compare_traces("tr-incident", baseline_trace_id="tr-baseline")
    assert cmp is not None
    assert cmp.duration_delta_ns > 0
    # SELECT retry should be marked as added
    delta_names = {d.span_name: d.status for d in cmp.deltas}
    assert delta_names.get("SELECT retry") == "added"


@pytest.mark.asyncio
async def test_tool_get_topology(monkeypatch, mem_db):
    """Tool 7: get_topology extracts caller -> callee service edges."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    set_auth_context(org_id="org-1")

    now = datetime.now(timezone.utc)
    insert_span(mem_db, "org-1", "tr-top", "sp-gw", "gateway", "GET /checkout", now, duration_ns=150_000_000)
    insert_span(
        mem_db,
        "org-1",
        "tr-top",
        "sp-pay",
        "payment",
        "POST /charge",
        now,
        duration_ns=100_000_000,
        parent_span_id="sp-gw",
    )

    edges = await run_get_topology(TelemetryFilter())
    assert len(edges) == 1
    edge = edges[0]
    assert edge.caller == "gateway"
    assert edge.callee == "payment"
    assert edge.call_count == 1


@pytest.mark.asyncio
async def test_tool_get_anomalies(monkeypatch, mem_db):
    """Tool 8: get_anomalies returns open anomalies with ranked suspects."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    set_auth_context(org_id="org-1")

    now = datetime.now(timezone.utc)
    insert_anomaly(mem_db, "org-1", "anm-100", "payment", now - timedelta(minutes=5), now, ratio=4.2)

    anomalies = await run_get_anomalies(TelemetryFilter(status="open"))
    assert len(anomalies) == 1
    anm = anomalies[0]
    assert anm.anomaly_id == "anm-100"
    assert anm.service_name == "payment"
    assert anm.ratio == 4.2
    assert len(anm.suspects) == 1
    assert anm.suspects[0].span_id == "sp-suspect-1"


# ── Suite 3: Multi-Tenant Isolation & Cross-Org Access ─────────────────────────

@pytest.mark.asyncio
async def test_cross_tenant_trace_isolation(monkeypatch, mem_db):
    """Caller with Org A token cannot see Org B traces (returns None / 404)."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)

    now = datetime.now(timezone.utc)
    insert_span(mem_db, "org-secret-b", "tr-secret-b", "sp-b", "auth", "POST /login", now, duration_ns=50_000_000)

    # Org A tries to query Org B's trace
    set_auth_context(org_id="org-public-a")
    trace = await run_get_trace("tr-secret-b")
    assert trace is None


def test_rest_api_cross_org_access_rejected(monkeypatch, mem_db):
    """REST endpoint returns 404 when Org A attempts to fetch Org B trace."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    client = TestClient(fastapi_app)

    now = datetime.now(timezone.utc)
    insert_span(mem_db, "org-target", "trace-target-1", "sp-1", "order", "GET /order", now, duration_ns=40_000_000)

    token_attacker = make_token("org-attacker")
    resp = client.post(
        "/api/v1/mcp/tools/get_trace",
        headers={"Authorization": f"Bearer {token_attacker}"},
        json={"trace_id": "trace-target-1"},
    )
    assert resp.status_code == 404


# ── Suite 4: Service Visibility RBAC Filtering ────────────────────────────────

@pytest.mark.asyncio
async def test_visible_services_scoping(monkeypatch, mem_db):
    """User restricted to visible_services=['payment'] cannot see 'order' stats."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)

    now = datetime.now(timezone.utc)
    insert_span(mem_db, "org-1", "tr-1", "sp-1", "payment", "POST /pay", now, duration_ns=100_000_000)
    insert_span(mem_db, "org-1", "tr-2", "sp-2", "order", "POST /order", now, duration_ns=200_000_000)

    # Scoped to visible_services=['payment']
    set_auth_context(org_id="org-1", visible_services=["payment"])
    stats = await run_get_service_stats(TelemetryFilter())
    service_names = [s.service_name for s in stats]
    assert "payment" in service_names
    assert "order" not in service_names


# ── Suite 5: Admin Tool Toggle & Execution Refusal ────────────────────────────

@pytest.mark.asyncio
async def test_disabled_tool_refuses_execution():
    """Disabled tool raises PermissionError when called."""
    set_auth_context(org_id="org-1")
    set_tool_disabled("search_logs", True)

    with pytest.raises(PermissionError) as exc_info:
        await run_search_logs(TelemetryFilter())

    assert "disabled by an administrator" in str(exc_info.value)
    # Re-enable
    set_tool_disabled("search_logs", False)


def test_rest_api_tool_toggle(monkeypatch, mem_db):
    """Admin can toggle tool off; subsequent invocations return 403 Forbidden."""
    monkeypatch.setattr("app.database.get_db", lambda: mem_db)
    client = TestClient(fastapi_app)
    token = make_token("org-1")

    # Disable get_anomalies
    resp = client.post(
        "/api/v1/mcp/tools/get_anomalies/toggle",
        headers={"Authorization": f"Bearer {token}"},
        json={"enabled": False},
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False

    # Attempt to invoke get_anomalies
    call_resp = client.post(
        "/api/v1/mcp/tools/get_anomalies",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert call_resp.status_code == 403

    # Re-enable
    client.post(
        "/api/v1/mcp/tools/get_anomalies/toggle",
        headers={"Authorization": f"Bearer {token}"},
        json={"enabled": True},
    )
