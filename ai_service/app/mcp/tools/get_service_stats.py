"""
Tool: get_service_stats
Returns per-service: request count, error rate, p50, p95, p99.
"""

from __future__ import annotations

from typing import Optional, List
from app.mcp.schemas import TelemetryFilter, ServiceStatItem
from app.mcp.store_client import store_client
from app.mcp.context import is_tool_disabled

TOOL_NAME = "get_service_stats"
TOOL_DESCRIPTION = "Get request count, error rate, and p50/p95/p99 latency percentiles per microservice."


async def run_get_service_stats(filter: Optional[TelemetryFilter] = None) -> List[ServiceStatItem]:
    """Execute get_service_stats tool."""
    if is_tool_disabled(TOOL_NAME):
        raise PermissionError(f"Tool '{TOOL_NAME}' has been disabled by an administrator.")
    filter_obj = filter or TelemetryFilter()
    return await store_client.get_service_stats(filter_obj)
