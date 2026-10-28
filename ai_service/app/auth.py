"""
auth.py – Authentication and authorization for the ai-service.

Supports:
1. Server-to-Service Internal API Key (x-ai-service-key / x-api-key)
   When requests are proxied through the Agamotto Node.js core server,
   the server verifies user session and org permissions, then passes
   the validated tenancy context in x-org-id and x-user-id.
2. Direct JWT Bearer Token / Cookie (backward compatibility and direct test tokens)
"""

from __future__ import annotations

import logging
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

logger = logging.getLogger(__name__)
_bearer = HTTPBearer(auto_error=False)


def _decode_token(token: str) -> dict:
    cfg = get_settings()
    try:
        return jwt.decode(
            token,
            cfg.JWT_SECRET,
            algorithms=[cfg.JWT_ALGORITHM],
            options={"verify_exp": True},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
        )


def _extract_token(request: Request, creds: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    """Try Bearer header first, then access_token cookie."""
    if creds and creds.credentials:
        return creds.credentials
    cookie = request.cookies.get("access_token")
    if cookie:
        return cookie
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    return None


async def get_current_org(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """
    FastAPI dependency that validates either:
      a) Internal API key (x-ai-service-key / x-api-key) + x-org-id from Core Server
      b) Valid User JWT carrying an org_id claim
    """
    cfg = get_settings()

    # 1. Check for Server Internal API Key
    api_key = (
        request.headers.get("x-ai-service-key")
        or request.headers.get("x-api-key")
        or request.query_params.get("apiKey")
    )
    if api_key:
        if api_key != cfg.AI_SERVICE_INTERNAL_KEY:
            logger.warning("Rejected request with invalid x-ai-service-key")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid AI service API key",
            )
        org_id = (
            request.headers.get("x-org-id")
            or request.headers.get("x-organization-id")
            or request.query_params.get("orgId")
        )
        if not org_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="x-org-id header is required for internal API calls",
            )
        user_id = request.headers.get("x-user-id") or "server-internal"
        visible_services_raw = request.headers.get("x-visible-services") or ""
        visible_services = [s.strip() for s in visible_services_raw.split(",") if s.strip()]
        return {
            "sub": user_id,
            "org_id": org_id,
            "visible_services": visible_services,
        }

    # 2. Check for JWT authentication
    token = _extract_token(request, creds)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: provide x-ai-service-key or Bearer token",
        )

    payload = _decode_token(token)
    org_id = payload.get("org_id") or payload.get("orgId")
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token does not carry an org_id claim",
        )

    return {
        "sub": payload.get("sub"),
        "org_id": org_id,
        "visible_services": payload.get("visible_services") or [],
    }
