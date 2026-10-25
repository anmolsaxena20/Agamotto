"""
Unit and Integration Tests for Feature 7: Automated Root-Cause Correlation.

Covers all test suites from Section 11 of the specification:
  A. Baseline tests
  B. Detection tests
  C. Suspect ranking tests
  D. Lifecycle tests
  E. API and security tests
  F. Scheduler tests
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
import uuid

import duckdb
import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import _ensure_schema
from app.anomaly.baseline import compute_current_windows, compute_baseline
from app.anomaly.suspects import _merge_intervals, rank_suspects
from app.anomaly.detector import run_detection_cycle, _get_open_anomaly
from app.main import app as fastapi_app

JWT_SECRET = "c8e6a18d9f4e2b0a7c5d3f1e9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b"


def make_token(org_id: str, sub: str = "user-123", visible_services: list[str] | None = None) -> str:
    payload = {
        "sub": sub,
        "org_id": org_id,
        "visible_services": visible_services or [],
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture
def mem_db():
    """In-memory DuckDB fixture with schema initialized."""
    conn = duckdb.connect(":memory:")
    _ensure_schema(conn)
    yield conn
    conn.close()


def insert_span(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    service_name: str,
    span_name: str,
    start_ts: datetime,
    duration_ns: int,
    is_error: bool = False,
    trace_id: str | None = None,
    span_id: str | None = None,
    parent_span_id: str | None = None,
):
    if trace_id is None:
        trace_id = uuid.uuid4().hex
    if span_id is None:
        span_id = uuid.uuid4().hex[:16]
    start_time_ns = int(start_ts.timestamp() * 1_000_000_000)

    conn.execute(
        """
        INSERT INTO spans (
            org_id, trace_id, span_id, parent_span_id,
            service_name, span_name, span_kind,
            start_time_ns, start_ts, duration_ns,
            status_code, is_error
        ) VALUES (?, ?, ?, ?, ?, ?, 'SERVER', ?, ?, ?, ?, ?)
        """,
        [
            org_id,
            trace_id,
            span_id,
            parent_span_id,
            service_name,
            span_name,
            start_time_ns,
            start_ts.strftime("%Y-%m-%d %H:%M:%S.%f"),
            duration_ns,
            "ERROR" if is_error else "OK",
            is_error,
        ],
    )
    return span_id, trace_id


# ==============================================================================
# Suite A: Baseline Tests
# ==============================================================================

def test_baseline_empty_data(mem_db):
    """Empty data should yield bucket_count=0 and 0 baseline."""
    base = compute_baseline(mem_db, "org-1", "payment-service")
    assert base.bucket_count == 0
    assert base.baseline_p99_ns == 0.0
    assert base.baseline_error_rate == 0.0


def test_baseline_calculation(mem_db):
    """30-minute historical window split into 1-minute buckets should compute median p99."""
    now = datetime.now(timezone.utc)
    # Insert spans over 10 different minutes in the baseline window (between now - 35m and now - 5m)
    for minute_offset in range(6, 16):
        bucket_ts = now - timedelta(minutes=minute_offset)
        # In each minute bucket, insert 10 spans with latencies 10ms..100ms
        for i in range(1, 11):
            insert_span(
                mem_db,
                "org-1",
                "payment-service",
                "POST /charge",
                bucket_ts + timedelta(seconds=i * 2),
                duration_ns=i * 10_000_000,  # 10ms to 100ms
                is_error=(i == 10),  # 10% error
            )

    base = compute_baseline(mem_db, "org-1", "payment-service", now=now)
    assert base.bucket_count >= 10
    # Expected p99 for 10ms..100ms is ~99ms (99_000_000 ns)
    assert 85_000_000 <= base.baseline_p99_ns <= 105_000_000
    assert 0.08 <= base.baseline_error_rate <= 0.12


def test_baseline_excludes_open_anomalies(mem_db):
    """Buckets overlapping an open anomaly must be excluded from baseline computation."""
    now = datetime.now(timezone.utc)
    # Open anomaly covers now - 15m to now - 10m
    mem_db.execute(
        """
        INSERT INTO anomalies (
            org_id, anomaly_id, service_name, window_start, window_end,
            p99_ns, baseline_p99_ns, ratio, error_rate, baseline_error_rate,
            status, suspects, detected_at, updated_at
        ) VALUES (
            'org-1', 'anm_open1', 'payment-service',
            ?, ?,
            500000000, 100000000, 5.0, 0.5, 0.01,
            'open', '[]', ?, ?
        )
        """,
        [
            (now - timedelta(minutes=15)).strftime("%Y-%m-%d %H:%M:%S.%f"),
            (now - timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S.%f"),
            now.strftime("%Y-%m-%d %H:%M:%S.%f"),
            now.strftime("%Y-%m-%d %H:%M:%S.%f"),
        ],
    )

    # Insert an extreme outlier span during the open anomaly window
    insert_span(
        mem_db,
        "org-1",
        "payment-service",
        "POST /charge",
        now - timedelta(minutes=12),
        duration_ns=10_000_000_000,  # 10 seconds!
        is_error=True,
    )

    # Insert normal spans outside the anomaly window (e.g. now - 25m)
    for i in range(1, 15):
        insert_span(
            mem_db,
            "org-1",
            "payment-service",
            "POST /charge",
            now - timedelta(minutes=25) + timedelta(seconds=i * 2),
            duration_ns=50_000_000,  # 50ms
            is_error=False,
        )

    base = compute_baseline(mem_db, "org-1", "payment-service", now=now)
    # The 10-second outlier inside the open anomaly must have been excluded!
    assert base.baseline_p99_ns < 100_000_000


# ==============================================================================
# Suite B: Detection Tests
# ==============================================================================

def test_detection_triggers_on_high_latency_and_error(mem_db):
    """When both p99 > k*baseline AND error_rate > baseline_error + margin, anomaly triggers."""
    now = datetime.now(timezone.utc)
    # 1. Seed baseline (now - 20m)
    for m in range(7, 17):
        for s in range(5):
            insert_span(
                mem_db,
                "org-1",
                "payment-service",
                "POST /charge",
                now - timedelta(minutes=m, seconds=s * 10),
                duration_ns=50_000_000,  # 50ms
                is_error=False,
            )

    # 2. Seed current evaluation window (now - 4m to now) with 60 spans, spiked p99 (300ms) and 15% errors
    for i in range(60):
        insert_span(
            mem_db,
            "org-1",
            "payment-service",
            "POST /charge",
            now - timedelta(minutes=2, seconds=i * 2),
            duration_ns=300_000_000 if i >= 50 else 60_000_000,  # p99 will spike to ~300ms
            is_error=(i % 5 == 0),  # 20% error rate
        )

    res = run_detection_cycle(mem_db)
    assert res.get("opened", 0) == 1

    anm = _get_open_anomaly(mem_db, "org-1", "payment-service")
    assert anm is not None
    assert anm["status"] == "open"
    assert anm["ratio"] >= 2.0
    assert anm["error_rate"] >= 0.10


def test_detection_not_triggered_by_latency_alone(mem_db):
    """High latency alone without elevated errors must NOT trigger an anomaly."""
    now = datetime.now(timezone.utc)
    # Seed baseline (50ms, 0 errors)
    for m in range(7, 17):
        for s in range(5):
            insert_span(
                mem_db, "org-1", "order-service", "GET /order",
                now - timedelta(minutes=m, seconds=s * 10), 50_000_000, False
            )

    # Current window: 60 spans, high latency 500ms, but 0% errors
    for i in range(60):
        insert_span(
            mem_db, "org-1", "order-service", "GET /order",
            now - timedelta(minutes=2, seconds=i * 2), 500_000_000, False
        )

    res = run_detection_cycle(mem_db)
    assert res.get("opened", 0) == 0
    assert _get_open_anomaly(mem_db, "org-1", "order-service") is None


def test_detection_not_triggered_by_error_rate_alone(mem_db):
    """Rising errors alone without elevated latency must NOT trigger an anomaly."""
    now = datetime.now(timezone.utc)
    # Seed baseline (50ms, 0 errors)
    for m in range(7, 17):
        for s in range(5):
            insert_span(
                mem_db, "org-1", "auth-service", "POST /login",
                now - timedelta(minutes=m, seconds=s * 10), 50_000_000, False
            )

    # Current window: 60 spans, normal latency (50ms), but 50% errors
    for i in range(60):
        insert_span(
            mem_db, "org-1", "auth-service", "POST /login",
            now - timedelta(minutes=2, seconds=i * 2), 50_000_000, (i % 2 == 0)
        )

    res = run_detection_cycle(mem_db)
    assert res.get("opened", 0) == 0
    assert _get_open_anomaly(mem_db, "org-1", "auth-service") is None


def test_detection_skips_when_fewer_than_min_spans(mem_db):
    """Evaluation window with < 50 spans must not trigger detection."""
    now = datetime.now(timezone.utc)
    # Baseline
    for m in range(7, 17):
        for s in range(5):
            insert_span(
                mem_db, "org-1", "email-service", "POST /send",
                now - timedelta(minutes=m, seconds=s * 10), 50_000_000, False
            )

    # Current window: only 20 spans (under the 50 minimum), even with high latency and errors
    for i in range(20):
        insert_span(
            mem_db, "org-1", "email-service", "POST /send",
            now - timedelta(minutes=2, seconds=i * 2), 800_000_000, True
        )

    res = run_detection_cycle(mem_db)
    assert res.get("opened", 0) == 0
    assert res.get("skipped", 0) >= 1


# ==============================================================================
# Suite C: Suspect Span Ranking & Self-Time Tests
# ==============================================================================

def test_merge_intervals_overlapping():
    """Verify interval merge logic for overlapping child spans."""
    # Disjoint intervals
    assert _merge_intervals([(0, 10), (20, 30)]) == 20
    # Overlapping intervals: [0, 15] and [10, 25] -> merged [0, 25] = length 25
    assert _merge_intervals([(0, 15), (10, 25)]) == 25
    # Completely nested interval: [0, 50] containing [10, 20] -> length 50
    assert _merge_intervals([(0, 50), (10, 20)]) == 50
    # Empty
    assert _merge_intervals([]) == 0


def test_suspect_ranking_self_time(mem_db):
    """Suspect spans should be ranked by self_time = duration - merged_child_coverage."""
    now = datetime.now(timezone.utc)
    win_start = now - timedelta(minutes=5)
    win_end = now

    trace_id = "trace-demo-1"

    # Span 1: Slow query with 0 children -> self time = 400ms
    sid_slow, _ = insert_span(
        mem_db, "org-1", "payment-service", "SQL SELECT * FROM accounts",
        now - timedelta(minutes=3), duration_ns=400_000_000, trace_id=trace_id
    )

    # Span 2: Outer handler duration 500ms, with child of 300ms -> self time = 200ms
    sid_parent, _ = insert_span(
        mem_db, "org-1", "payment-service", "POST /checkout",
        now - timedelta(minutes=2), duration_ns=500_000_000, trace_id=trace_id
    )
    # Child of Span 2 (covers 300ms of the 500ms)
    insert_span(
        mem_db, "org-1", "payment-service", "Validate Cart",
        now - timedelta(minutes=2), duration_ns=300_000_000, parent_span_id=sid_parent, trace_id=trace_id
    )

    # Span 3: Fast span duration 20ms -> self time = 20ms
    sid_fast, _ = insert_span(
        mem_db, "org-1", "payment-service", "GET /ping",
        now - timedelta(minutes=1), duration_ns=20_000_000, trace_id=trace_id
    )

    suspects = rank_suspects(mem_db, "org-1", "payment-service", win_start, win_end)
    assert len(suspects) >= 3

    # Ranking must be:
    # 1. SQL SELECT (400ms self time)
    # 2. Validate Cart (300ms self time)
    # 3. POST /checkout (200ms self time, 500ms total - 300ms child)
    # 4. GET /ping (20ms self time)
    assert suspects[0].span_name == "SQL SELECT * FROM accounts"
    assert suspects[0].self_time_ns == 400_000_000
    assert suspects[1].span_name == "Validate Cart"
    assert suspects[1].self_time_ns == 300_000_000
    assert suspects[2].span_name == "POST /checkout"
    assert suspects[2].self_time_ns == 200_000_000


# ==============================================================================
# Suite D: Anomaly Lifecycle Tests
# ==============================================================================

def test_anomaly_lifecycle_open_update_close(mem_db):
    """
    Test the full lifecycle:
    1. First flagged tick opens anomaly with stable ID.
    2. Second flagged tick updates metrics and keeps SAME anomaly_id.
    3. First normal tick increments recovery_count (still open).
    4. Second normal tick closes anomaly.
    """
    now = datetime.now(timezone.utc)
    # Baseline
    for m in range(7, 17):
        for s in range(5):
            insert_span(
                mem_db, "org-1", "payment-service", "POST /charge",
                now - timedelta(minutes=m, seconds=s * 10), 50_000_000, False
            )

    # Flagged window
    for i in range(60):
        insert_span(
            mem_db, "org-1", "payment-service", "POST /charge",
            now - timedelta(minutes=2, seconds=i * 2), 300_000_000, (i % 5 == 0)
        )

    # 1. First run: OPEN
    res1 = run_detection_cycle(mem_db)
    assert res1["opened"] == 1
    anm1 = _get_open_anomaly(mem_db, "org-1", "payment-service")
    assert anm1 is not None
    orig_id = anm1["anomaly_id"]

    # 2. Second run: still flagged -> UPDATE with same ID
    res2 = run_detection_cycle(mem_db)
    assert res2["updated"] == 1
    anm2 = _get_open_anomaly(mem_db, "org-1", "payment-service")
    assert anm2["anomaly_id"] == orig_id
    assert anm2["recovery_count"] == 0

    # 3. Third run: Traffic recovers (clear window spans and replace with normal traffic)
    mem_db.execute("DELETE FROM spans WHERE start_ts >= ?", [(now - timedelta(minutes=5)).strftime("%Y-%m-%d %H:%M:%S.%f")])
    for i in range(60):
        insert_span(
            mem_db, "org-1", "payment-service", "POST /charge",
            now - timedelta(minutes=2, seconds=i * 2), 50_000_000, False
        )

    res3 = run_detection_cycle(mem_db)
    # Must increment recovery_count to 1, still OPEN
    assert res3["updated"] == 1
    anm3 = _get_open_anomaly(mem_db, "org-1", "payment-service")
    assert anm3 is not None
    assert anm3["recovery_count"] == 1
    assert anm3["status"] == "open"

    # 4. Fourth run: Consecutive normal window -> CLOSES anomaly
    res4 = run_detection_cycle(mem_db)
    assert res4["closed"] == 1
    # Now there should be no open anomaly
    assert _get_open_anomaly(mem_db, "org-1", "payment-service") is None

    # Check status in DB is 'closed'
    row = mem_db.execute("SELECT status FROM anomalies WHERE anomaly_id = ?", [orig_id]).fetchone()
    assert row[0] == "closed"


# ==============================================================================
# Suite E: API, Security, & Tenant Isolation Tests
# ==============================================================================

def test_api_tenant_isolation(mem_db, monkeypatch):
    """Org A cannot view anomalies belonging to Org B."""
    import app.database
    monkeypatch.setattr(app.database, "get_db", lambda: mem_db)
    monkeypatch.setattr("app.routers.anomalies.get_db", lambda: mem_db)

    # Seed anomaly for Org A
    mem_db.execute(
        """
        INSERT INTO anomalies (
            org_id, anomaly_id, service_name, window_start, window_end,
            p99_ns, baseline_p99_ns, ratio, error_rate, baseline_error_rate,
            status, suspects, detected_at, updated_at
        ) VALUES (
            'org-alpha', 'anm_alpha', 'payment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
            400000000, 100000000, 4.0, 0.1, 0.01, 'open', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        """
    )
    # Seed anomaly for Org B
    mem_db.execute(
        """
        INSERT INTO anomalies (
            org_id, anomaly_id, service_name, window_start, window_end,
            p99_ns, baseline_p99_ns, ratio, error_rate, baseline_error_rate,
            status, suspects, detected_at, updated_at
        ) VALUES (
            'org-beta', 'anm_beta', 'payment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
            500000000, 100000000, 5.0, 0.1, 0.01, 'open', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        """
    )

    client = TestClient(fastapi_app)

    # Request with Org A token
    token_a = make_token("org-alpha")
    res_a = client.get("/anomalies", headers={"Authorization": f"Bearer {token_a}"})
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert data_a["total"] == 1
    assert data_a["anomalies"][0]["anomaly_id"] == "anm_alpha"

    # Request with Org B token
    token_b = make_token("org-beta")
    res_b = client.get("/anomalies", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b.status_code == 200
    data_b = res_b.json()
    assert data_b["total"] == 1
    assert data_b["anomalies"][0]["anomaly_id"] == "anm_beta"


def test_api_visible_services_restriction(mem_db, monkeypatch):
    """Visible services claim in token restricts results."""
    import app.database
    monkeypatch.setattr(app.database, "get_db", lambda: mem_db)
    monkeypatch.setattr("app.routers.anomalies.get_db", lambda: mem_db)

    # Insert two anomalies for org-alpha: one on payment, one on inventory
    mem_db.execute(
        """
        INSERT INTO anomalies (
            org_id, anomaly_id, service_name, window_start, window_end,
            p99_ns, baseline_p99_ns, ratio, error_rate, baseline_error_rate,
            status, suspects, detected_at, updated_at
        ) VALUES
        ('org-alpha', 'anm_pay', 'payment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 400000000, 100000000, 4.0, 0.1, 0.01, 'open', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('org-alpha', 'anm_inv', 'inventory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 400000000, 100000000, 4.0, 0.1, 0.01, 'open', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    )

    client = TestClient(fastapi_app)
    # User can only see payment
    restricted_token = make_token("org-alpha", visible_services=["payment"])
    res = client.get("/anomalies", headers={"Authorization": f"Bearer {restricted_token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["anomalies"][0]["service_name"] == "payment"


def test_api_requires_auth():
    """Unauthenticated request must return 401."""
    client = TestClient(fastapi_app)
    res = client.get("/anomalies")
    assert res.status_code == 401


# ==============================================================================
# Suite F: Scheduler & Fault Injection Acceptance Tests
# ==============================================================================

def test_normal_traffic_zero_false_positives(mem_db):
    """
    Test 3 Acceptance Criteria:
    Run normal traffic for 10 minutes -> expected 0 false anomalies.
    """
    now = datetime.now(timezone.utc)
    # 10 minutes of baseline
    for m in range(15, 25):
        for s in range(5):
            insert_span(
                mem_db, "org-test", "gateway-api", "GET /items",
                now - timedelta(minutes=m, seconds=s * 10), 20_000_000, False
            )

    # 10 minutes of evaluation traffic under normal conditions (latency ~20ms, 0% error)
    for m in range(0, 10):
        for s in range(6):
            insert_span(
                mem_db, "org-test", "gateway-api", "GET /items",
                now - timedelta(minutes=m, seconds=s * 10), 20_000_000, False
            )

    res = run_detection_cycle(mem_db)
    assert res.get("opened", 0) == 0
    assert _get_open_anomaly(mem_db, "org-test", "gateway-api") is None


def test_demo_300ms_fault_injection_suspect_in_top_3(mem_db):
    """
    Tests 1 & 2 Acceptance Criteria:
    Inject 300 ms delay into one demo service -> exactly one anomaly fires,
    and the injected slow span appears in the top 3 suspects.
    """
    now = datetime.now(timezone.utc)
    # Seed baseline (50ms)
    for m in range(7, 17):
        for s in range(5):
            insert_span(
                mem_db, "org-demo", "payment-service", "POST /charge",
                now - timedelta(minutes=m, seconds=s * 10), 50_000_000, False
            )

    # Seed window: 60 spans, including injected 300ms faulty span
    injected_span_id, injected_trace_id = insert_span(
        mem_db, "org-demo", "payment-service", "Injected Database Delay",
        now - timedelta(minutes=2), duration_ns=300_000_000, is_error=True
    )
    for i in range(59):
        insert_span(
            mem_db, "org-demo", "payment-service", "POST /charge",
            now - timedelta(minutes=2, seconds=i * 2),
            duration_ns=180_000_000 if i >= 45 else 40_000_000,
            is_error=(i % 4 == 0),  # error rate ~25%
        )

    res = run_detection_cycle(mem_db)
    assert res.get("opened", 0) == 1

    anm = _get_open_anomaly(mem_db, "org-demo", "payment-service")
    assert anm is not None
    assert anm["status"] == "open"

    # Verify suspects
    import json
    suspects = json.loads(anm["suspects"])
    assert len(suspects) > 0

    top_3_span_ids = [s["span_id"] for s in suspects[:3]]
    top_3_names = [s["span_name"] for s in suspects[:3]]

    # The injected slow span must appear in the top 3 suspects!
    assert (
        injected_span_id in top_3_span_ids
        or "Injected Database Delay" in top_3_names
    )


@pytest.mark.asyncio
async def test_scheduler_lifecycle():
    """Verify scheduler startup, loop execution, and clean cancellation."""
    from app.jobs.scheduler import run_scheduler
    task = asyncio.create_task(run_scheduler())
    await asyncio.sleep(0.05)
    assert not task.done()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert task.done()

