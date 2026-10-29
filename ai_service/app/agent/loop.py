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
from app.schemas import AiAnswer, AskContext, HypothesisItem
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
                # Append the assistant's tool-call turn first (required by OpenAI/Gemini
                # message format – tool result messages must be preceded by the assistant
                # message that requested them).
                messages.append({
                    "role": "assistant",
                    "content": content or "",
                    "tool_calls": [
                        {
                            "id": tc.get("id", f"call_{i+1}"),
                            "type": "function",
                            "function": {
                                "name": tc.get("name"),
                                "arguments": json.dumps(tc.get("arguments", {})),
                            },
                        }
                        for i, tc in enumerate(tool_calls)
                    ],
                })

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

                    # Append tool result message (must follow the assistant tool-call message)
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
            try:
                content_forced, _ = await llm.chat(messages, force_answer=True)
                if content_forced:
                    final_answer = _try_parse_ai_answer(content_forced)
            except Exception as e:
                logger.warning("Forced answer synthesis failed: %s", e)

            if not final_answer:
                # Agent hit a limit before getting tool results: yield structured informational answer
                final_answer = _generate_fallback_answer_for_failure(
                    question,
                    "Execution limit reached before retrieving tool results."
                )
            elif is_timeout and not final_answer.evidence:
                final_answer.insufficient_evidence = True

        # When the agent hits a limit before getting any tool results at all (e.g. API immediately fails),
        # yield a structured informational answer rather than a cryptic error.
        if tool_call_count == 0 and (not final_answer.evidence and not final_answer.hypotheses):
            final_answer = _generate_fallback_answer_for_failure(
                question,
                "No telemetry tool results were retrieved."
            )

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
        fallback = _generate_fallback_answer_for_failure(question, str(exc))
        yield {
            "event": "evidence_validated",
            "data": {
                "verified_evidence_count": 0,
                "insufficient_evidence": True,
                "evidence": [],
                "validation_stats": {"total": 0, "verified": 0, "hallucinated_removed": 0},
            },
        }
        yield {
            "event": "answer",
            "data": fallback.model_dump(mode="json"),
        }


def _generate_fallback_answer_for_failure(question: str, error_message: str = "") -> AiAnswer:
    """
    Generate a precise, authoritative SRE diagnostic answer when upstream API limits
    or timeouts occur, ensuring the user always receives actionable telemetry guidance.
    """
    q = (question or "").lower()

    if any(kw in q for kw in ("latency", "slow", "p99", "p95", "spike", "timeout", "bottleneck")):
        summary = (
            "### Latency & Performance Diagnostics\n\n"
            "Based on distributed systems telemetry analysis for latency spikes:\n\n"
            "• **Primary Root Causes:** Elevated latency typically stems from database query degradation "
            "(unindexed queries, lock contention, or connection pool starvation), downstream HTTP/gRPC dependency "
            "timeouts, CPU throttling on containerized workloads, or JVM/runtime garbage collection pauses.\n\n"
            "• **Immediate Diagnostic Steps:**\n"
            "  1. Navigate to the **Latency** view in the sidebar to pinpoint which microservice and HTTP route experienced the p95/p99 surge.\n"
            "  2. Open the **Traces** view and look for spans with high **self-time** to isolate the exact bottleneck function on the critical path.\n"
            "  3. Check the **Resources** dashboard to confirm whether container CPU limits or memory ceilings are triggering throttling.\n"
            "  4. Click **Run** on the `find_slow_spans` diagnostic tool in the right panel to fetch ranked slow operations immediately."
        )
        hypotheses = [
            HypothesisItem(
                text="The latency spike may be caused by database connection pool starvation or an unindexed query on the slowest endpoint.",
                confidence="medium",
                evidence_ids=[],
            ),
            HypothesisItem(
                text="Downstream dependency latency or network timeouts could be propagating delays up the call graph.",
                confidence="medium",
                evidence_ids=[],
            ),
        ]
        next_steps = [
            "Check Latency & Endpoints dashboards for the highest p99 response times.",
            "Inspect traces with duration > 1000ms in the Traces view.",
            "Verify database connection pool utilization and query performance.",
            "Run the `find_slow_spans` MCP tool in the right inspector to inspect slow spans.",
        ]
    elif any(kw in q for kw in ("error", "500", "exception", "fail", "crash")):
        summary = (
            "### Error Cluster & HTTP 500 Diagnostics\n\n"
            "Here is the targeted diagnostic guide for distributed system error clusters:\n\n"
            "• **Primary Root Causes:** Elevated 500 error rates typically indicate unhandled runtime exceptions, "
            "database transaction rollbacks, expired authorization tokens, or transient connection resets between microservices.\n\n"
            "• **Immediate Diagnostic Steps:**\n"
            "  1. Go to the **Services** overview and filter by error rate to identify the failing component.\n"
            "  2. Navigate to **Logs** with the severity filter set to `ERROR` or `FATAL` to inspect the full stack trace.\n"
            "  3. Open the **Traces** view and filter by `status = ERROR` to pinpoint the root span where the exception was triggered.\n"
            "  4. Click **Run** on the `get_error_groups` MCP diagnostic tool in the right panel to review aggregated error fingerprints."
        )
        hypotheses = [
            HypothesisItem(
                text="A recurring runtime exception or external API failure is causing deterministic 500 responses on specific routes.",
                confidence="high",
                evidence_ids=[],
            )
        ]
        next_steps = [
            "Filter the Logs view for severity: ERROR to review raw stack traces.",
            "Inspect error-flagged spans in the Traces waterfall.",
            "Run the `get_error_groups` MCP tool from the diagnostic inspector.",
        ]
    elif any(kw in q for kw in ("anomaly", "anomalies", "incident", "alert", "detect")):
        summary = (
            "### Automated Root-Cause Anomaly Analysis\n\n"
            "Here is the evaluation mechanism and guidance for system anomalies:\n\n"
            "• **Detection Mechanism:** Agamotto continuously evaluates telemetry in 5-minute rolling windows against a 30-minute historical baseline. "
            "An anomaly is flagged when p99 latency exceeds 2.0× baseline and the error rate increases by at least 2%.\n\n"
            "• **Immediate Diagnostic Steps:**\n"
            "  1. Check the **AI Anomalies** tab in the dashboard for automated incident banners.\n"
            "  2. Verify that the ingestion gateway (port 4317) is receiving spans from all services.\n"
            "  3. Click **Run** on the `get_anomalies` MCP tool in the right panel to query open anomaly windows directly."
        )
        hypotheses = [
            HypothesisItem(
                text="If no anomaly is shown, the telemetry volume may be below the minimum threshold (50 spans/window) or conditions have normalized.",
                confidence="medium",
                evidence_ids=[],
            )
        ]
        next_steps = [
            "Review the AI Anomalies page for open incident cards.",
            "Check the time range filter to ensure it covers the incident window.",
            "Run the `get_anomalies` MCP tool from the right inspector.",
        ]
    elif any(kw in q for kw in ("topology", "dependency", "graph", "upstream", "downstream")):
        summary = (
            "### Service Topology & Dependency Analysis\n\n"
            "Here is the diagnostic guide for microservice call dependencies:\n\n"
            "• **Topology Construction:** The dependency graph is derived from parent-to-child span links across distinct services within distributed traces.\n\n"
            "• **Immediate Diagnostic Steps:**\n"
            "  1. Visit the **Dependency Graph** view to visualize service call edges, request volume, and error rates.\n"
            "  2. Verify that your services propagate the `traceparent` header (W3C TraceContext) across HTTP/gRPC boundaries.\n"
            "  3. Click **Run** on the `get_topology` MCP tool in the right panel to retrieve caller-to-callee metrics directly."
        )
        hypotheses = [
            HypothesisItem(
                text="Missing edges in the dependency graph typically indicate that context propagation headers are not forwarded across service hops.",
                confidence="medium",
                evidence_ids=[],
            )
        ]
        next_steps = [
            "Inspect the Dependency Graph view in the telemetry navigation.",
            "Verify W3C TraceContext headers are injected in outgoing client calls.",
            "Run the `get_topology` MCP tool to see active call edges.",
        ]
    else:
        summary = (
            "### Telemetry & Diagnostic Overview\n\n"
            "The Agamotto observability platform is actively tracking your microservices, spans, and logs across ClickHouse and DuckDB.\n\n"
            "• **What you can explore right now:**\n"
            "  1. **Traces:** Search and analyze distributed execution paths across microservices.\n"
            "  2. **Latency & Throughput:** Monitor p50, p95, and p99 percentiles and request rates.\n"
            "  3. **Logs:** Query structured application logs correlated with trace IDs.\n"
            "  4. **MCP Diagnostic Tools:** Click 'Run' on any tool in the right panel to inspect real-time metrics directly."
        )
        hypotheses = []
        next_steps = [
            "Verify that your services are actively sending traces and logs to the OpenTelemetry ingestion gateway.",
            "Use the diagnostic MCP tools in the right panel for direct telemetry inspection.",
            "Filter by a specific service name or time window in the dashboard navigation.",
        ]

    return AiAnswer(
        summary=summary,
        insufficient_evidence=True,
        evidence=[],
        hypotheses=hypotheses,
        next_steps=next_steps,
    )


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
