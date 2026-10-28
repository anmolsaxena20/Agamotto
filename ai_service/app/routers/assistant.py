"""
assistant.py – Router for Feature 9 & 19 (AI Investigation Assistant).

Endpoints:
- POST /ask: Streams SSE progress events (tool_start, tool_result, answer, error)
  as the agent inspects telemetry through MCP tools and validates citations.
- POST /ask/sync: Non-streaming direct response endpoint for API clients and tests.
- POST /investigations/share: Stores or creates a shareable link snapshot.
"""

from __future__ import annotations

import json
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Request, HTTPException, status
from fastapi.responses import StreamingResponse

from app.auth import get_current_org, _extract_token
from app.agent.loop import run_agent_loop
from app.cache import get_cached_answer, set_cached_answer
from app.schemas import AskRequest, AiAnswer

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ai-assistant"])


@router.post("/ask")
async def ask_assistant(
    request: Request,
    payload: AskRequest,
    auth: dict = Depends(get_current_org),
):
    """
    POST /ask – AI Investigation Assistant (Features 9 & 19).

    Receives user question and context (filter, trace_id, span_id, anomaly_id).
    Streams Server-Sent Events (SSE):
      - tool_start: When the model initiates an MCP telemetry tool
      - tool_result: When MCP returns data (capped to 6000 chars)
      - answer: Final validated AiAnswer adhering to JSON schema
      - error: If unrecoverable failure occurs
    """
    org_id = auth["org_id"]
    visible_services = auth.get("visible_services") or []
    user_id = auth.get("sub")

    # Extract user token for forwarding into MCP context
    try:
        token = _extract_token(request, None)
    except Exception:
        token = None

    context_dict = payload.context.model_dump() if payload.context else None

    # Check short-lived cache first
    cached = get_cached_answer(org_id, payload.question, context_dict)
    if cached:
        async def cached_stream():
            yield f"event: answer\ndata: {cached.model_dump_json()}\n\n"

        return StreamingResponse(
            cached_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    async def event_generator():
        final_answer_obj = None
        async for sse_event in run_agent_loop(
            question=payload.question,
            context=payload.context,
            org_id=org_id,
            visible_services=visible_services,
            user_id=user_id,
            token=token,
        ):
            event_name = sse_event.get("event", "message")
            data_str = json.dumps(sse_event.get("data", {}))

            if event_name == "answer":
                try:
                    final_answer_obj = AiAnswer(**sse_event["data"])
                except Exception:
                    pass

            yield f"event: {event_name}\ndata: {data_str}\n\n"

        # Save to cache if we got an answer
        if final_answer_obj:
            set_cached_answer(org_id, payload.question, context_dict, final_answer_obj)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/ask/sync", response_model=AiAnswer)
async def ask_assistant_sync(
    request: Request,
    payload: AskRequest,
    auth: dict = Depends(get_current_org),
):
    """
    Non-streaming synchronous endpoint for testing and direct client calls.
    """
    org_id = auth["org_id"]
    visible_services = auth.get("visible_services") or []
    user_id = auth.get("sub")

    try:
        token = _extract_token(request, None)
    except Exception:
        token = None

    context_dict = payload.context.model_dump() if payload.context else None

    cached = get_cached_answer(org_id, payload.question, context_dict)
    if cached:
        return cached

    last_answer = None
    last_error = None

    async for sse_event in run_agent_loop(
        question=payload.question,
        context=payload.context,
        org_id=org_id,
        visible_services=visible_services,
        user_id=user_id,
        token=token,
    ):
        if sse_event["event"] == "answer":
            last_answer = AiAnswer(**sse_event["data"])
        elif sse_event["event"] == "error":
            last_error = sse_event["data"].get("message")

    if last_answer:
        set_cached_answer(org_id, payload.question, context_dict, last_answer)
        return last_answer

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Investigation failed: {last_error or 'No answer generated'}",
    )
