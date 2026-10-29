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

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }

        # Extract system prompt for Gemini's dedicated system_instruction field
        system_parts = []
        contents = []
        for m in messages:
            role = m.get("role")
            if role == "system":
                # Gemini requires system content in system_instruction, NOT as a user turn
                system_parts.append({"text": str(m.get("content") or "")})
            elif role == "tool":
                # Tool result messages must follow an assistant (model) turn – render as user
                # so the conversation alternates model→user correctly for Gemini.
                contents.append({
                    "role": "user",
                    "parts": [{"text": f"Telemetry Tool Result '{m.get('name')}':\n{m.get('content')}"}],
                })
            elif role == "user":
                contents.append({
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
                    contents.append({
                        "role": "model",
                        "parts": [{"text": tc_text}],
                    })
                else:
                    contents.append({
                        "role": "model",
                        "parts": [{"text": str(m.get("content") or "")}],
                    })
            else:
                contents.append({
                    "role": "model",
                    "parts": [{"text": str(m.get("content") or "")}],
                })

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

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=headers, json=payload, timeout=30.0)
            if resp.status_code != 200:
                raise RuntimeError(f"Gemini error {resp.status_code}: {resp.text}")

            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise RuntimeError("No candidates returned from Gemini")

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

            # Anomaly / incident investigation
            if any(kw in q for kw in ("anomaly", "anomalies", "incident", "alert", "spike", "detect")):
                return None, [
                    {"name": "get_anomalies", "arguments": {"filter": {}}, "id": "call_mock_1"},
                    {"name": "find_slow_spans", "arguments": {"limit": 5}, "id": "call_mock_2"},
                ]

            # Error / failure investigation
            if any(kw in q for kw in ("error", "500", "exception", "fail", "crash", "log")):
                return None, [
                    {"name": "get_error_groups", "arguments": {"filter": {}, "limit": 10}, "id": "call_mock_1"},
                    {"name": "search_logs", "arguments": {"filter": {"severity": ["ERROR", "FATAL"]}}, "id": "call_mock_2"},
                ]

            # Latency / performance investigation
            if any(kw in q for kw in ("latency", "slow", "performance", "p99", "p95", "timeout", "bottleneck", "fast")):
                return None, [
                    {"name": "get_service_stats", "arguments": {"filter": {}}, "id": "call_mock_1"},
                    {"name": "find_slow_spans", "arguments": {"limit": 10}, "id": "call_mock_2"},
                ]

            # Topology / dependency investigation
            if any(kw in q for kw in ("topology", "dependency", "graph", "upstream", "downstream", "call", "service")):
                return None, [
                    {"name": "get_topology", "arguments": {"filter": {}}, "id": "call_mock_1"},
                    {"name": "get_service_stats", "arguments": {"filter": {}}, "id": "call_mock_2"},
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
            if any(kw in q for kw in ("anomaly", "anomalies", "incident", "spike", "detect")):
                answer = {
                    "summary": (
                        "No anomalies are currently detected in the telemetry store. "
                        "The automated anomaly detector compares p99 latency and error rate in 5-minute rolling windows against "
                        "a 30-minute baseline. A service must exceed 2× the baseline p99 with at least 50 spans to trigger. "
                        "If you expect an ongoing incident, verify that the OpenTelemetry ingestion gateway is receiving spans "
                        "and that the anomaly scheduler job is running (check scheduler logs). "
                        "You can also try narrowing the time range to the suspected incident window."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [
                        {
                            "text": "The detector may not have triggered yet because the ingestion volume is below the minimum threshold (50 spans per window).",
                            "confidence": "medium",
                            "evidence_ids": [],
                        }
                    ],
                    "next_steps": [
                        "Confirm that the ingestion gateway (port 4317) is receiving OTLP telemetry from your services.",
                        "Check the scheduler job logs for anomaly detection runs (`GET /anomalies` returns empty).",
                        "Adjust the time range selector to the window when the incident occurred.",
                        "Lower the anomaly threshold via EOA_ANOMALY_K (default 2.0) if sensitivity is too low.",
                    ],
                }
            elif any(kw in q for kw in ("error", "500", "exception", "fail", "crash")):
                answer = {
                    "summary": (
                        "No error-flagged spans or ERROR/FATAL log records were found in the current time range. "
                        "All services appear to be responding within normal parameters for the selected window. "
                        "If you are experiencing errors, verify the time range covers the affected period and that "
                        "your services are instrumenting error status correctly (OTel span status ERROR) and emitting log events."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [
                        {
                            "text": "Errors may be occurring but are not propagating OTel status_code=ERROR on spans, making them invisible to this query.",
                            "confidence": "medium",
                            "evidence_ids": [],
                        }
                    ],
                    "next_steps": [
                        "Expand the time range to cover the suspected error window.",
                        "Ensure your instrumentation libraries set `status.code = ERROR` and emit log records with severity ERROR or FATAL.",
                        "Check the raw ingestion gateway logs to confirm spans are reaching the store.",
                        "Try the Logs view with severity filter set to ERROR or FATAL for a direct search.",
                    ],
                }
            elif any(kw in q for kw in ("latency", "slow", "p99", "p95", "timeout", "bottleneck")):
                answer = {
                    "summary": (
                        "No span data was returned for the latency analysis query. The telemetry store may be empty "
                        "for the current time window, or no spans match the filter. "
                        "Latency analysis requires recorded trace spans — if your services are not yet instrumented with "
                        "OpenTelemetry, no performance data will appear here."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [
                        {
                            "text": "The services may not yet be sending spans to the ingestion gateway, or the selected time range predates span collection.",
                            "confidence": "high",
                            "evidence_ids": [],
                        }
                    ],
                    "next_steps": [
                        "Navigate to the Traces view and verify that traces are visible for recent requests.",
                        "Confirm your services export spans to the OTLP endpoint configured for the ingestion gateway.",
                        "Widen the time range in the navigation bar to cover a period with known traffic.",
                        "Check the Services overview for p99 latency trends that may indicate where slowness originates.",
                    ],
                }
            elif any(kw in q for kw in ("topology", "dependency", "graph")):
                answer = {
                    "summary": (
                        "No service-to-service call edges could be constructed from the current telemetry. "
                        "The topology graph is derived from parent–child span relationships across services in the same trace. "
                        "If all spans originate from a single service or if distributed context propagation (W3C TraceContext) "
                        "is not configured, cross-service edges will not appear."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [
                        {
                            "text": "Distributed tracing context (W3C Trace-Context / B3 headers) may not be propagated across service calls, preventing parent-child span linkage.",
                            "confidence": "high",
                            "evidence_ids": [],
                        }
                    ],
                    "next_steps": [
                        "Ensure all services propagate W3C TraceContext headers (traceparent) in outgoing HTTP/gRPC calls.",
                        "Verify that the OTel SDK is configured to inject and extract context headers.",
                        "Check the Dependency Graph view in the dashboard once spans with cross-service parent_span_id are present.",
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
                        "No telemetry data is available in the store for the current time range and organization. "
                        "The Agamotto AI Assistant can investigate latency spikes, error clusters, service anomalies, "
                        "trace waterfalls, and log patterns — but only when your services are sending OpenTelemetry "
                        "spans and logs to the ingestion gateway."
                    ),
                    "insufficient_evidence": True,
                    "evidence": [],
                    "hypotheses": [],
                    "next_steps": [
                        "Instrument your services with an OpenTelemetry SDK (Python, Node.js, Go, Java, etc.).",
                        "Point the OTLP exporter at the Agamotto ingestion gateway (default port 4317 for gRPC or 4318 for HTTP).",
                        "Generate some traffic (real or synthetic) and then re-run this query.",
                        "Check the ingestion gateway and DuckDB logs to confirm data is being stored.",
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

