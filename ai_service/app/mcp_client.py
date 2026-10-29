"""
mcp_client.py – In-process client for the AI investigation assistant to call MCP tools.

Follows the doc requirements:
- The agent calls MCP tools through mcp_client.py
- Tenant isolation: passes the authenticated org_id and visible_services into context
- Caps tool results (EOA_MAX_TOOL_RESULT_CHARS)
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional, List

from app.config import get_settings
from app.mcp.context import set_auth_context, is_tool_disabled
from app.mcp.schemas import TelemetryFilter
from app.mcp.tools import TOOL_REGISTRY, ALL_TOOL_NAMES

logger = logging.getLogger(__name__)


FILTER_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "description": "Optional telemetry filter",
    "properties": {
        "from": {"type": "string", "description": "ISO-8601 UTC start timestamp (e.g. '2026-10-28T00:00:00Z')"},
        "to": {"type": "string", "description": "ISO-8601 UTC end timestamp"},
        "services": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Limit to these service names",
        },
        "severity": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Log severity levels, e.g. ['ERROR', 'FATAL']",
        },
        "text": {"type": "string", "description": "Substring to search in log body or span name"},
        "regex": {"type": "string", "description": "Regex pattern for log body or span name"},
        "status": {"type": "string", "description": "Span status: 'OK', 'ERROR', or 'UNSET'"},
        "limit": {"type": "integer", "description": "Max rows to return (1–50)", "default": 20},
    },
}

TOOL_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "get_service_stats": {
        "description": "Get request volume, error rate, and p50/p95/p99 latency per microservice. Use this first when asked about overall system health or latency.",
        "parameters": {"type": "object", "properties": {"filter": FILTER_SCHEMA}},
    },
    "find_slow_spans": {
        "description": "Find and rank the slowest operations by execution duration or self-time. Use when asked about latency spikes, slow endpoints, or bottlenecks.",
        "parameters": {
            "type": "object",
            "properties": {
                "filter": FILTER_SCHEMA,
                "limit": {"type": "integer", "description": "Number of spans to return (1–50)", "default": 10},
            },
        },
    },
    "get_error_groups": {
        "description": "Get grouped error fingerprints with occurrence counts, timestamps, and sample trace IDs. Use when asked about errors, exceptions, or 500s.",
        "parameters": {
            "type": "object",
            "properties": {
                "filter": FILTER_SCHEMA,
                "limit": {"type": "integer", "description": "Number of error groups to return (1–50)", "default": 10},
            },
        },
    },
    "get_trace": {
        "description": "Fetch a full distributed trace tree with depth, self-time, and critical path. Use when given a specific trace_id to investigate.",
        "parameters": {
            "type": "object",
            "properties": {
                "trace_id": {"type": "string", "description": "The 32-character hex trace ID to fetch"},
            },
            "required": ["trace_id"],
        },
    },
    "search_logs": {
        "description": "Search log records by service, severity, text, or regex (strictly capped at 50 rows). Use when asked about log messages, error logs, or specific events.",
        "parameters": {"type": "object", "properties": {"filter": FILTER_SCHEMA}},
    },
    "compare_traces": {
        "description": "Compare a trace against a baseline, identifying span duration deltas, added spans, and missing spans. Use when investigating regression or comparing before/after.",
        "parameters": {
            "type": "object",
            "properties": {
                "trace_id": {"type": "string", "description": "The trace ID to compare"},
                "baseline_trace_id": {"type": "string", "description": "Optional baseline trace ID (auto-selected if omitted)"},
            },
            "required": ["trace_id"],
        },
    },
    "get_topology": {
        "description": "Retrieve the microservice dependency graph with call volume, p95 latency, and error rate per edge. Use when asked about service dependencies or which services call each other.",
        "parameters": {"type": "object", "properties": {"filter": FILTER_SCHEMA}},
    },
    "get_anomalies": {
        "description": "Retrieve statistically detected anomaly windows with ranked suspect spans. Use when asked about anomalies, incidents, or automated detections.",
        "parameters": {"type": "object", "properties": {"filter": FILTER_SCHEMA}},
    },
}


class McpClient:
    """Client for executing MCP telemetry tools on behalf of the AI Agent."""

    def __init__(
        self,
        org_id: str,
        visible_services: Optional[List[str]] = None,
        user_id: Optional[str] = None,
        token: Optional[str] = None,
    ):
        self.org_id = org_id
        self.visible_services = visible_services or []
        self.user_id = user_id
        self.token = token
        self.cfg = get_settings()

    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        """Return tool definitions formatted for tool-calling LLMs (OpenAI function-calling format)."""
        definitions = []
        for name, meta in TOOL_REGISTRY.items():
            if is_tool_disabled(name):
                continue
            schema_override = TOOL_SCHEMAS.get(name, {})
            definitions.append({
                "type": "function",
                "function": {
                    "name": name,
                    "description": schema_override.get("description", meta["description"]),
                    "parameters": schema_override.get("parameters", {
                        "type": "object",
                        "properties": {"filter": FILTER_SCHEMA},
                    }),
                },
            })
        return definitions

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> str:
        """
        Execute an MCP tool and return a JSON string trimmed to EOA_MAX_TOOL_RESULT_CHARS.
        """
        if tool_name not in TOOL_REGISTRY:
            return json.dumps({"error": f"Unknown tool '{tool_name}'. Available: {ALL_TOOL_NAMES}"})

        if is_tool_disabled(tool_name):
            return json.dumps({"error": f"Tool '{tool_name}' has been disabled by an administrator."})

        # Set thread-local / async context
        set_auth_context(
            org_id=self.org_id,
            visible_services=self.visible_services,
            user_id=self.user_id,
            token=self.token,
        )

        handler = TOOL_REGISTRY[tool_name]["handler"]

        try:
            filter_data = arguments.get("filter")
            filter_obj = TelemetryFilter(**filter_data) if filter_data else TelemetryFilter()
            limit = int(arguments.get("limit", 10))
            trace_id = arguments.get("trace_id")
            baseline_trace_id = arguments.get("baseline_trace_id")

            if tool_name == "get_trace":
                if not trace_id:
                    return json.dumps({"error": "Missing required argument 'trace_id'"})
                res = await handler(trace_id=trace_id)
            elif tool_name == "compare_traces":
                if not trace_id:
                    return json.dumps({"error": "Missing required argument 'trace_id'"})
                res = await handler(trace_id=trace_id, baseline_trace_id=baseline_trace_id)
            elif tool_name in ("find_slow_spans", "get_error_groups"):
                res = await handler(filter=filter_obj, limit=limit)
            else:
                res = await handler(filter=filter_obj)

            # Serialize to JSON
            if res is None:
                json_str = json.dumps({"result": None, "message": "Not found"})
            elif hasattr(res, "model_dump_json"):
                json_str = res.model_dump_json()
            elif isinstance(res, list) and res and hasattr(res[0], "model_dump"):
                json_str = json.dumps([item.model_dump(mode="json") for item in res])
            else:
                json_str = json.dumps(res, default=str)

            # Cap characters per tool result as specified in the doc (default 6000 chars)
            max_chars = self.cfg.EOA_MAX_TOOL_RESULT_CHARS
            if len(json_str) > max_chars:
                json_str = json_str[:max_chars] + '... [TRUNCATED_TO_FIT_LIMIT]'

            return json_str

        except Exception as exc:
            logger.exception("MCP Tool execution error in %s: %s", tool_name, exc)
            return json.dumps({"error": str(exc)})
