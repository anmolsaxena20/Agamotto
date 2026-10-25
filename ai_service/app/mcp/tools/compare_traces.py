"""
Tool: compare_traces
Returns span deltas, added and missing spans against a baseline trace.
"""

from __future__ import annotations

from typing import Optional
from app.mcp.schemas import TraceComparisonResponse
from app.mcp.store_client import store_client
from app.mcp.context import is_tool_disabled

TOOL_NAME = "compare_traces"
TOOL_DESCRIPTION = "Compare a trace structure and latency against a baseline trace, identifying span deltas."


async def run_compare_traces(trace_id: str, baseline_trace_id: Optional[str] = None) -> Optional[TraceComparisonResponse]:
    """Execute compare_traces tool."""
    if is_tool_disabled(TOOL_NAME):
        raise PermissionError(f"Tool '{TOOL_NAME}' has been disabled by an administrator.")
    return await store_client.compare_traces(trace_id, baseline_trace_id=baseline_trace_id)
