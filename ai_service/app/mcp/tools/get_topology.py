"""
Tool: get_topology
Returns caller-callee dependency edges with call count, p95, error rate.
"""

from __future__ import annotations

from typing import Optional, List
from app.mcp.schemas import TelemetryFilter, TopologyEdgeItem
from app.mcp.store_client import store_client
from app.mcp.context import is_tool_disabled

TOOL_NAME = "get_topology"
TOOL_DESCRIPTION = "Get inter-service dependency graph edges with call volume, p95 latency, and error rates."


async def run_get_topology(filter: Optional[TelemetryFilter] = None) -> List[TopologyEdgeItem]:
    """Execute get_topology tool."""
    if is_tool_disabled(TOOL_NAME):
        raise PermissionError(f"Tool '{TOOL_NAME}' has been disabled by an administrator.")
    filter_obj = filter or TelemetryFilter()
    return await store_client.get_topology(filter_obj)
