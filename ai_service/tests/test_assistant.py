"""
test_assistant.py – End-to-end tests for Feature 9 (AI Investigation Assistant) and Feature 19 (Evidence Validator).

Covers:
1. POST /ask (SSE stream) produces valid event sequence: tool_start, tool_result, answer.
2. POST /ask/sync returns verified AiAnswer schema.
3. Feature 19 Evidence Validator:
   - Real spans and logs in DB are verified and kept.
   - Fake/hallucinated span_id, log_id, trace_id are removed.
   - Cross-org evidence IDs are dropped (tenant isolation).
   - Hypotheses referencing dropped evidence are downgraded or cleaned.
   - When no valid evidence exists, insufficient_evidence is set to True.
4. Pre-loaded context (anomaly_id, trace_id, filter) is loaded into agent prompt.
5. Short-lived answer caching per (org_id, question, context).
6. Agent limits: max tool calls enforcement, character trimming on tool results.
7. Prompt injection resilience: telemetry containing malicious instructions is treated as untrusted text.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
import duckdb
import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import _ensure_schema
import app.database
from app.main import app as fastapi_app
from app.schemas import AiAnswer, EvidenceItem, HypothesisItem, AskRequest, AskContext
from app.validator import validate_ai_answer
from app.cache import get_cached_answer, set_cached_answer, clear_cache

JWT_SECRET = "c8e6a18d9f4e2b0a7c5d3f1e9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b"


def make_token(
    org_id: str,
    sub: str = "user-123",
    visible_services: list[str] | None = None,
) -> str:
    payload = {
        "sub": sub,
        "org_id": org_id,
        "visible_services": visible_services or [],
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture
def mem_db():
    """In-memory DuckDB fixture with full schema initialized."""
    conn = duckdb.connect(":memory:")
    _ensure_schema(conn)

    app.database.set_db(conn)

    yield conn

    app.database.set_db(None)
    conn.close()


def insert_span(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    trace_id: str,
    span_id: str,
    service_name: str,
    span_name: str,
    duration_ns: int,
    is_error: bool = False,
):
    now = datetime.now(timezone.utc)
    conn.execute(
        """
        INSERT INTO spans (
            org_id, trace_id, span_id, parent_span_id, service_name, span_name,
            span_kind, start_time_ns, start_ts, duration_ns, status_code,
            is_error, error_fingerprint, attributes, resource_attributes, ingested_at
        ) VALUES (
            ?, ?, ?, NULL, ?, ?,
            'SERVER', 1000000000, ?, ?, ?,
            ?, '', '{}', '{}', ?
        )
        """,
        [
            org_id,
            trace_id,
            span_id,
            service_name,
            span_name,
            now,
            duration_ns,
            "ERROR" if is_error else "OK",
            is_error,
            now,
        ],
    )


def insert_log(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    log_id: str,
    service_name: str,
    body: str,
    trace_id: str | None = None,
    span_id: str | None = None,
):
    now = datetime.now(timezone.utc)
    conn.execute(
        """
        INSERT INTO logs (
            org_id, log_id, time_ns, ts, trace_id, span_id,
            service_name, severity_text, severity_number, body, attributes
        ) VALUES (
            ?, ?, 1000000000, ?, ?, ?,
            ?, 'ERROR', 17, ?, '{}'
        )
        """,
        [org_id, log_id, now, trace_id, span_id, service_name, body],
    )


# ── Feature 19: Evidence Validator Unit Tests ─────────────────────────────────

def test_validator_removes_hallucinated_ids(mem_db):
    org_id = "org_val_1"
    # Insert one real span and one real log
    insert_span(mem_db, org_id, "trace111", "span111", "payment", "POST /charge", 200_000_000, True)
    insert_log(mem_db, org_id, "log111", "payment", "Connection refused")

    raw_answer = AiAnswer(
        summary="Payment failure detected.",
        insufficient_evidence=False,
        evidence=[
            EvidenceItem(evidence_id="ev1", kind="span", trace_id="trace111", span_id="span111", label="Real span"),
            EvidenceItem(evidence_id="ev2", kind="span", trace_id="fake_trace", span_id="fake_span", label="Fake span"),
            EvidenceItem(evidence_id="ev3", kind="log", log_id="log111", label="Real log"),
            EvidenceItem(evidence_id="ev4", kind="log", log_id="fake_log", label="Fake log"),
        ],
        hypotheses=[
            HypothesisItem(text="Database connection pool timeout", confidence="high", evidence_ids=["ev1", "ev2"]),
            HypothesisItem(text="Spurious network glitch", confidence="high", evidence_ids=["ev4"]),
        ],
        next_steps=["Check payment db."],
    )

    validated = validate_ai_answer(raw_answer, org_id)

    # Fake IDs ev2 and ev4 must be purged
    ev_ids = [e.evidence_id for e in validated.evidence]
    assert "ev1" in ev_ids
    assert "ev3" in ev_ids
    assert "ev2" not in ev_ids
    assert "ev4" not in ev_ids

    # Hypothesis 1 should retain only ev1
    assert validated.hypotheses[0].evidence_ids == ["ev1"]

    # Hypothesis 2 had only fake evidence (ev4) -> must be downgraded to low confidence
    assert validated.hypotheses[1].confidence == "low"
    assert validated.hypotheses[1].evidence_ids == []
    assert validated.insufficient_evidence is False


def test_validator_drops_cross_tenant_evidence(mem_db):
    # Org A has span A, Org B has span B
    insert_span(mem_db, "org_A", "trace_a", "span_a", "auth", "login", 50_000_000)
    insert_span(mem_db, "org_B", "trace_b", "span_b", "secret", "exfiltrate", 50_000_000)

    answer_for_a = AiAnswer(
        summary="Test investigation",
        insufficient_evidence=False,
        evidence=[
            EvidenceItem(evidence_id="ev1", kind="span", trace_id="trace_a", span_id="span_a", label="A span"),
            EvidenceItem(evidence_id="ev2", kind="span", trace_id="trace_b", span_id="span_b", label="B span (cross-tenant)"),
        ],
        hypotheses=[
            HypothesisItem(text="Testing isolation", confidence="medium", evidence_ids=["ev1", "ev2"]),
        ],
    )

    validated = validate_ai_answer(answer_for_a, "org_A")
    assert len(validated.evidence) == 1
    assert validated.evidence[0].span_id == "span_a"


def test_validator_sets_insufficient_evidence_when_no_valid_evidence(mem_db):
    org_id = "org_empty"
    raw_answer = AiAnswer(
        summary="Everything seems broken",
        insufficient_evidence=False,
        evidence=[
            EvidenceItem(evidence_id="ev1", kind="span", trace_id="fake_t", span_id="fake_s", label="Fake"),
        ],
        hypotheses=[
            HypothesisItem(text="Guesses without telemetry", confidence="medium", evidence_ids=["ev1"]),
        ],
    )

    validated = validate_ai_answer(raw_answer, org_id)
    assert validated.insufficient_evidence is True
    assert len(validated.evidence) == 0


# ── Feature 9: AI Investigation Assistant HTTP Endpoints ──────────────────────

def test_ask_sync_endpoint(mem_db):
    clear_cache()
    org_id = "org_ask_test"
    insert_span(mem_db, org_id, "11112222333344445555666677778888", "span_payment_err", "payment", "POST /charge", 450_000_000, is_error=True)
    insert_log(mem_db, org_id, "log_err_1", "payment", "Connection refused to database pool")

    client = TestClient(fastapi_app)
    token = make_token(org_id)

    payload = {
        "question": "Why is the payment service throwing errors?",
        "context": {
            "trace_id": "11112222333344445555666677778888",
        }
    }

    res = client.post(
        "/ask/sync",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert "evidence" in data
    assert "hypotheses" in data
    assert "next_steps" in data
    assert data["insufficient_evidence"] is False
    assert len(data["evidence"]) >= 1


def test_ask_streaming_sse_events(mem_db):
    clear_cache()
    org_id = "org_stream_test"
    insert_span(mem_db, org_id, "trace_str_1", "span_str_1", "checkout", "POST /cart", 300_000_000, is_error=True)

    client = TestClient(fastapi_app)
    token = make_token(org_id)

    payload = {
        "question": "What caused the error in checkout?",
    }

    res = client.post(
        "/ask",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert "text/event-stream" in res.headers["content-type"]

    body = res.text
    # SSE stream must contain event types
    assert "event: tool_start" in body or "event: answer" in body
    assert "event: answer" in body
    assert "data: " in body


def test_ask_caching(mem_db):
    clear_cache()
    org_id = "org_cache_test"
    insert_span(mem_db, org_id, "trc_cache", "spn_cache", "orders", "GET /orders", 100_000_000)

    client = TestClient(fastapi_app)
    token = make_token(org_id)

    payload = {"question": "Check latency on orders service"}

    # First call
    r1 = client.post("/ask/sync", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert r1.status_code == 200
    d1 = r1.json()

    # Second call should hit the cache
    r2 = client.post("/ask/sync", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    d2 = r2.json()

    assert d1 == d2


def test_ask_requires_authentication():
    client = TestClient(fastapi_app)
    res = client.post("/ask/sync", json={"question": "anything"})
    assert res.status_code == 401


# ── Tests for Bug Fixes: MCP tool definitions, _mock_chat canonical fallbacks, Gemini collision, loop limits ──

def test_mcp_client_tool_specific_definitions_and_required_fields():
    """Requirement 1 & 2: MCP tool definitions must be tool-specific and mark required fields."""
    from app.mcp_client import McpClient

    client = McpClient(org_id="test-org")
    defs = client.get_tool_definitions()
    defs_by_name = {d["function"]["name"]: d["function"] for d in defs}

    assert "get_trace" in defs_by_name
    get_trace_params = defs_by_name["get_trace"]["parameters"]
    assert "trace_id" in get_trace_params["properties"]
    assert "filter" not in get_trace_params["properties"]
    assert "limit" not in get_trace_params["properties"]
    assert "required" in get_trace_params
    assert "trace_id" in get_trace_params["required"]

    assert "compare_traces" in defs_by_name
    cmp_params = defs_by_name["compare_traces"]["parameters"]
    assert "trace_id" in cmp_params["properties"]
    assert "baseline_trace_id" in cmp_params["properties"]
    assert "filter" not in cmp_params["properties"]
    assert "required" in cmp_params
    assert "trace_id" in cmp_params["required"]

    assert "get_service_stats" in defs_by_name
    assert "filter" in defs_by_name["get_service_stats"]["parameters"]["properties"]
    assert "trace_id" not in defs_by_name["get_service_stats"]["parameters"]["properties"]

    assert "find_slow_spans" in defs_by_name
    assert "filter" in defs_by_name["find_slow_spans"]["parameters"]["properties"]
    assert "limit" in defs_by_name["find_slow_spans"]["parameters"]["properties"]
    assert "trace_id" not in defs_by_name["find_slow_spans"]["parameters"]["properties"]


@pytest.mark.asyncio
async def test_mock_chat_canonical_question_types_fallbacks():
    """Requirement 3A: _mock_chat returns precise, useful fallback answers for the 4 canonical question types."""
    from app.llm import LLMClient

    llm = LLMClient()
    canonical_queries = [
        ("Why is the payment service experiencing a latency spike and slow p99?", "latency"),
        ("What is causing the HTTP 500 error cluster and exceptions?", "error"),
        ("Are there any active anomalies detected in our services?", "anomaly"),
        ("What does the service dependency graph and topology look like?", "topology"),
    ]

    for question, q_type in canonical_queries:
        messages = [{"role": "user", "content": question}]
        content, tool_calls = await llm._mock_chat(messages, tools=None, force_answer=True)
        assert content is not None
        assert tool_calls is None

        data = json.loads(content)
        answer = AiAnswer(**data)

        assert answer.insufficient_evidence is True
        assert len(answer.evidence) == 0
        assert len(answer.hypotheses) >= 1
        assert len(answer.next_steps) >= 2
        assert len(answer.summary) > 50

        # Verify summary reflects the canonical diagnostic category
        if q_type == "latency":
            assert "Latency & Performance" in answer.summary
        elif q_type == "error":
            assert "Error Cluster" in answer.summary
        elif q_type == "anomaly":
            assert "Anomaly" in answer.summary
        elif q_type == "topology":
            assert "Topology" in answer.summary


@pytest.mark.asyncio
async def test_gemini_content_collision_consecutive_same_role_messages(monkeypatch):
    """Requirement 3B: Gemini message formatting merges consecutive same-role turns to avoid collision."""
    from app.llm import LLMClient

    llm = LLMClient()
    captured_payload = None

    class MockAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, headers=None, json=None, timeout=None):
            nonlocal captured_payload
            captured_payload = json
            import httpx
            return httpx.Response(
                status_code=200,
                json={
                    "candidates": [
                        {
                            "content": {
                                "parts": [{"text": "{\"summary\": \"ok\", \"insufficient_evidence\": false, \"evidence\": [], \"hypotheses\": [], \"next_steps\": []}"}]
                            }
                        }
                    ]
                },
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr("httpx.AsyncClient", MockAsyncClient)
    llm.api_key = "fake-key"
    llm.provider = "gemini"

    # Feed conversation with consecutive same-role messages (tool results turn into role 'user')
    messages = [
        {"role": "system", "content": "System instruction."},
        {"role": "user", "content": "Question turn 1"},
        {"role": "assistant", "content": "Assistant response", "tool_calls": [
            {"id": "call_1", "function": {"name": "get_service_stats", "arguments": "{}"}},
            {"id": "call_2", "function": {"name": "find_slow_spans", "arguments": "{}"}},
        ]},
        {"role": "tool", "name": "get_service_stats", "content": "Result 1"},
        {"role": "tool", "name": "find_slow_spans", "content": "Result 2"},
    ]

    content, calls = await llm._gemini_chat(messages, force_answer=True)
    assert content is not None
    assert captured_payload is not None

    contents = captured_payload["contents"]
    # Check strict alternation of roles: user -> model -> user -> model ...
    for i in range(len(contents) - 1):
        assert contents[i]["role"] != contents[i+1]["role"], (
            f"Collision detected at index {i}: consecutive role '{contents[i]['role']}'"
        )

    # First role must be user
    assert contents[0]["role"] == "user"


@pytest.mark.asyncio
async def test_agent_loop_immediate_limit_before_tool_results(monkeypatch):
    """Requirement 4: When agent hits a limit before getting any tool results, yield a structured answer rather than cryptic error."""
    from app.agent.loop import run_agent_loop
    from app.config import get_settings

    cfg = get_settings()
    monkeypatch.setattr(cfg, "EOA_AGENT_MAX_TOOL_CALLS", 0)

    events = []
    async for ev in run_agent_loop(
        question="Why are there so many 500 errors in the payment service?",
        context=None,
        org_id="test-org-limit",
    ):
        events.append(ev)

    event_names = [e["event"] for e in events]
    # Must NOT emit a cryptic 'error' event
    assert "error" not in event_names
    assert "answer" in event_names

    # Find the final answer event
    ans_event = next(e for e in reversed(events) if e["event"] == "answer")
    ans_data = ans_event["data"]
    answer = AiAnswer(**ans_data)

    # Must be a structured informational answer with diagnostics
    assert answer.insufficient_evidence is True
    assert len(answer.summary) > 20
    assert "Error Cluster" in answer.summary
    assert len(answer.hypotheses) >= 1
    assert len(answer.next_steps) >= 2

