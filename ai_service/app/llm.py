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

        contents = []
        for m in messages:
            role = m.get("role")
            if role == "tool":
                contents.append({
                    "role": "user",
                    "parts": [{"text": f"Telemetry Tool Result '{m.get('name')}':\n{m.get('content')}"}],
                })
            elif role in ("user", "system"):
                contents.append({
                    "role": "user",
                    "parts": [{"text": str(m.get("content") or "")}],
                })
            else:
                contents.append({
                    "role": "model",
                    "parts": [{"text": str(m.get("content") or "")}],
                })

        payload: dict[str, Any] = {"contents": contents}

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
        Deterministic, realistic mock agent behavior:
        1. On the first turn, inspects user query/context and calls relevant MCP tools
           (e.g. get_trace, get_anomalies, find_slow_spans, search_logs).
        2. On subsequent turn (after receiving tool results), generates a valid AiAnswer JSON
           referencing verified IDs from tool results.
        """
        tool_results = [m for m in messages if m.get("role") == "tool"]

        # Turn 1: If no tool results yet and tools are available, make an investigation tool call
        if not tool_results and tools and not force_answer:
            last_user_msg = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")

            # If an anomaly is mentioned
            if "anomaly" in last_user_msg.lower():
                return None, [{
                    "name": "get_anomalies",
                    "arguments": {"filter": {}},
                    "id": "call_mock_1",
                }]

            # If a trace_id is mentioned
            trace_match = re.search(r"\b([a-f0-9]{32})\b", last_user_msg)
            if trace_match:
                return None, [{
                    "name": "get_trace",
                    "arguments": {"trace_id": trace_match.group(1)},
                    "id": "call_mock_1",
                }]

            # If log errors are mentioned
            if "error" in last_user_msg.lower() or "log" in last_user_msg.lower():
                return None, [{
                    "name": "search_logs",
                    "arguments": {"filter": {"severity": ["ERROR", "FATAL"]}},
                    "id": "call_mock_1",
                }]

            # Default: find slow spans
            return None, [{
                "name": "find_slow_spans",
                "arguments": {"limit": 5},
                "id": "call_mock_1",
            }]

        # Turn 2: Synthesize AiAnswer from tool results or preloaded messages
        evidence_items: list[dict] = []
        found_spans: list[tuple[str, str, str, str]] = []  # (span_id, service_name, span_name, trace_id)
        found_logs: list[tuple[str, str, str, str, str]] = []  # (log_id, body, service_name, trace_id, span_id)

        sources_to_inspect = list(tool_results)
        # Also inspect preloaded context in user message if present
        for m in messages:
            if m.get("role") == "user" and "Pre-loaded Telemetry Context" in str(m.get("content")):
                content_str = str(m.get("content"))
                # Extract json chunks
                json_matches = re.findall(r'(\{(?:[^{}]|(?R))*\})', content_str) if hasattr(re, 'R') else re.findall(r'(\{[^{}]+\})', content_str)
                for jm in json_matches:
                    sources_to_inspect.append({"role": "tool", "content": jm})

        for m in sources_to_inspect:
            c = m.get("content", "")
            if not c:
                continue
            try:
                data = json.loads(c)
                if isinstance(data, dict):
                    t_id = data.get("trace_id", "")
                    if "spans" in data and isinstance(data["spans"], list):
                        for sp in data["spans"]:
                            if isinstance(sp, dict) and sp.get("span_id"):
                                found_spans.append((
                                    sp.get("span_id"),
                                    sp.get("service_name") or "service",
                                    sp.get("span_name") or "operation",
                                    t_id or sp.get("trace_id") or "trace_1",
                                ))
                    if "anomalies" in data and isinstance(data["anomalies"], list):
                        for anm in data["anomalies"]:
                            if isinstance(anm, dict):
                                for susp in anm.get("suspects", []):
                                    if isinstance(susp, dict) and susp.get("span_id"):
                                        found_spans.append((
                                            susp.get("span_id"),
                                            susp.get("service_name") or anm.get("service_name", "service"),
                                            susp.get("span_name") or "operation",
                                            susp.get("trace_id") or "trace_1",
                                        ))
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            if item.get("span_id"):
                                found_spans.append((
                                    item.get("span_id"),
                                    item.get("service_name") or "service",
                                    item.get("span_name") or "operation",
                                    item.get("trace_id") or "trace_1",
                                ))
                            elif item.get("log_id"):
                                found_logs.append((
                                    item.get("log_id"),
                                    item.get("body") or "Error logged",
                                    item.get("service_name") or "service",
                                    item.get("trace_id") or "",
                                    item.get("span_id") or "",
                                ))
            except Exception:
                # Fallback regex extraction if raw json parsing fails
                raw_spans = re.findall(r'"span_id":\s*"([^"]+)"[^{}]*?"service_name":\s*"([^"]+)"[^{}]*?"span_name":\s*"([^"]+)"', str(c))
                for s_id, s_svc, s_name in raw_spans:
                    found_spans.append((s_id, s_svc, s_name, "trace_1"))
                raw_logs = re.findall(r'"log_id":\s*"([^"]+)"[^{}]*?"body":\s*"([^"]+)"', str(c))
                for l_id, l_body in raw_logs:
                    found_logs.append((l_id, l_body, "service", "", ""))

        ev_idx = 1
        seen_spans = set()
        seen_logs = set()

        for s_id, s_svc, s_name, t_id in found_spans[:3]:
            if s_id in seen_spans:
                continue
            seen_spans.add(s_id)
            eid = f"ev{ev_idx}"
            ev_idx += 1
            evidence_items.append({
                "evidence_id": eid,
                "kind": "span",
                "trace_id": t_id,
                "span_id": s_id,
                "label": f"{s_svc} {s_name}",
            })

        for l_id, l_body, l_svc, t_id, s_id in found_logs[:2]:
            if l_id in seen_logs:
                continue
            seen_logs.add(l_id)
            eid = f"ev{ev_idx}"
            ev_idx += 1
            evidence_items.append({
                "evidence_id": eid,
                "kind": "log",
                "log_id": l_id,
                "trace_id": t_id or None,
                "span_id": s_id or None,
                "label": l_body[:60],
            })

        if not evidence_items:
            answer = {
                "summary": "Insufficient telemetry evidence available in the store to verify this diagnosis. No verified spans or logs could support the investigation.",
                "insufficient_evidence": True,
                "evidence": [],
                "hypotheses": [],
                "next_steps": [
                    "Verify OpenTelemetry ingestion gateway is receiving spans and logs.",
                    "Check time range filter in the top navigation bar.",
                ],
            }
        else:
            primary_svc = found_spans[0][1] if found_spans else (found_logs[0][2] if found_logs else "service")
            all_eids = [e["evidence_id"] for e in evidence_items]

            answer = {
                "summary": f"Identified elevated latency and failure bottleneck in the {primary_svc} service.",
                "insufficient_evidence": False,
                "evidence": evidence_items,
                "hypotheses": [
                    {
                        "text": f"Downstream service saturation or resource exhaustion inside {primary_svc}.",
                        "confidence": "high",
                        "evidence_ids": all_eids[:2],
                    }
                ],
                "next_steps": [
                    f"Inspect container metrics and connection pool saturation for {primary_svc}.",
                    "Review recent deployment event markers and configuration changes.",
                ],
            }

        return json.dumps(answer), None
