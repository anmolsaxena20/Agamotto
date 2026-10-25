"""
Tool: get_error_groups
Returns error groups with counts, first and last seen, and sample IDs.
"""

from __future__ import annotations

from typing import Optional, List
from app.mcp.schemas import TelemetryFilter, ErrorGroupItem
from app.mcp.store_client import store_client
from app.mcp.context import is_tool_disabled

TOOL_NAME = "get_error_groups"
TOOL_DESCRIPTION = "Get clustered error groups by fingerprint with counts, occurrence timelines, and sample trace IDs."


async def run_get_error_groups(filter: Optional[TelemetryFilter] = None, limit: int = 10) -> List[ErrorGroupItem]:
    """Execute get_error_groups tool."""
    if is_tool_disabled(TOOL_NAME):
        raise PermissionError(f"Tool '{TOOL_NAME}' has been disabled by an administrator.")
    filter_obj = filter or TelemetryFilter()
    return await store_client.get_error_groups(filter_obj, limit=limit)
