"""
Context management for MCP server execution.

Maintains contextvars for the authenticated tenant identity (org_id),
service visibility permissions (visible_services), and auth token.
This guarantees strict multi-tenant isolation across async calls without
requiring the model or client to pass tenant IDs.
"""

from __future__ import annotations

import contextvars
from typing import Optional, List, Dict, Any

# Current organization ID (authoritative tenant boundary)
current_org_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_org_id", default=None
)

# Services visible to the current member's group (empty means all services in org)
current_visible_services: contextvars.ContextVar[List[str]] = contextvars.ContextVar(
    "current_visible_services", default=[]
)

# Current user ID (sub)
current_user_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_user_id", default=None
)

# Current bearer token
current_token: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_token", default=None
)

# In-memory disabled tools (synchronized with admin settings)
_disabled_tools: set[str] = set()


def set_auth_context(
    org_id: str,
    visible_services: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    token: Optional[str] = None,
) -> None:
    """Set the multi-tenant context for the current async task."""
    current_org_id.set(org_id)
    current_visible_services.set(visible_services or [])
    if user_id:
        current_user_id.set(user_id)
    if token:
        current_token.set(token)


def get_active_org_id() -> str:
    """Retrieve the authoritative org_id, raising RuntimeError if unauthenticated."""
    org = current_org_id.get()
    if not org:
        raise RuntimeError(
            "Tenant isolation violation: No authenticated org_id present in context."
        )
    return org


def get_active_visible_services() -> List[str]:
    """Retrieve the list of visible services for the current caller."""
    return current_visible_services.get() or []


def is_tool_disabled(tool_name: str) -> bool:
    """Check if an administrator has disabled this MCP tool."""
    return tool_name in _disabled_tools


def set_tool_disabled(tool_name: str, disabled: bool) -> None:
    """Enable or disable an MCP tool dynamically."""
    if disabled:
        _disabled_tools.add(tool_name)
    else:
        _disabled_tools.discard(tool_name)


def get_disabled_tools() -> list[str]:
    """Return all currently disabled tools."""
    return sorted(list(_disabled_tools))
