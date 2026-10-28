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
        """Return tool definitions formatted for tool-calling LLMs."""
        definitions = []
        for name, meta in TOOL_REGISTRY.items():
            if is_tool_disabled(name):
                continue
            definitions.append({
                "type": "function",
                "function": {
                    "name": name,
                    "description": meta["description"],
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "filter": {
                                "type": "object",
                                "description": "Optional TelemetryFilter with from, to, services, severity, text, regex, status, limit",
                                "properties": {
                                    "from": {"type": "string", "description": "ISO-8601 start timestamp"},
                                    "to": {"type": "string", "description": "ISO-8601 end timestamp"},
                                    "services": {"type": "array", "items": {"type": "string"}},
                                    "severity": {"type": "array", "items": {"type": "string"}},
                                    "text": {"type": "string"},
                                    "regex": {"type": "string"},
                                    "status": {"type": "string"},
                                    "limit": {"type": "integer", "default": 20},
                                }
                            },
                            "limit": {"type": "integer", "description": "Row limit"},
                            "trace_id": {"type": "string", "description": "Required for get_trace and compare_traces"},
                            "baseline_trace_id": {"type": "string", "description": "Optional baseline trace for compare_traces"}
                        }
                    }
                }
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
