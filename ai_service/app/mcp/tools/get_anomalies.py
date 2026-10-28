"""
Tool: get_anomalies
Returns anomalies with suspect spans ranked by self-time.
"""

from __future__ import annotations

from typing import Optional, List
from app.mcp.schemas import TelemetryFilter
from app.schemas import AnomalyOut
from app.mcp.store_client import store_client
from app.mcp.context import is_tool_disabled

TOOL_NAME = "get_anomalies"
TOOL_DESCRIPTION = "Retrieve detected performance and error anomalies with ranked suspect spans."


async def run_get_anomalies(filter: Optional[TelemetryFilter] = None) -> List[AnomalyOut]:
    """Execute get_anomalies tool."""
    if is_tool_disabled(TOOL_NAME):
        raise PermissionError(f"Tool '{TOOL_NAME}' has been disabled by an administrator.")
    filter_obj = filter or TelemetryFilter()
    return await store_client.get_anomalies(filter_obj)
