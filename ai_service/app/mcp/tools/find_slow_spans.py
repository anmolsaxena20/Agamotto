"""
Tool: find_slow_spans
Returns spans ranked by duration or self time.
"""

from __future__ import annotations

from typing import Optional, List
from app.mcp.schemas import TelemetryFilter, SlowSpanItem
from app.mcp.store_client import store_client
from app.mcp.context import is_tool_disabled

TOOL_NAME = "find_slow_spans"
TOOL_DESCRIPTION = "Find and rank the slowest operations by duration or self-time across services."


async def run_find_slow_spans(filter: Optional[TelemetryFilter] = None, limit: int = 10) -> List[SlowSpanItem]:
    """Execute find_slow_spans tool."""
    if is_tool_disabled(TOOL_NAME):
        raise PermissionError(f"Tool '{TOOL_NAME}' has been disabled by an administrator.")
    filter_obj = filter or TelemetryFilter()
    return await store_client.find_slow_spans(filter_obj, limit=limit)
