"""
Tool: search_logs
Returns log rows matching filter, capped at 50.
"""

from __future__ import annotations

from typing import Optional, List
from app.mcp.schemas import TelemetryFilter, LogItem
from app.mcp.store_client import store_client
from app.mcp.context import is_tool_disabled

TOOL_NAME = "search_logs"
TOOL_DESCRIPTION = "Search log records by service, severity, text, or regex (strictly capped at 50 rows)."


async def run_search_logs(filter: Optional[TelemetryFilter] = None) -> List[LogItem]:
    """Execute search_logs tool."""
    if is_tool_disabled(TOOL_NAME):
        raise PermissionError(f"Tool '{TOOL_NAME}' has been disabled by an administrator.")
    filter_obj = filter or TelemetryFilter()
    return await store_client.search_logs(filter_obj)
