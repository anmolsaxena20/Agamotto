"""
loop.py – Agent execution loop for Feature 9 (AI Investigation Assistant).

Implementation details from the doc:
- POST /ask on ai-service receives question and context (filter, trace, span, anomaly).
- Pre-load context cheaply: if an anomaly or trace is given, fetch it first and put its summary in prompt.
- Streams events: tool_start, tool_result, answer, error.
- Enforces limits: 8 tool calls, 45-second total timeout, 6000 chars per tool result.
- Uses Pydantic AiAnswer schema, retries once on validation error.
- Passes through validator.py (Feature 19) to drop hallucinated evidence.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import AsyncGenerator, Dict, Any, List, Optional

from app.config import get_settings
from app.llm import LLMClient
from app.mcp_client import McpClient
from app.schemas import AiAnswer, AskContext
from app.validator import validate_ai_answer

logger = logging.getLogger(__name__)


def _load_system_prompt() -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "prompts", "system.md")
    try:
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logger.warning("Could not read system.md (%s); using fallback prompt", e)
        return (
            "You are the Eye of Agamotto AI Investigation Assistant. "
            "Use only verified telemetry tool results. Cite evidence IDs. Never guess."
        )


async def run_agent_loop(
    question: str,
    context: Optional[AskContext],
    org_id: str,
    visible_services: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    token: Optional[str] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Execute the agent investigation loop and yield SSE event dictionaries:
      {"event": "tool_start", "data": {...}}
      {"event": "tool_result", "data": {...}}
      {"event": "answer", "data": {...}}
      {"event": "error", "data": {...}}
    """
    cfg = get_settings()
    llm = LLMClient()
    mcp = McpClient(
        org_id=org_id,
        visible_services=visible_services,
        user_id=user_id,
        token=token,
    )

    start_time = time.time()
    max_timeout = cfg.EOA_AGENT_TIMEOUT_S
    max_tool_calls = cfg.EOA_AGENT_MAX_TOOL_CALLS

    # Prepare system and user messages
    system_prompt = _load_system_prompt()
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_prompt}
    ]

    # Pre-load context cheaply
    preload_notes = []
    if context:
        if context.anomaly_id:
            try:
                # Pre-fetch anomaly summary
                res = await mcp.call_tool("get_anomalies", {"filter": {}})
                preload_notes.append(f"Context Anomaly Data: {res[:1000]}")
            except Exception as e:
                logger.debug("Failed preloading anomaly: %s", e)

        if context.trace_id:
            try:
                res = await mcp.call_tool("get_trace", {"trace_id": context.trace_id})
                preload_notes.append(f"Context Trace Detail: {res[:1000]}")
            except Exception as e:
                logger.debug("Failed preloading trace: %s", e)

        if context.filter:
            preload_notes.append(f"Active Filter: {json.dumps(context.filter)}")

    user_content = question
    if preload_notes:
        user_content += "\n\nPre-loaded Telemetry Context:\n" + "\n".join(preload_notes)

    messages.append({"role": "user", "content": user_content})

    tool_definitions = mcp.get_tool_definitions()
    tool_call_count = 0
    final_answer: Optional[AiAnswer] = None

    try:
        while tool_call_count < max_tool_calls:
            # Check timeout
            elapsed = time.time() - start_time
            if elapsed >= max_timeout:
                logger.warning("Agent loop reached timeout limit (%s s)", max_timeout)
                break

            # Call LLM
            content, tool_calls = await llm.chat(messages, tools=tool_definitions)

            if tool_calls:
                # Execute each tool call
                for tc in tool_calls:
                    if tool_call_count >= max_tool_calls:
                        break
                    tool_call_count += 1
                    t_name = tc.get("name")
                    t_args = tc.get("arguments", {})
                    t_id = tc.get("id", f"call_{tool_call_count}")

                    # Yield tool_start event
                    yield {
                        "event": "tool_start",
                        "data": {
                            "tool_name": t_name,
                            "arguments": t_args,
                            "call_id": t_id,
                            "step": tool_call_count,
                        }
                    }

                    # Execute MCP tool
                    t_result = await mcp.call_tool(t_name, t_args)

                    # Yield tool_result event
                    yield {
                        "event": "tool_result",
                        "data": {
                            "tool_name": t_name,
                            "call_id": t_id,
                            "result_summary": t_result[:200] + ("..." if len(t_result) > 200 else ""),
                            "length": len(t_result),
                        }
                    }

                    # Append tool message
                    messages.append({
                        "role": "tool",
                        "tool_call_id": t_id,
                        "name": t_name,
                        "content": t_result,
                    })
            else:
                # Model provided content without tool calls - attempt to parse AiAnswer
                if content:
                    parsed = _try_parse_ai_answer(content)
                    if parsed:
                        final_answer = parsed
                        break
                    else:
                        # Retry once with explicit schema instruction
                        messages.append({"role": "assistant", "content": content})
                        messages.append({
                            "role": "user",
                            "content": (
                                "Your previous response was not valid JSON conforming to the AiAnswer schema. "
                                "Return ONLY a JSON object with keys: summary, insufficient_evidence, evidence, hypotheses, next_steps."
                            )
                        })
                        content_retry, _ = await llm.chat(messages, force_answer=True)
                        if content_retry:
                            final_answer = _try_parse_ai_answer(content_retry)
                        break
                else:
                    break

        # If loop ended without parsed answer or hit limits, force one final structured synthesis
        if not final_answer:
            elapsed = time.time() - start_time
            is_timeout = elapsed >= max_timeout or tool_call_count >= max_tool_calls
            content_forced, _ = await llm.chat(messages, force_answer=True)
            if content_forced:
                final_answer = _try_parse_ai_answer(content_forced)

            if not final_answer:
                final_answer = AiAnswer(
                    summary="Investigation incomplete due to query execution limits.",
                    insufficient_evidence=True,
                    evidence=[],
                    hypotheses=[],
                    next_steps=["Refine the search time range and re-run investigation."],
                )
            elif is_timeout and not final_answer.evidence:
                final_answer.insufficient_evidence = True

        # Run Validator (Feature 19)
        final_answer = validate_ai_answer(final_answer, org_id)

        # Yield evidence_validated event for real-time frontend chip rendering (Feature 19)
        yield {
            "event": "evidence_validated",
            "data": {
                "verified_evidence_count": len(final_answer.evidence),
                "insufficient_evidence": final_answer.insufficient_evidence,
                "evidence": [e.model_dump(mode="json") for e in final_answer.evidence],
                "validation_stats": final_answer.validation_stats,
            },
        }

        # Yield final answer event
        yield {
            "event": "answer",
            "data": final_answer.model_dump(mode="json"),
        }

    except Exception as exc:
        logger.exception("Error during agent loop execution: %s", exc)
        yield {
            "event": "error",
            "data": {
                "message": str(exc),
                "insufficient_evidence": True,
            }
        }


def _try_parse_ai_answer(text: str) -> Optional[AiAnswer]:
    """Extract and validate AiAnswer from text."""
    try:
        # Strip potential markdown code fences ```json ... ```
        cleaned = text.strip()
        if "```" in cleaned:
            # Match json block
            import re
            m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
            if m:
                cleaned = m.group(1).strip()

        data = json.loads(cleaned)
        if isinstance(data, dict):
            return AiAnswer(**data)
    except Exception as e:
        logger.debug("Failed parsing AiAnswer: %s", e)
    return None
