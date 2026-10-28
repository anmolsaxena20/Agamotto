"""
Tool registry and export for Feature 8: MCP Server.
"""

from __future__ import annotations

from typing import Dict, Any, Callable, Awaitable
from app.mcp.tools.get_service_stats import (
    TOOL_NAME as NAME_SERVICE_STATS,
    TOOL_DESCRIPTION as DESC_SERVICE_STATS,
    run_get_service_stats,
)
from app.mcp.tools.find_slow_spans import (
    TOOL_NAME as NAME_SLOW_SPANS,
    TOOL_DESCRIPTION as DESC_SLOW_SPANS,
    run_find_slow_spans,
)
from app.mcp.tools.get_error_groups import (
    TOOL_NAME as NAME_ERROR_GROUPS,
    TOOL_DESCRIPTION as DESC_ERROR_GROUPS,
    run_get_error_groups,
)
from app.mcp.tools.get_trace import (
    TOOL_NAME as NAME_GET_TRACE,
    TOOL_DESCRIPTION as DESC_GET_TRACE,
    run_get_trace,
)
from app.mcp.tools.search_logs import (
    TOOL_NAME as NAME_SEARCH_LOGS,
    TOOL_DESCRIPTION as DESC_SEARCH_LOGS,
    run_search_logs,
)
from app.mcp.tools.compare_traces import (
    TOOL_NAME as NAME_COMPARE_TRACES,
    TOOL_DESCRIPTION as DESC_COMPARE_TRACES,
    run_compare_traces,
)
from app.mcp.tools.get_topology import (
    TOOL_NAME as NAME_GET_TOPOLOGY,
    TOOL_DESCRIPTION as DESC_GET_TOPOLOGY,
    run_get_topology,
)
from app.mcp.tools.get_anomalies import (
    TOOL_NAME as NAME_GET_ANOMALIES,
    TOOL_DESCRIPTION as DESC_GET_ANOMALIES,
    run_get_anomalies,
)

# Registry of all 8 read-only tools
TOOL_REGISTRY: Dict[str, Dict[str, Any]] = {
    NAME_SERVICE_STATS: {
        "name": NAME_SERVICE_STATS,
        "description": DESC_SERVICE_STATS,
        "handler": run_get_service_stats,
    },
    NAME_SLOW_SPANS: {
        "name": NAME_SLOW_SPANS,
        "description": DESC_SLOW_SPANS,
        "handler": run_find_slow_spans,
    },
    NAME_ERROR_GROUPS: {
        "name": NAME_ERROR_GROUPS,
        "description": DESC_ERROR_GROUPS,
        "handler": run_get_error_groups,
    },
    NAME_GET_TRACE: {
        "name": NAME_GET_TRACE,
        "description": DESC_GET_TRACE,
        "handler": run_get_trace,
    },
    NAME_SEARCH_LOGS: {
        "name": NAME_SEARCH_LOGS,
        "description": DESC_SEARCH_LOGS,
        "handler": run_search_logs,
    },
    NAME_COMPARE_TRACES: {
        "name": NAME_COMPARE_TRACES,
        "description": DESC_COMPARE_TRACES,
        "handler": run_compare_traces,
    },
    NAME_GET_TOPOLOGY: {
        "name": NAME_GET_TOPOLOGY,
        "description": DESC_GET_TOPOLOGY,
        "handler": run_get_topology,
    },
    NAME_GET_ANOMALIES: {
        "name": NAME_GET_ANOMALIES,
        "description": DESC_GET_ANOMALIES,
        "handler": run_get_anomalies,
    },
}

ALL_TOOL_NAMES = list(TOOL_REGISTRY.keys())
