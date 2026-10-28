"""
MCP Server package for Eye of Agamotto (Feature 8).
"""

from app.mcp.server import mcp_server
from app.mcp.store_client import store_client
from app.mcp.tools import TOOL_REGISTRY, ALL_TOOL_NAMES

__all__ = ["mcp_server", "store_client", "TOOL_REGISTRY", "ALL_TOOL_NAMES"]
