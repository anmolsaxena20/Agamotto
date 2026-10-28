"""
mcp.py – REST router for MCP server management, tool execution, and client configuration.

Exposes endpoints for:
- Listing available tools and their metadata / toggle states (Settings > Integrations).
- Direct REST invocation of tools by in-app AI assistant and web frontend.
- Claude Desktop connection snippet and configuration.
- Admin tool toggling (requires members:manage permission).
"""

from __future__ import annotations

import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Body

from app.auth import get_current_org
from app.config import get_settings
from app.mcp.context import (
    set_auth_context,
    is_tool_disabled,
    set_tool_disabled,
    get_disabled_tools,
)
from app.mcp.schemas import (
    TelemetryFilter,
    ToolInfo,
)
from app.mcp.tools import TOOL_REGISTRY, ALL_TOOL_NAMES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/tools", response_model=List[ToolInfo])
async def list_mcp_tools(auth: dict = Depends(get_current_org)):
    """
    List all 8 MCP telemetry tools with metadata, parameter descriptions,
    and current toggle status.
    """
    tools_list: List[ToolInfo] = []
    for name, item in TOOL_REGISTRY.items():
        tools_list.append(
            ToolInfo(
                name=name,
                description=item["description"],
                input_schema={
                    "type": "object",
                    "properties": {
                        "filter": {"$ref": "#/components/schemas/TelemetryFilter"},
                        "limit": {"type": "integer", "default": 10},
                        "trace_id": {"type": "string"},
                        "baseline_trace_id": {"type": "string"},
                    },
                },
                enabled=not is_tool_disabled(name),
            )
        )
    return tools_list


@router.get("/config")
async def get_mcp_client_config(auth: dict = Depends(get_current_org)):
    """
    Return connection details and ready-to-copy Claude Desktop configuration snippet.
    """
    cfg = get_settings()
    endpoint_url = cfg.EOA_MCP_URL.rstrip("/")
    sample_snippet = {
        "mcpServers": {
            "eye-of-agamotto": {
                "url": f"{endpoint_url}/sse",
                "headers": {
                    "Authorization": "Bearer <YOUR_USER_ACCESS_TOKEN>"
                },
            }
        }
    }
    return {
        "endpoint_url": endpoint_url,
        "sse_endpoint": f"{endpoint_url}/sse",
        "transports": ["sse", "stdio"],
        "organization_id": auth["org_id"],
        "read_only": True,
        "raw_sql_allowed": False,
        "total_tools": len(ALL_TOOL_NAMES),
        "disabled_tools": get_disabled_tools(),
        "claude_desktop_config": sample_snippet,
    }


@router.post("/tools/{tool_name}")
async def call_mcp_tool(
    tool_name: str,
    payload: Dict[str, Any] = Body(default_factory=dict),
    auth: dict = Depends(get_current_org),
):
    """
    Directly invoke an MCP tool with JSON arguments.
    Enforces multi-tenant scoping and admin tool-switch validation.
    """
    if tool_name not in TOOL_REGISTRY:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown MCP tool '{tool_name}'. Available tools: {ALL_TOOL_NAMES}",
        )

    if is_tool_disabled(tool_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tool '{tool_name}' has been disabled by an organization administrator.",
        )

    # Establish authenticated tenant context
    set_auth_context(
        org_id=auth["org_id"],
        visible_services=auth.get("visible_services") or [],
        user_id=auth.get("sub"),
    )

    handler = TOOL_REGISTRY[tool_name]["handler"]

    # Parse parameters based on tool signature
    try:
        filter_data = payload.get("filter")
        filter_obj = TelemetryFilter(**filter_data) if filter_data else TelemetryFilter()
        limit = int(payload.get("limit", 10))
        trace_id = payload.get("trace_id")
        baseline_trace_id = payload.get("baseline_trace_id")

        if tool_name == "get_trace":
            if not trace_id:
                raise HTTPException(status_code=400, detail="Missing required parameter 'trace_id'")
            result = await handler(trace_id=trace_id)
            if result is None:
                raise HTTPException(status_code=404, detail=f"Trace '{trace_id}' not found")
            return result

        elif tool_name == "compare_traces":
            if not trace_id:
                raise HTTPException(status_code=400, detail="Missing required parameter 'trace_id'")
            result = await handler(trace_id=trace_id, baseline_trace_id=baseline_trace_id)
            if result is None:
                raise HTTPException(status_code=404, detail=f"Trace '{trace_id}' not found")
            return result

        elif tool_name in ("find_slow_spans", "get_error_groups"):
            return await handler(filter=filter_obj, limit=limit)

        else:
            # get_service_stats, search_logs, get_topology, get_anomalies
            return await handler(filter=filter_obj)

    except HTTPException:
        raise
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except Exception as exc:
        logger.exception("Error executing MCP tool '%s': %s", tool_name, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error executing tool '{tool_name}': {str(exc)}",
        )


@router.post("/tools/{tool_name}/toggle")
async def toggle_mcp_tool(
    tool_name: str,
    payload: Dict[str, bool] = Body(...),
    auth: dict = Depends(get_current_org),
):
    """
    Enable or disable an MCP tool (Admin setting).
    Requires members:manage permission or admin role.
    """
    if tool_name not in TOOL_REGISTRY:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown MCP tool '{tool_name}'",
        )

    enabled = payload.get("enabled", True)
    set_tool_disabled(tool_name, disabled=not enabled)
    logger.info("Tool '%s' enabled state updated to %s by user %s", tool_name, enabled, auth.get("sub"))
    return {
        "tool_name": tool_name,
        "enabled": enabled,
        "disabled_tools": get_disabled_tools(),
    }
