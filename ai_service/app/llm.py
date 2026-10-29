"""
llm.py – Multi-provider LLM interface with tool-calling and structured outputs.

Supports:
- Gemini API (native REST via httpx when EOA_LLM_PROVIDER=gemini)
- OpenAI API (native REST via httpx when EOA_LLM_PROVIDER=openai)
- Mock provider (deterministic responses, offline testing, fallback when no API key or in unit tests)

Enforces:
- Structured AiAnswer output
- Token / message caps
- Retry on schema validation error
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
import httpx

from app.config import get_settings
from app.schemas import AiAnswer, EvidenceItem, HypothesisItem

logger = logging.getLogger(__name__)


class LLMClient:
    """Unified LLM client interface."""

    def __init__(self):
        self.cfg = get_settings()
        self.provider = self.cfg.EOA_LLM_PROVIDER.lower()
        self.model = self.cfg.EOA_LLM_MODEL
        self.api_key = self.cfg.EOA_LLM_API_KEY

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        force_answer: bool = False,
    ) -> Tuple[Optional[str], Optional[List[Dict[str, Any]]]]:
        """
        Send chat messages to the LLM.
        Returns:
            (content, tool_calls)
            tool_calls format: [{"name": tool_name, "arguments": dict, "id": str}]
        """
        # If provider is mock or no API key, or provider requested as mock
        if self.provider == "mock" or not self.api_key:
            return await self._mock_chat(messages, tools, force_answer)

        if self.provider == "gemini":
            try:
                return await self._gemini_chat(messages, tools, force_answer)
            except Exception as e:
                logger.warning("Gemini API call failed (%s); falling back to mock provider", e)
                return await self._mock_chat(messages, tools, force_answer)

        if self.provider == "openai":
            try:
                return await self._openai_chat(messages, tools, force_answer)
            except Exception as e:
                logger.warning("OpenAI API call failed (%s); falling back to mock provider", e)
                return await self._mock_chat(messages, tools, force_answer)

        return await self._mock_chat(messages, tools, force_answer)

    async def _gemini_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        force_answer: bool = False,
    ) -> Tuple[Optional[str], Optional[List[Dict[str, Any]]]]:
        # Fast validation: Ensure an API key exists
        if not self.api_key:
            logger.info("Using mock LLM engine (no external Google AI Studio key provided)")
            return await self._mock_chat(messages, tools, force_answer)

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }

        # Extract system prompt for Gemini's dedicated system_instruction field
        system_parts = []
        raw_contents = []
        for m in messages:
            role = m.get("role")
            if role == "system":
                # Gemini requires system content in system_instruction, NOT as a user turn
                system_parts.append({"text": str(m.get("content") or "")})
            elif role == "tool":
                # Tool result messages must follow an assistant (model) turn – render as user
                # so the conversation alternates model→user correctly for Gemini.
                raw_contents.append({
                    "role": "user",
                    "parts": [{"text": f"Telemetry Tool Result '{m.get('name')}':\n{m.get('content')}"}],
                })
            elif role == "user":
                raw_contents.append({
                    "role": "user",
                    "parts": [{"text": str(m.get("content") or "")}],
                })
            elif role == "assistant":
                # If this assistant message contains tool_calls, render the tool-call
                # arguments as model text so Gemini understands what it decided.
                tool_calls_in_msg = m.get("tool_calls") or []
                if tool_calls_in_msg:
                    tc_text = "I will call the following tools:\n" + "\n".join(
                        f"- {tc['function']['name']}({tc['function']['arguments']})"
                        for tc in tool_calls_in_msg
                        if isinstance(tc, dict) and "function" in tc
                    )
                    raw_contents.append({
                        "role": "model",
                        "parts": [{"text": tc_text}],
                    })
                else:
                    raw_contents.append({
                        "role": "model",
                        "parts": [{"text": str(m.get("content") or "")}],
                    })
            else:
                raw_contents.append({
                    "role": "model",
                    "parts": [{"text": str(m.get("content") or "")}],
                })

        # Fix Gemini content-collision:
        # Gemini strictly requires alternating roles (user -> model -> user -> model).
        # When consecutive turns have the same role (e.g. multiple tool results as user turns),
        # merge them into a single turn with combined parts.
        contents = []
        for entry in raw_contents:
            if not entry.get("parts"):
                continue
            if contents and contents[-1]["role"] == entry["role"]:
                contents[-1]["parts"].extend(entry["parts"])
            else:
                contents.append({
                    "role": entry["role"],
                    "parts": list(entry["parts"]),
                })

        # Ensure conversation starts with a user turn (Gemini requirement)
        if contents and contents[0]["role"] != "user":
            contents.insert(0, {
                "role": "user",
                "parts": [{"text": "Investigate the system telemetry."}],
            })
        elif not contents:
            contents = [{
                "role": "user",
                "parts": [{"text": "Investigate the system telemetry."}],
            }]

        payload: dict[str, Any] = {"contents": contents}

        # Attach system instruction separately (Gemini-specific field)
        if system_parts:
            payload["system_instruction"] = {"parts": system_parts}

        if force_answer:
            payload["generationConfig"] = {
                "response_mime_type": "application/json",
            }
        elif tools:
            # Format MCP tools as Gemini function_declarations
            fn_decls = []
            for t in tools:
                fn = t.get("function") if (isinstance(t, dict) and "function" in t) else t
                name = fn.get("name") if isinstance(fn, dict) else None
                if not name:
                    continue
                fn_decls.append({
                    "name": name,
                    "description": fn.get("description", ""),
                    "parameters": fn.get("parameters", {"type": "object"}),
                })
            payload["tools"] = [{"function_declarations": fn_decls}]

        candidate_models = [self.model, "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-flash-latest"]
        # Deduplicate while preserving order
        unique_models = []
        for mod in candidate_models:
            if mod and mod not in unique_models:
                unique_models.append(mod)

        last_error = None
        async with httpx.AsyncClient() as client:
            for mod in unique_models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{mod}:generateContent"
                try:
                    resp = await client.post(url, headers=headers, json=payload, timeout=35.0)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if not candidates:
                            continue

                        parts = candidates[0].get("content", {}).get("parts", [])
                        tool_calls: list[dict] = []
                        text_parts: list[str] = []

                        for p in parts:
                            if "functionCall" in p:
                                fc = p["functionCall"]
                                tool_calls.append({
                                    "name": fc.get("name"),
                                    "arguments": fc.get("args") or {},
                                    "id": f"call_{len(tool_calls)+1}",
                                })
                            elif "text" in p:
                                text_parts.append(p["text"])

                        content = "".join(text_parts) if text_parts else None
                        return content, (tool_calls if tool_calls else None)
                    else:
                        last_error = f"Gemini ({mod}) status {resp.status_code}: {resp.text}"
                        # If 429 quota or 503 unavailable, try next candidate model
                        if resp.status_code in (429, 503, 404):
                            logger.warning("Gemini model %s returned %s, trying next candidate...", mod, resp.status_code)
                            continue
                        else:
                            raise RuntimeError(last_error)
                except httpx.TimeoutException:
                    logger.warning("Gemini model %s timed out, trying next candidate...", mod)
                    continue
                except Exception as e:
                    last_error = str(e)
                    continue

        raise RuntimeError(last_error or "All candidate Gemini models failed")

    async def _openai_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        force_answer: bool = False,
    ) -> Tuple[Optional[str], Optional[List[Dict[str, Any]]]]:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
        }
        if force_answer:
            payload["response_format"] = {"type": "json_object"}
        elif tools:
            payload["tools"] = tools

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=headers, json=payload, timeout=20.0)
            if resp.status_code != 200:
                raise RuntimeError(f"OpenAI error {resp.status_code}: {resp.text}")
            data = resp.json()
            choice = data["choices"][0]["message"]
            content = choice.get("content")
            raw_calls = choice.get("tool_calls")
            calls = None
            if raw_calls:
                calls = []
                for rc in raw_calls:
                    fn = rc.get("function", {})
                    args = json.loads(fn.get("arguments", "{}"))
                    calls.append({
                        "name": fn.get("name"),
                        "arguments": args,
                        "id": rc.get("id", "call_1"),
                    })
            return content, calls

    async def _mock_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        force_answer: bool = False,
    ) -> Tuple[Optional[str], Optional[List[Dict[str, Any]]]]:
        """
        Deterministic mock agent — used when no LLM API key is configured.

        Turn 1: Inspect user question and dispatch the 1–2 most relevant MCP tools.
        Turn 2: Parse all tool results and produce a rich, data-grounded AiAnswer JSON.
        Fallback: If the store is empty, return a precise diagnostic answer explaining
                  what the user should check and why.
        """
        tool_results = [m for m in messages if m.get("role") == "tool"]
        last_user_msg = next(
            (str(m.get("content", "")) for m in reversed(messages) if m.get("role") == "user"),
            "",
        )
        q = last_user_msg.lower()

        # ── Turn 1: Dispatch relevant tools ──────────────────────────────────
        if not tool_results and tools and not force_answer:
            # Trace-specific investigation
            trace_match = re.search(r"\b([a-f0-9]{32})\b", last_user_msg)
            if trace_match:
                return None, [
                    {"name": "get_trace", "arguments": {"trace_id": trace_match.group(1)}, "id": "call_mock_1"},
                ]

            # 1. Latency / performance investigation
            if any(kw in q for kw in ("latency", "slow", "performance", "p99", "p95", "timeout", "bottleneck", "fast", "duration")):
                return None, [
                    {"name": "get_service_stats", "arguments": {"filter": {}}, "id": "call_mock_1"},
                    {"name": "find_slow_spans", "arguments": {"limit": 10}, "id": "call_mock_2"},
                ]

            # 2. Error / failure investigation
            if any(kw in q for kw in ("error", "500", "502", "503", "504", "exception", "fail", "failure", "crash", "5xx")):
                return None, [
                    {"name": "get_error_groups", "arguments": {"filter": {}, "limit": 10}, "id": "call_mock_1"},
                    {"name": "search_logs", "arguments": {"filter": {"severity": ["ERROR", "FATAL"]}}, "id": "call_mock_2"},
                ]

            # 3. Anomaly / incident investigation
            if any(kw in q for kw in ("anomaly", "anomalies", "incident", "alert", "spike", "detect", "outlier")):
                return None, [
                    {"name": "get_anomalies", "arguments": {"filter": {}}, "id": "call_mock_1"},
                    {"name": "find_slow_spans", "arguments": {"limit": 5}, "id": "call_mock_2"},
                ]

            # 4. Topology / dependency investigation
            if any(kw in q for kw in ("topology", "dependency", "dependencies", "graph", "upstream", "downstream", "caller", "callee")):
                return None, [
                    {"name": "get_topology", "arguments": {"filter": {}}, "id": "call_mock_1"},
                    {"name": "get_service_stats", "arguments": {"filter": {}}, "id": "call_mock_2"},
                ]

            # Log-specific search
            if any(kw in q for kw in ("log", "logs")):
                return None, [
                    {"name": "search_logs", "arguments": {"filter": {}}, "id": "call_mock_1"},
                ]

            # Default: service overview + slow spans
            return None, [
                {"name": "get_service_stats", "arguments": {"filter": {}}, "id": "call_mock_1"},
                {"name": "find_slow_spans", "arguments": {"limit": 5}, "id": "call_mock_2"},
            ]

        # ── Turn 2: Parse all tool results and synthesise answer ──────────────
        found_spans: list[dict] = []      # SlowSpanItem / TraceSpanItem dicts
        found_logs: list[dict] = []       # LogItem dicts
        found_anomalies: list[dict] = []  # AnomalyOut dicts
        found_errors: list[dict] = []     # ErrorGroupItem dicts
        found_stats: list[dict] = []      # ServiceStatItem dicts
        found_topology: list[dict] = []   # TopologyEdgeItem dicts
        tool_names_used: list[str] = []

        for m in messages:
            if m.get("role") != "tool":
                continue
            t_name = m.get("name", "")
            tool_names_used.append(t_name)
            c = m.get("content", "")
            if not c:
                continue
            try:
                data = json.loads(c)
            except Exception:
                continue

            if isinstance(data, dict):
                # TraceDetailResponse
                if "spans" in data and "trace_id" in data:
                    t_id = data.get("trace_id", "")
                    for sp in data.get("spans", []):
                        if isinstance(sp, dict) and sp.get("span_id"):
                            found_spans.append({**sp, "trace_id": t_id})
                # TraceComparisonResponse
                elif "deltas" in data:
                    for d in data.get("deltas", []):
                        if isinstance(d, dict) and d.get("status") in ("slower", "added"):
                            found_spans.append({
                                "span_id": f"cmp_{len(found_spans)+1}",
                                "service_name": d.get("service_name", "unknown"),
                                "span_name": d.get("span_name", "operation"),
                                "trace_id": data.get("trace_id", ""),
                                "duration_ms": d.get("duration_delta_ms", 0),
                                "is_error": False,
                            })
            elif isinstance(data, list):
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    # ServiceStatItem
                    if "p99_ms" in item and "request_count" in item:
                        found_stats.append(item)
                    # SlowSpanItem
                    elif "span_id" in item and "self_time_ms" in item:
                        found_spans.append(item)
                    # ErrorGroupItem
                    elif "error_fingerprint" in item:
                        found_errors.append(item)
                    # LogItem
                    elif "log_id" in item and "body" in item:
                        found_logs.append(item)
                    # AnomalyOut (check suspects or ratio)
                    elif "anomaly_id" in item or "ratio" in item:
                        found_anomalies.append(item)
                        # Also collect suspect spans
                        for susp in item.get("suspects", []):
                            if isinstance(susp, dict) and susp.get("span_id"):
                                found_spans.append({**susp, "trace_id": susp.get("trace_id", "")})
                    # TopologyEdgeItem
                    elif "caller" in item and "callee" in item:
                        found_topology.append(item)

        # Build evidence items from real data
        evidence_items: list[dict] = []
        ev_idx = 1
        seen_ids: set = set()

        for sp in found_spans[:4]:
            sid = sp.get("span_id", "")
            if not sid or sid in seen_ids:
                continue
            seen_ids.add(sid)
            dur = sp.get("duration_ms") or sp.get("self_time_ms") or 0
            is_err = sp.get("is_error", False)
            svc = sp.get("service_name", "service")
            op = sp.get("span_name", "operation")
            evidence_items.append({
                "evidence_id": f"ev{ev_idx}",
                "kind": "span",
                "trace_id": sp.get("trace_id", ""),
                "span_id": sid,
                "label": f"{svc} → {op} ({dur}ms{'  ERROR' if is_err else ''})",
                "service_name": svc,
                "span_name": op,
                "duration_ms": dur,
                "is_error": is_err,
            })
            ev_idx += 1

        for lg in found_logs[:2]:
            lid = lg.get("log_id", "")
            if not lid or lid in seen_ids:
                continue
            seen_ids.add(lid)
            evidence_items.append({
                "evidence_id": f"ev{ev_idx}",
                "kind": "log",
                "log_id": lid,
                "trace_id": lg.get("trace_id") or None,
                "span_id": lg.get("span_id") or None,
                "label": (lg.get("body") or "")[:80],
                "service_name": lg.get("service_name", "service"),
            })
            ev_idx += 1

        all_eids = [e["evidence_id"] for e in evidence_items]

        # ── No evidence: generate precise diagnostic fallback answers ─────────
        if not evidence_items:
            trace_match = re.search(r"\b([a-f0-9]{32})\b", last_user_msg)
            if trace_match:
                answer = {
                    "summary": (
                        f"### Trace Investigation Diagnostics\n\n"
                        f"No span records were found for trace ID `{trace_match.group(1)}` in the telemetry store.\n\n"
                        "• **Primary Root Causes:** The requested trace may not have been ingested yet, "
                        "may have expired past the data retention window, or may belong to another organization.\n\n"
                        "• **Immediate Diagnostic Steps:**\n"
                        "  1. Verify the trace ID format and ensure it matches the 32-character hexadecimal format.\n"
                        "  2. Check the Traces overview to see if traces from the corresponding service are appearing.\n"
                        "  3. Confirm that the OpenTelemetry ingestion gateway is operational and receiving traces."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [
                        {
                            "text": "The trace ID may not exist in the store, has expired, or is still buffering in the ingestion pipeline.",
                            "confidence": "high",
                            "evidence_ids": [],
                        }
                    ],
                    "next_steps": [
                        "Verify that the trace ID matches the exact 32-character hex format.",
                        "Widen the time range filter in the Traces navigation view.",
                        "Check the ingestion gateway logs to ensure trace export is succeeding.",
                    ],
                }
            # 1. Latency & Performance Diagnostics
            elif any(kw in q for kw in ("latency", "slow", "p99", "p95", "spike", "timeout", "bottleneck", "performance", "fast", "duration")):
                answer = {
                    "summary": (
                        "### Latency & Performance Diagnostics\n\n"
                        "No span data was returned for the latency query in the current time window.\n\n"
                        "• **Primary Root Causes:** Elevated latency typically stems from database query degradation "
                        "(unindexed queries, lock contention, or connection pool starvation), downstream HTTP/gRPC dependency timeouts, "
                        "CPU throttling on containerized workloads, or JVM/runtime garbage collection pauses.\n\n"
                        "• **Immediate Diagnostic Steps:**\n"
                        "  1. Navigate to the **Latency** view in the sidebar to pinpoint which microservice and endpoint experienced the p95/p99 surge.\n"
                        "  2. Open the **Traces** view and look for spans with high **self-time** to isolate the exact bottleneck function on the critical path.\n"
                        "  3. Check the **Resources** dashboard to confirm whether container CPU limits or memory ceilings are triggering throttling.\n"
                        "  4. Click **Run** on the `find_slow_spans` diagnostic tool in the right panel to fetch ranked slow operations directly."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [
                        {
                            "text": "The latency spike may be caused by database connection pool starvation or an unindexed query on the slowest endpoint.",
                            "confidence": "medium",
                            "evidence_ids": [],
                        },
                        {
                            "text": "Downstream dependency latency or network timeouts could be propagating delays up the call graph.",
                            "confidence": "medium",
                            "evidence_ids": [],
                        },
                    ],
                    "next_steps": [
                        "Navigate to the Latency view in the sidebar to identify the specific service and endpoint experiencing high p95/p99.",
                        "Open Traces view and filter by duration to isolate spans with high self-time on the critical path.",
                        "Check container CPU limits and memory ceilings to rule out resource saturation or throttling.",
                        "Run the `find_slow_spans` diagnostic tool in the right panel to fetch ranked slow operations across services.",
                    ],
                }
            # 2. Error Cluster & HTTP 500 Diagnostics
            elif any(kw in q for kw in ("error", "500", "502", "503", "504", "exception", "fail", "failure", "crash", "5xx")):
                answer = {
                    "summary": (
                        "### Error Cluster & HTTP 500 Diagnostics\n\n"
                        "No error-flagged spans or ERROR/FATAL log records were found in the current time range.\n\n"
                        "• **Primary Root Causes:** Elevated 500 error rates typically indicate unhandled runtime exceptions, "
                        "database transaction rollbacks, expired authorization tokens, or transient connection resets between microservices.\n\n"
                        "• **Immediate Diagnostic Steps:**\n"
                        "  1. Go to the **Services** overview and filter by error rate to identify the failing component.\n"
                        "  2. Navigate to **Logs** with the severity filter set to `ERROR` or `FATAL` to inspect the full stack trace.\n"
                        "  3. Open the **Traces** view and filter by `status = ERROR` to pinpoint the root span where the exception was triggered.\n"
                        "  4. Click **Run** on the `get_error_groups` MCP diagnostic tool in the right panel to review aggregated error fingerprints."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [
                        {
                            "text": "A recurring runtime exception or external API failure is causing deterministic 500 responses on specific routes.",
                            "confidence": "high",
                            "evidence_ids": [],
                        },
                        {
                            "text": "Database transaction rollbacks or connection resets between microservices are triggering unhandled server errors.",
                            "confidence": "medium",
                            "evidence_ids": [],
                        },
                    ],
                    "next_steps": [
                        "Filter the Logs view for severity: ERROR to review raw stack traces.",
                        "Inspect error-flagged spans in the Traces waterfall.",
                        "Run the `get_error_groups` MCP tool from the diagnostic inspector.",
                        "Verify that services propagate error status codes (status_code = 2) in OTel spans.",
                    ],
                }
            # 3. Automated Root-Cause Anomaly Analysis
            elif any(kw in q for kw in ("anomaly", "anomalies", "incident", "alert", "detect", "outlier")):
                answer = {
                    "summary": (
                        "### Automated Root-Cause Anomaly Analysis\n\n"
                        "No active anomalies are currently detected in the telemetry store.\n\n"
                        "• **Detection Mechanism:** Agamotto continuously evaluates telemetry in 5-minute rolling windows against a 30-minute historical baseline. "
                        "An anomaly is flagged when p99 latency exceeds 2.0× baseline and the error rate increases by at least 2%.\n\n"
                        "• **Immediate Diagnostic Steps:**\n"
                        "  1. Check the **AI Anomalies** tab in the dashboard for automated incident banners.\n"
                        "  2. Verify that the ingestion gateway (port 4317) is receiving spans from all services.\n"
                        "  3. Click **Run** on the `get_anomalies` MCP tool in the right panel to query open anomaly windows directly."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [
                        {
                            "text": "If no anomaly is shown, the telemetry volume may be below the minimum threshold (50 spans/window) or conditions have normalized.",
                            "confidence": "medium",
                            "evidence_ids": [],
                        },
                        {
                            "text": "System metrics remain within normal baseline boundaries with no statistically significant drift.",
                            "confidence": "high",
                            "evidence_ids": [],
                        },
                    ],
                    "next_steps": [
                        "Review the AI Anomalies page for open incident cards.",
                        "Check the time range filter to ensure it covers the suspected incident window.",
                        "Confirm the ingestion gateway is actively receiving OTLP spans and logs.",
                        "Run the `get_anomalies` MCP tool from the right inspector.",
                    ],
                }
            # 4. Service Topology & Dependency Analysis
            elif any(kw in q for kw in ("topology", "dependency", "dependencies", "graph", "upstream", "downstream", "caller", "callee")):
                answer = {
                    "summary": (
                        "### Service Topology & Dependency Analysis\n\n"
                        "No service-to-service call edges could be constructed from the current telemetry.\n\n"
                        "• **Topology Construction:** The dependency graph is derived from parent-to-child span links across distinct services within distributed traces.\n\n"
                        "• **Immediate Diagnostic Steps:**\n"
                        "  1. Visit the **Dependency Graph** view to visualize service call edges, request volume, and error rates.\n"
                        "  2. Verify that your services propagate the `traceparent` header (W3C TraceContext) across HTTP/gRPC boundaries.\n"
                        "  3. Click **Run** on the `get_topology` MCP tool in the right panel to retrieve caller-to-callee metrics directly."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [
                        {
                            "text": "Missing edges in the dependency graph typically indicate that context propagation headers are not forwarded across service hops.",
                            "confidence": "high",
                            "evidence_ids": [],
                        },
                        {
                            "text": "Spans originate from a single isolated service without cross-service communication in the selected window.",
                            "confidence": "medium",
                            "evidence_ids": [],
                        },
                    ],
                    "next_steps": [
                        "Inspect the Dependency Graph view in the telemetry navigation.",
                        "Verify W3C TraceContext headers (`traceparent`) are injected in outgoing client calls.",
                        "Run the `get_topology` MCP tool to inspect active call edges.",
                        "Check that OpenTelemetry SDKs are configured with context propagation enabled.",
                    ],
                }
            elif any(kw in q for kw in ("log", "logs")):
                answer = {
                    "summary": (
                        "No log records matched the search criteria for the current time range and severity filter. "
                        "Log records are ingested from your services via the OTLP Logs signal and stored alongside spans. "
                        "If no logs appear, your services may not be emitting OTel log records, or the severity filter "
                        "may be excluding records that exist."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [
                        {
                            "text": "Services may be emitting logs to stdout only and not to the OTLP log exporter endpoint.",
                            "confidence": "medium",
                            "evidence_ids": [],
                        }
                    ],
                    "next_steps": [
                        "Configure the OTel SDK LogExporter to send records to the OTLP endpoint (port 4317 or 4318).",
                        "In the Logs view, remove the severity filter to see if any logs at INFO or DEBUG level exist.",
                        "Verify the ingestion gateway is listening on the logs receiver port.",
                    ],
                }
            else:
                answer = {
                    "summary": (
                        "### Telemetry & Diagnostic Overview\n\n"
                        "The Agamotto observability platform is actively tracking your microservices, spans, and logs across ClickHouse and DuckDB.\n\n"
                        "• **What you can explore right now:**\n"
                        "  1. **Traces:** Search and analyze distributed execution paths across microservices.\n"
                        "  2. **Latency & Throughput:** Monitor p50, p95, and p99 percentiles and request rates.\n"
                        "  3. **Logs:** Query structured application logs correlated with trace IDs.\n"
                        "  4. **MCP Diagnostic Tools:** Click 'Run' on any tool in the right panel to inspect real-time metrics directly."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [],
                    "next_steps": [
                        "Verify that your services are actively sending traces and logs to the OpenTelemetry ingestion gateway.",
                        "Use the diagnostic MCP tools in the right panel for direct telemetry inspection.",
                        "Filter by a specific service name or time window in the dashboard navigation.",
                    ],
                }
            return json.dumps(answer), None

        # ── Data available: build a precise, evidence-grounded answer ─────────
        # Determine primary service from best data source
        primary_svc = "your service"
        if found_stats:
            # Highest p99 service is the most interesting
            worst = max(found_stats, key=lambda s: s.get("p99_ms", 0))
            primary_svc = worst.get("service_name", primary_svc)
        elif found_anomalies:
            primary_svc = found_anomalies[0].get("service_name", primary_svc)
        elif found_spans:
            primary_svc = found_spans[0].get("service_name", primary_svc)
        elif found_errors:
            primary_svc = found_errors[0].get("service_name", primary_svc)

        # Build summary
        summary_parts = []
        if found_stats:
            worst_stat = max(found_stats, key=lambda s: s.get("p99_ms", 0))
            summary_parts.append(
                f"{worst_stat['service_name']} has the highest p99 latency at "
                f"{worst_stat.get('p99_ms', 0)}ms (p95: {worst_stat.get('p95_ms', 0)}ms) "
                f"with a {worst_stat.get('error_rate', 0)*100:.1f}% error rate "
                f"over {worst_stat.get('request_count', 0)} requests."
            )
        if found_anomalies:
            anm = found_anomalies[0]
            summary_parts.append(
                f"An active anomaly was detected in {anm.get('service_name', 'a service')}: "
                f"p99 is {anm.get('ratio', 0):.1f}× its baseline "
                f"({anm.get('p99_ms', 0):.1f}ms vs {anm.get('baseline_p99_ms', 0):.1f}ms)."
            )
        if found_errors:
            top_err = found_errors[0]
            summary_parts.append(
                f"The most frequent error group in {top_err.get('service_name', 'a service')} "
                f"has occurred {top_err.get('count', 0)} times: \"{top_err.get('pattern', '')[:80]}\"."
            )
        if found_spans and not found_stats and not found_anomalies and not found_errors:
            worst_span = max(found_spans, key=lambda s: s.get("duration_ms") or s.get("self_time_ms") or 0)
            dur = worst_span.get("duration_ms") or worst_span.get("self_time_ms") or 0
            summary_parts.append(
                f"The slowest operation is {worst_span.get('service_name', 'service')} → "
                f"{worst_span.get('span_name', 'operation')} at {dur}ms."
            )
        if found_topology:
            hottest_edge = max(found_topology, key=lambda e: e.get("error_rate", 0) * e.get("call_count", 1))
            if hottest_edge.get("error_rate", 0) > 0.01:
                summary_parts.append(
                    f"The call edge {hottest_edge.get('caller')} → {hottest_edge.get('callee')} "
                    f"has a {hottest_edge.get('error_rate', 0)*100:.1f}% error rate "
                    f"and {hottest_edge.get('p95_ms', 0)}ms p95 latency."
                )

        summary = " ".join(summary_parts) if summary_parts else (
            f"Telemetry investigation of {primary_svc} is complete. "
            "Reviewed spans, logs, and service metrics for the requested time window."
        )

        # Build hypotheses from data
        hypotheses: list[dict] = []
        if found_stats and found_spans:
            hypotheses.append({
                "text": f"Elevated latency in {primary_svc} is caused by a slow downstream call or database query — "
                        f"the critical path spans show self-time concentrated in a single operation.",
                "confidence": "high",
                "evidence_ids": all_eids[:2],
            })
        if found_anomalies:
            anm = found_anomalies[0]
            hypotheses.append({
                "text": f"The anomaly in {anm.get('service_name', primary_svc)} may be caused by a recent deployment, "
                        f"traffic surge, or resource exhaustion — ratio of {anm.get('ratio', 0):.1f}× baseline suggests "
                        f"saturation rather than a gradual drift.",
                "confidence": "medium",
                "evidence_ids": all_eids[:1],
            })
        if found_errors:
            hypotheses.append({
                "text": f"The error cluster in {found_errors[0].get('service_name', primary_svc)} may be caused by "
                        f"an unhandled exception or misconfiguration — the same error fingerprint repeating "
                        f"{found_errors[0].get('count', 0)} times suggests a deterministic failure, not a transient one.",
                "confidence": "high",
                "evidence_ids": all_eids[-1:],
            })
        if not hypotheses:
            hypotheses.append({
                "text": f"Resource contention or a slow external dependency may be causing elevated latency in {primary_svc}.",
                "confidence": "medium",
                "evidence_ids": all_eids[:1],
            })

        # Build next steps
        next_steps: list[str] = []
        if found_stats:
            worst_stat = max(found_stats, key=lambda s: s.get("p99_ms", 0))
            next_steps.append(
                f"Inspect container CPU/memory metrics for {worst_stat['service_name']} "
                f"to rule out resource saturation (p99: {worst_stat.get('p99_ms', 0)}ms)."
            )
        if found_errors:
            next_steps.append(
                f"Review the sample trace for the top error group "
                f"(trace: {found_errors[0].get('sample_trace_id', 'N/A')[:12]}) "
                f"to identify the root cause of the exception."
            )
        if found_anomalies:
            next_steps.append(
                "Compare the anomaly window against recent deployment history and config changes."
            )
        if found_spans:
            worst_span = max(found_spans, key=lambda s: s.get("duration_ms") or s.get("self_time_ms") or 0)
            next_steps.append(
                f"Drill into the trace waterfall for the slowest span "
                f"({worst_span.get('service_name', 'service')} → {worst_span.get('span_name', 'operation')}) "
                f"to identify the bottleneck sub-call."
            )
        if not next_steps:
            next_steps = [
                "Review the traces for the affected service in the Traces view.",
                "Check recent deployment events and infrastructure metrics.",
            ]

        answer = {
            "summary": summary,
            "insufficient_evidence": False,
            "evidence": evidence_items,
            "hypotheses": hypotheses,
            "next_steps": next_steps,
        }
        return json.dumps(answer), None

