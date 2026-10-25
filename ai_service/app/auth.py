"""
auth.py – JWT authentication for the ai-service.

The ai-service reads the same JWT secret as the Node.js support-api /
Agamotto server (EOA_JWT_SECRET / JWT_SECRET env var), so the same token
issued by the Node.js server works here.

Token claims used:
  sub             → user id
  org_id          → organisation (the authoritative tenancy boundary)
  visible_services → optional list of service names the user may see

org_id is NEVER read from the request body or query string.
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


def _extract_token(request: Request, creds: Optional[HTTPAuthorizationCredentials]) -> str:
    """Try Bearer header first, then access_token cookie."""
    if creds and creds.credentials:
        return creds.credentials
    cookie = request.cookies.get("access_token")
    if cookie:
        return cookie
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )


async def get_current_org(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """
    FastAPI dependency that validates the JWT and returns a dict with:
      org_id, sub, visible_services
    
    Raises 401 if the token is missing, expired, or invalid.
    Raises 403 if org_id claim is absent (should never happen with well-formed tokens).
    """
    token = _extract_token(request, creds)
    payload = _decode_token(token)

    org_id = payload.get("org_id") or payload.get("orgId")
    if not org_id:
        # Fall back to sub if org_id isn't in the token yet (dev tokens)
        # In production every token must have org_id.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token does not carry an org_id claim",
        )

    return {
        "sub": payload.get("sub"),
        "org_id": org_id,
        "visible_services": payload.get("visible_services") or [],
    }
