"""
Tool: get_trace
Returns full trace tree with depth, self time, and critical path flag.
"""

from __future__ import annotations

from typing import Optional
from app.mcp.schemas import TraceDetailResponse
from app.mcp.store_client import store_client
from app.mcp.context import is_tool_disabled

TOOL_NAME = "get_trace"
TOOL_DESCRIPTION = "Get full trace waterfall tree with tree depth, self-time, and critical path bottleneck markers."


async def run_get_trace(trace_id: str) -> Optional[TraceDetailResponse]:
    """Execute get_trace tool."""
    if is_tool_disabled(TOOL_NAME):
        raise PermissionError(f"Tool '{TOOL_NAME}' has been disabled by an administrator.")
    return await store_client.get_trace(trace_id)
