"""
server.py – Model Context Protocol (MCP) server for Eye of Agamotto.

Owns Feature 8:
- Exposes 8 read-only telemetry tools.
- Strict multi-tenant isolation via JWT Bearer token claims (org_id, visible_services).
- Prevents raw SQL and write operations.
- Admin kill-switch per tool (settings.mcp_tools_disabled).
- Supports Streamable HTTP / SSE transport and stdio transport.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional, List, Dict, Any

from mcp.server.mcpserver import MCPServer, Context

from app.auth import _decode_token
from app.mcp.context import (
    set_auth_context,
    get_active_org_id,
    is_tool_disabled,
)
from app.mcp.schemas import (
    TelemetryFilter,
    ServiceStatItem,
    SlowSpanItem,
    ErrorGroupItem,
    TraceDetailResponse,
    LogItem,
    TraceComparisonResponse,
    TopologyEdgeItem,
)
from app.schemas import AnomalyOut
from app.mcp.tools.get_service_stats import run_get_service_stats, TOOL_NAME as T_STATS
from app.mcp.tools.find_slow_spans import run_find_slow_spans, TOOL_NAME as T_SLOW
from app.mcp.tools.get_error_groups import run_get_error_groups, TOOL_NAME as T_ERRORS
from app.mcp.tools.get_trace import run_get_trace, TOOL_NAME as T_TRACE
from app.mcp.tools.search_logs import run_search_logs, TOOL_NAME as T_LOGS
from app.mcp.tools.compare_traces import run_compare_traces, TOOL_NAME as T_COMPARE
from app.mcp.tools.get_topology import run_get_topology, TOOL_NAME as T_TOPOLOGY
from app.mcp.tools.get_anomalies import run_get_anomalies, TOOL_NAME as T_ANOMALIES

logger = logging.getLogger(__name__)

# Initialize the MCP Server instance
mcp_server = MCPServer(
    name="eye-of-agamotto-mcp",
    version="0.1.0",
    instructions=(
        "Eye of Agamotto Observability MCP Server.\n"
        "Provides 8 read-only telemetry investigation tools. "
        "All telemetry access is strictly scoped to the authenticated organization. "
        "Direct SQL access is not supported."
    ),
)


def _ensure_authenticated_context(ctx: Optional[Context] = None) -> None:
    """
    Ensure the calling context has an authenticated org_id.
    Attempts to read from current contextvars; if missing, inspects ctx.headers.
    """
    try:
        if get_active_org_id():
            return
    except RuntimeError:
        pass

    if ctx and ctx.headers:
        auth_header = ctx.headers.get("authorization") or ctx.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            payload = _decode_token(token)
            org_id = payload.get("org_id") or payload.get("orgId")
            if org_id:
                set_auth_context(
                    org_id=org_id,
                    visible_services=payload.get("visible_services") or [],
                    user_id=payload.get("sub"),
                    token=token,
                )
                return

    raise PermissionError("Authentication required: Missing valid Bearer token for tenant isolation.")


# ── Tool 1: get_service_stats ────────────────────────────────────────────────
@mcp_server.tool(
    name=T_STATS,
    description="Retrieve per-service telemetry stats: request volume, error rate, p50, p95, and p99 latency.",
)
async def get_service_stats(
    filter: Optional[TelemetryFilter] = None,
    ctx: Optional[Context] = None,
) -> List[ServiceStatItem]:
    _ensure_authenticated_context(ctx)
    if is_tool_disabled(T_STATS):
        raise PermissionError(f"Tool '{T_STATS}' is disabled by an administrator.")
    return await run_get_service_stats(filter)


# ── Tool 2: find_slow_spans ──────────────────────────────────────────────────
@mcp_server.tool(
    name=T_SLOW,
    description="Find operations across services ranked by execution duration or self-time.",
)
async def find_slow_spans(
    filter: Optional[TelemetryFilter] = None,
    limit: int = 10,
    ctx: Optional[Context] = None,
) -> List[SlowSpanItem]:
    _ensure_authenticated_context(ctx)
    if is_tool_disabled(T_SLOW):
        raise PermissionError(f"Tool '{T_SLOW}' is disabled by an administrator.")
    return await run_find_slow_spans(filter, limit=limit)


# ── Tool 3: get_error_groups ─────────────────────────────────────────────────
@mcp_server.tool(
    name=T_ERRORS,
    description="Get grouped error fingerprints with occurrence counts, timestamps, and sample trace IDs.",
)
async def get_error_groups(
    filter: Optional[TelemetryFilter] = None,
    limit: int = 10,
    ctx: Optional[Context] = None,
) -> List[ErrorGroupItem]:
    _ensure_authenticated_context(ctx)
    if is_tool_disabled(T_ERRORS):
        raise PermissionError(f"Tool '{T_ERRORS}' is disabled by an administrator.")
    return await run_get_error_groups(filter, limit=limit)


# ── Tool 4: get_trace ────────────────────────────────────────────────────────
@mcp_server.tool(
    name=T_TRACE,
    description="Fetch a full distributed trace tree with depth, computed self-time, and critical path bottleneck markers.",
)
async def get_trace(
    trace_id: str,
    ctx: Optional[Context] = None,
) -> Optional[TraceDetailResponse]:
    _ensure_authenticated_context(ctx)
    if is_tool_disabled(T_TRACE):
        raise PermissionError(f"Tool '{T_TRACE}' is disabled by an administrator.")
    return await run_get_trace(trace_id)


# ── Tool 5: search_logs ──────────────────────────────────────────────────────
@mcp_server.tool(
    name=T_LOGS,
    description="Search sanitized log records by service, severity, text, or regex (strictly capped at 50 rows).",
)
async def search_logs(
    filter: Optional[TelemetryFilter] = None,
    ctx: Optional[Context] = None,
) -> List[LogItem]:
    _ensure_authenticated_context(ctx)
    if is_tool_disabled(T_LOGS):
        raise PermissionError(f"Tool '{T_LOGS}' is disabled by an administrator.")
    return await run_search_logs(filter)


# ── Tool 6: compare_traces ───────────────────────────────────────────────────
@mcp_server.tool(
    name=T_COMPARE,
    description="Compare a trace against a baseline trace, identifying span duration deltas, added spans, and missing spans.",
)
async def compare_traces(
    trace_id: str,
    baseline_trace_id: Optional[str] = None,
    ctx: Optional[Context] = None,
) -> Optional[TraceComparisonResponse]:
    _ensure_authenticated_context(ctx)
    if is_tool_disabled(T_COMPARE):
        raise PermissionError(f"Tool '{T_COMPARE}' is disabled by an administrator.")
    return await run_compare_traces(trace_id, baseline_trace_id=baseline_trace_id)


# ── Tool 7: get_topology ─────────────────────────────────────────────────────
@mcp_server.tool(
    name=T_TOPOLOGY,
    description="Retrieve the microservice topology dependency graph with call volume, p95 latency, and error rate.",
)
async def get_topology(
    filter: Optional[TelemetryFilter] = None,
    ctx: Optional[Context] = None,
) -> List[TopologyEdgeItem]:
    _ensure_authenticated_context(ctx)
    if is_tool_disabled(T_TOPOLOGY):
        raise PermissionError(f"Tool '{T_TOPOLOGY}' is disabled by an administrator.")
    return await run_get_topology(filter)


# ── Tool 8: get_anomalies ────────────────────────────────────────────────────
@mcp_server.tool(
    name=T_ANOMALIES,
    description="Retrieve statistical anomaly windows with ranked suspect spans from automated root-cause correlation.",
)
async def get_anomalies(
    filter: Optional[TelemetryFilter] = None,
    ctx: Optional[Context] = None,
) -> List[AnomalyOut]:
    _ensure_authenticated_context(ctx)
    if is_tool_disabled(T_ANOMALIES):
        raise PermissionError(f"Tool '{T_ANOMALIES}' is disabled by an administrator.")
    return await run_get_anomalies(filter)


# ── ASGI Application Entrypoint (for running MCP standalone on port 8003) ────
app = mcp_server.sse_app()


# ── Stdio Entrypoint (for local CLI testing with MCP inspectors) ──────────────
def main():
    """Run MCP server in stdio mode."""
    logger.info("Starting Eye of Agamotto MCP Server in stdio mode...")
    asyncio.run(mcp_server.run_stdio_async())


if __name__ == "__main__":
    main()
