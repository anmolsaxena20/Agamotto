"""
search.py – FastAPI Router for Natural-Language Search (Feature 20).

Exposes:
- POST /parse-filter: Converts natural-language search query into a validated Filter object and chips.
- POST /search/execute: Executes a Filter directly against DuckDB and ClickHouse telemetry stores.
- GET /search/services: Discovers known service names for the tenant.
- GET /search/events/latest-deploy: Returns the latest deployment event timestamp.

Adheres strictly to multi-tenant isolation: org_id is ALWAYS derived from the JWT token.
"""

from __future__ import annotations

import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Request, HTTPException, status

from app.auth import get_current_org
from app.nl_search import (
    parse_natural_language_search,
    execute_telemetry_query,
    discover_known_services,
    lookup_latest_deploy_event,
)
from app.schemas import (
    ParseFilterRequest,
    ParseFilterResponse,
    ExecuteFilterRequest,
    ExecuteFilterResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["natural-language-search"])


@router.post("/parse-filter", response_model=ParseFilterResponse)
async def parse_filter_endpoint(
    req: ParseFilterRequest,
    auth: dict = Depends(get_current_org),
):
    """
    POST /parse-filter – Natural-Language Search (Feature 20).

    Receives:
    - sentence: The user's query (e.g. 'errors in the payment service in the last 15 minutes')
    - current_time: Optional client ISO 8601 UTC timestamp
    - services: Optional list of known service names (defaults to discovering from DuckDB & ClickHouse)
    - execute: Whether to also run the resulting filter query against DuckDB and ClickHouse

    Returns:
    - filter: Structured, validated Filter object (from, to, services, severity, text, regex, status, limit)
    - chips: Interactive chips for the 'Interpreted as' row
    - is_fallback: True if plain text fallback was used or dangerous input was caught
    - explanation: Human-readable explanation of interpretation
    - warnings: Any sanitization/validation notices
    - results: Query execution results if execute=True
    """
    org_id = auth["org_id"]
    visible_services = auth.get("visible_services") or []

    try:
        response = await parse_natural_language_search(
            req=req,
            org_id=org_id,
            visible_services=visible_services,
        )
        return response
    except Exception as e:
        logger.exception("Error in /parse-filter endpoint: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse filter: {str(e)}",
        )


@router.post("/search/execute", response_model=ExecuteFilterResponse)
async def execute_filter_endpoint(
    req: ExecuteFilterRequest,
    auth: dict = Depends(get_current_org),
):
    """
    POST /search/execute – Executes a structured Filter against DuckDB and ClickHouse.
    """
    org_id = auth["org_id"]
    try:
        res = execute_telemetry_query(
            filter_obj=req.filter,
            org_id=org_id,
            target=req.target,
            engine=req.engine,
            limit=req.limit,
        )
        return res
    except Exception as e:
        logger.exception("Error executing filter search: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Filter execution failed: {str(e)}",
        )


@router.get("/search/services")
async def get_services_endpoint(
    auth: dict = Depends(get_current_org),
):
    """
    GET /search/services – Discovers all active service names in DuckDB & ClickHouse for org.
    """
    org_id = auth["org_id"]
    services = discover_known_services(org_id)
    visible_services = auth.get("visible_services") or []
    if visible_services:
        v_set = {s.lower() for s in visible_services}
        services = [s for s in services if s.lower() in v_set]
    return {"services": services, "count": len(services)}


@router.get("/search/events/latest-deploy")
async def get_latest_deploy_endpoint(
    auth: dict = Depends(get_current_org),
):
    """
    GET /search/events/latest-deploy – Retrieves latest deployment event timestamp.
    """
    org_id = auth["org_id"]
    deploy_dt = lookup_latest_deploy_event(org_id)
    if deploy_dt:
        return {
            "found": True,
            "latest_deploy_ts": deploy_dt.isoformat().replace("+00:00", "Z"),
        }
    return {
        "found": False,
        "latest_deploy_ts": None,
        "message": "No deployment event found for this organization in DuckDB or ClickHouse.",
    }
