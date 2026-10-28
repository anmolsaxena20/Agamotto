"""
ClickHouse connection management and query helpers for Eye of Agamotto.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import clickhouse_connect
from clickhouse_connect.driver.client import Client

from .config import get_settings

logger = logging.getLogger(__name__)

_ch_lock = threading.Lock()
_ch_client: Optional[Client] = None

# DDL for ClickHouse tables
CLICKHOUSE_SCHEMA_DDL = [
    """
    CREATE DATABASE IF NOT EXISTS agamotto_telemetry;
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.organizations (
      organization_id UUID,
      created_at DateTime64(3, 'UTC')
    ) ENGINE = ReplacingMergeTree(created_at) ORDER BY organization_id;
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.services (
      organization_id UUID,
      service_id UUID,
      service_name LowCardinality(String),
      service_version String,
      first_seen_at DateTime64(3, 'UTC'),
      last_seen_at DateTime64(3, 'UTC')
    ) ENGINE = ReplacingMergeTree(last_seen_at) ORDER BY (organization_id, service_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.resources (
      organization_id UUID,
      resource_id UUID,
      attributes_json String CODEC(ZSTD(3)),
      first_seen_at DateTime64(3, 'UTC')
    ) ENGINE = ReplacingMergeTree(first_seen_at) ORDER BY (organization_id, resource_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.instrumentation_scopes (
      organization_id UUID,
      scope_id UUID,
      scope_name LowCardinality(String),
      scope_version String,
      attributes_json String CODEC(ZSTD(3))
    ) ENGINE = ReplacingMergeTree ORDER BY (organization_id, scope_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.ingestion_batches (
      received_at DateTime64(3, 'UTC'),
      organization_id UUID,
      signal LowCardinality(String),
      payload_sha256 FixedString(64),
      payload_bytes UInt64,
      otlp_export_request String CODEC(ZSTD(3))
    ) ENGINE = MergeTree
    PARTITION BY toYYYYMM(received_at)
    ORDER BY (organization_id, signal, received_at, payload_sha256)
    TTL received_at + INTERVAL 30 DAY;
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.trace_spans (
      organization_id UUID,
      trace_id FixedString(32),
      span_id FixedString(16),
      parent_span_id FixedString(16),
      service_name LowCardinality(String),
      name LowCardinality(String),
      kind UInt8,
      start_time DateTime64(9, 'UTC'),
      duration_ns UInt64,
      status_code UInt8
    ) ENGINE = MergeTree
    PARTITION BY toYYYYMM(start_time)
    ORDER BY (organization_id, service_name, trace_id, start_time, span_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.spans (
      organization_id UUID,
      trace_id FixedString(32),
      span_id FixedString(16),
      parent_span_id FixedString(16),
      resource_id UUID,
      scope_id UUID,
      service_id UUID,
      name String,
      kind UInt8,
      start_time DateTime64(9, 'UTC'),
      end_time DateTime64(9, 'UTC'),
      status_code UInt8,
      status_message String,
      attributes_json String CODEC(ZSTD(3)),
      events_json String CODEC(ZSTD(3))
    ) ENGINE = MergeTree
    PARTITION BY toYYYYMM(start_time)
    ORDER BY (organization_id, service_id, trace_id, start_time, span_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.metric_samples (
      organization_id UUID,
      service_name LowCardinality(String),
      metric_name LowCardinality(String),
      metric_type LowCardinality(String),
      time DateTime64(9, 'UTC'),
      value Float64,
      attributes_json String
    ) ENGINE = MergeTree
    PARTITION BY toYYYYMM(time)
    ORDER BY (organization_id, service_name, metric_name, time);
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.metric_points (
      organization_id UUID,
      resource_id UUID,
      scope_id UUID,
      service_id UUID,
      metric_name LowCardinality(String),
      metric_type LowCardinality(String),
      unit LowCardinality(String),
      time_unix_nano DateTime64(9, 'UTC'),
      start_time_unix_nano DateTime64(9, 'UTC'),
      value Float64,
      attributes_json String CODEC(ZSTD(3)),
      histogram_json String CODEC(ZSTD(3))
    ) ENGINE = MergeTree
    PARTITION BY toYYYYMM(time_unix_nano)
    ORDER BY (organization_id, service_id, metric_name, time_unix_nano);
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.telemetry_logs (
      organization_id UUID,
      service_name LowCardinality(String),
      time DateTime64(9, 'UTC'),
      observed_time DateTime64(9, 'UTC'),
      trace_id FixedString(32),
      span_id FixedString(16),
      severity_number UInt8,
      severity_text LowCardinality(String),
      body String,
      attributes_json String
    ) ENGINE = MergeTree
    PARTITION BY toYYYYMM(time)
    ORDER BY (organization_id, service_name, time, trace_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.log_records (
      organization_id UUID,
      resource_id UUID,
      scope_id UUID,
      service_id UUID,
      time_unix_nano DateTime64(9, 'UTC'),
      observed_time_unix_nano DateTime64(9, 'UTC'),
      trace_id FixedString(32),
      span_id FixedString(16),
      severity_number UInt8,
      severity_text LowCardinality(String),
      body String CODEC(ZSTD(3)),
      attributes_json String CODEC(ZSTD(3))
    ) ENGINE = MergeTree
    PARTITION BY toYYYYMM(time_unix_nano)
    ORDER BY (organization_id, service_id, time_unix_nano, trace_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.canonical_spans (
      org_id String,
      trace_id String,
      span_id String,
      parent_span_id Nullable(String),
      service_name LowCardinality(String),
      span_name String,
      span_kind LowCardinality(Nullable(String)),
      start_time_ns Int64,
      start_ts DateTime64(6, 'UTC'),
      duration_ns Int64,
      status_code LowCardinality(Nullable(String)),
      status_message Nullable(String),
      http_method Nullable(String),
      http_route Nullable(String),
      http_status Nullable(Int16),
      is_error UInt8,
      error_fingerprint Nullable(String),
      attributes Nullable(String),
      resource_attributes Nullable(String),
      ingested_at DateTime64(3, 'UTC') DEFAULT now()
    ) ENGINE = ReplacingMergeTree()
    ORDER BY (org_id, trace_id, span_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS agamotto_telemetry.canonical_logs (
      org_id String,
      log_id String,
      time_ns Int64,
      ts DateTime64(6, 'UTC'),
      trace_id Nullable(String),
      span_id Nullable(String),
      service_name LowCardinality(String),
      severity_text LowCardinality(Nullable(String)),
      severity_number Nullable(Int16),
      body String,
      error_fingerprint Nullable(String),
      attributes Nullable(String)
    ) ENGINE = ReplacingMergeTree()
    ORDER BY (org_id, log_id);
    """,
]


def get_ch_client() -> Client:
    """Return a thread-safe singleton ClickHouse client."""
    global _ch_client
    if _ch_client is None:
        with _ch_lock:
            if _ch_client is None:
                cfg = get_settings()
                logger.info(
                    "Connecting to ClickHouse host=%s port=%d database=%s secure=%s",
                    cfg.CLICKHOUSE_HOST,
                    cfg.CLICKHOUSE_PORT,
                    cfg.CLICKHOUSE_DATABASE,
                    cfg.CLICKHOUSE_SECURE,
                )
                _ch_client = clickhouse_connect.get_client(
                    host=cfg.CLICKHOUSE_HOST,
                    port=cfg.CLICKHOUSE_PORT,
                    username=cfg.CLICKHOUSE_USER,
                    password=cfg.CLICKHOUSE_PASSWORD,
                    database=cfg.CLICKHOUSE_DATABASE,
                    secure=cfg.CLICKHOUSE_SECURE,
                    connect_timeout=15,
                    send_receive_timeout=30,
                )
                logger.info("ClickHouse client connected successfully.")
    return _ch_client


def init_clickhouse_schema() -> None:
    """Execute CREATE TABLE DDLs to ensure all tables exist."""
    client = get_ch_client()
    for ddl in CLICKHOUSE_SCHEMA_DDL:
        clean_ddl = ddl.strip()
        if clean_ddl:
            try:
                client.command(clean_ddl)
            except Exception as e:
                logger.warning("Error executing ClickHouse DDL statement: %s", e)
    logger.info("ClickHouse schema check complete.")


def close_ch_client() -> None:
    """Close the ClickHouse connection."""
    global _ch_client
    if _ch_client is not None:
        with _ch_lock:
            if _ch_client is not None:
                try:
                    _ch_client.close()
                except Exception as e:
                    logger.debug("Error closing ClickHouse client: %s", e)
                _ch_client = None


def _clean_str(val: Any) -> str:
    """Helper to cleanly convert ClickHouse FixedString / String / UUID to plain str."""
    if val is None:
        return ""
    if isinstance(val, (bytes, bytearray)):
        try:
            return val.decode("utf-8").strip("\x00")
        except Exception:
            return val.hex()
    s = str(val)
    if s.startswith("b'") and s.endswith("'"):
        s = s[2:-1]
    return s.strip("\x00")


def verify_spans_in_clickhouse(org_id: str, span_ids: list[str]) -> dict[str, dict]:
    """
    Feature 19: Verify span IDs against ClickHouse for org_id.
    Queries both canonical_spans and trace_spans / spans.
    Returns mapping: span_id -> metadata dictionary.
    """
    if not span_ids:
        return {}
    try:
        client = get_ch_client()
        result: dict[str, dict] = {}

        # 1. Check canonical_spans first
        try:
            sql_canonical = """
                SELECT
                    span_id,
                    trace_id,
                    service_name,
                    span_name,
                    duration_ns,
                    is_error,
                    status_code,
                    start_ts
                FROM agamotto_telemetry.canonical_spans
                WHERE org_id = {org_id:String} AND span_id IN ({span_ids:Array(String)})
            """
            res = client.query(sql_canonical, parameters={"org_id": org_id, "span_ids": span_ids})
            for r in res.result_rows:
                s_id = _clean_str(r[0])
                t_id = _clean_str(r[1])
                dur_ns = int(r[4]) if r[4] is not None else 0
                result[s_id] = {
                    "span_id": s_id,
                    "trace_id": t_id,
                    "service_name": _clean_str(r[2]),
                    "span_name": _clean_str(r[3]),
                    "duration_ns": dur_ns,
                    "duration_ms": round(dur_ns / 1_000_000, 2),
                    "is_error": bool(r[5]),
                    "status_code": str(r[6] or "UNSET"),
                    "timestamp": str(r[7]) if r[7] else None,
                    "source": "clickhouse",
                }
        except Exception as e_can:
            logger.debug("ClickHouse canonical_spans query note: %s", e_can)

        # 2. Check trace_spans for any still-missing span IDs
        missing_ids = [sid for sid in span_ids if sid not in result]
        if missing_ids:
            try:
                sql_trace = """
                    SELECT
                        span_id,
                        trace_id,
                        service_name,
                        name,
                        duration_ns,
                        status_code,
                        start_time
                    FROM agamotto_telemetry.trace_spans
                    WHERE (toString(organization_id) = {org_id:String} OR organization_id = toUUIDOrDefault({org_id:String}, toUUID('00000000-0000-0000-0000-000000000000')))
                      AND span_id IN ({span_ids:Array(String)})
                """
                res2 = client.query(sql_trace, parameters={"org_id": org_id, "span_ids": missing_ids})
                for r in res2.result_rows:
                    s_id = _clean_str(r[0])
                    t_id = _clean_str(r[1])
                    dur_ns = int(r[4]) if r[4] is not None else 0
                    status_c = "ERROR" if r[5] == 2 else "OK"
                    result[s_id] = {
                        "span_id": s_id,
                        "trace_id": t_id,
                        "service_name": _clean_str(r[2]),
                        "span_name": _clean_str(r[3]),
                        "duration_ns": dur_ns,
                        "duration_ms": round(dur_ns / 1_000_000, 2),
                        "is_error": (r[5] == 2),
                        "status_code": status_c,
                        "timestamp": str(r[6]) if r[6] else None,
                        "source": "clickhouse",
                    }
            except Exception as e_ts:
                logger.debug("ClickHouse trace_spans query note: %s", e_ts)

        return result
    except Exception as exc:
        logger.warning("Error verifying spans in ClickHouse: %s", exc)
        return {}


def verify_logs_in_clickhouse(org_id: str, log_ids: list[str]) -> dict[str, dict]:
    """
    Feature 19: Verify log IDs against ClickHouse for org_id.
    Returns mapping: log_id -> metadata dictionary.
    """
    if not log_ids:
        return {}
    try:
        client = get_ch_client()
        result: dict[str, dict] = {}

        # 1. Check canonical_logs
        try:
            sql_canonical = """
                SELECT
                    log_id,
                    trace_id,
                    span_id,
                    service_name,
                    severity_text,
                    body,
                    ts
                FROM agamotto_telemetry.canonical_logs
                WHERE org_id = {org_id:String} AND log_id IN ({log_ids:Array(String)})
            """
            res = client.query(sql_canonical, parameters={"org_id": org_id, "log_ids": log_ids})
            for r in res.result_rows:
                result[str(r[0])] = {
                    "log_id": str(r[0]),
                    "trace_id": str(r[1]) if r[1] else None,
                    "span_id": str(r[2]) if r[2] else None,
                    "service_name": str(r[3]),
                    "severity_text": str(r[4] or "INFO"),
                    "body": str(r[5] or ""),
                    "timestamp": str(r[6]) if r[6] else None,
                    "source": "clickhouse",
                }
        except Exception as e_can:
            logger.debug("ClickHouse canonical_logs query note: %s", e_can)

        # 2. Check telemetry_logs for missing log IDs (or span_id/trace_id as log identifier)
        missing_ids = [lid for lid in log_ids if lid not in result]
        if missing_ids:
            try:
                sql_tl = """
                    SELECT
                        span_id,
                        trace_id,
                        service_name,
                        severity_text,
                        body,
                        time
                    FROM agamotto_telemetry.telemetry_logs
                    WHERE (toString(organization_id) = {org_id:String} OR organization_id = toUUIDOrDefault({org_id:String}, toUUID('00000000-0000-0000-0000-000000000000')))
                      AND (span_id IN ({ids:Array(String)}) OR trace_id IN ({ids:Array(String)}))
                    LIMIT 50
                """
                res2 = client.query(sql_tl, parameters={"org_id": org_id, "ids": missing_ids})
                for r in res2.result_rows:
                    lid = str(r[0])
                    result[lid] = {
                        "log_id": lid,
                        "trace_id": str(r[1]) if r[1] else None,
                        "span_id": lid,
                        "service_name": str(r[2]),
                        "severity_text": str(r[3] or "INFO"),
                        "body": str(r[4] or ""),
                        "timestamp": str(r[5]) if r[5] else None,
                        "source": "clickhouse",
                    }
            except Exception as e_tl:
                logger.debug("ClickHouse telemetry_logs query note: %s", e_tl)

        return result
    except Exception as exc:
        logger.warning("Error verifying logs in ClickHouse: %s", exc)
        return {}


def verify_traces_in_clickhouse(org_id: str, trace_ids: list[str]) -> dict[str, dict]:
    """
    Feature 19: Verify trace IDs against ClickHouse for org_id.
    Returns mapping: trace_id -> metadata dictionary.
    """
    if not trace_ids:
        return {}
    try:
        client = get_ch_client()
        result: dict[str, dict] = {}

        # Check canonical_spans
        try:
            sql = """
                SELECT
                    trace_id,
                    any(service_name) AS service_name,
                    any(span_name) AS span_name,
                    count() AS span_count,
                    max(is_error) AS has_error,
                    max(duration_ns) AS duration_ns
                FROM agamotto_telemetry.canonical_spans
                WHERE org_id = {org_id:String} AND trace_id IN ({trace_ids:Array(String)})
                GROUP BY trace_id
            """
            res = client.query(sql, parameters={"org_id": org_id, "trace_ids": trace_ids})
            for r in res.result_rows:
                dur_ns = int(r[5]) if r[5] is not None else 0
                result[str(r[0])] = {
                    "trace_id": str(r[0]),
                    "service_name": str(r[1]),
                    "span_name": str(r[2]),
                    "span_count": int(r[3]),
                    "is_error": bool(r[4]),
                    "duration_ns": dur_ns,
                    "duration_ms": round(dur_ns / 1_000_000, 2),
                    "source": "clickhouse",
                }
        except Exception:
            pass

        # Check trace_spans
        missing = [t for t in trace_ids if t not in result]
        if missing:
            try:
                sql2 = """
                    SELECT
                        trace_id,
                        any(service_name) AS service_name,
                        any(name) AS span_name,
                        count() AS span_count,
                        max(status_code = 2) AS has_error,
                        max(duration_ns) AS duration_ns
                    FROM agamotto_telemetry.trace_spans
                    WHERE (toString(organization_id) = {org_id:String} OR organization_id = toUUIDOrDefault({org_id:String}, '00000000-0000-0000-0000-000000000000'))
                      AND trace_id IN ({trace_ids:Array(String)})
                    GROUP BY trace_id
                """
                res2 = client.query(sql2, parameters={"org_id": org_id, "trace_ids": missing})
                for r in res2.result_rows:
                    dur_ns = int(r[5]) if r[5] is not None else 0
                    result[str(r[0])] = {
                        "trace_id": str(r[0]),
                        "service_name": str(r[1]),
                        "span_name": str(r[2]),
                        "span_count": int(r[3]),
                        "is_error": bool(r[4]),
                        "duration_ns": dur_ns,
                        "duration_ms": round(dur_ns / 1_000_000, 2),
                        "source": "clickhouse",
                    }
            except Exception:
                pass

        return result
    except Exception as exc:
        logger.warning("Error verifying traces in ClickHouse: %s", exc)
        return {}


def insert_canonical_spans_ch(org_id: str, rows: list[dict]) -> int:
    """Helper to insert spans into ClickHouse canonical_spans table."""
    if not rows:
        return 0
    client = get_ch_client()
    columns = [
        "org_id", "trace_id", "span_id", "parent_span_id", "service_name",
        "span_name", "span_kind", "start_time_ns", "start_ts", "duration_ns",
        "status_code", "status_message", "http_method", "http_route", "http_status",
        "is_error", "error_fingerprint", "attributes", "resource_attributes"
    ]
    data = []
    for r in rows:
        data.append([
            org_id,
            r.get("trace_id", ""),
            r.get("span_id", ""),
            r.get("parent_span_id"),
            r.get("service_name", "service"),
            r.get("span_name", "operation"),
            r.get("span_kind", "SERVER"),
            int(r.get("start_time_ns", 1000000000)),
            r.get("start_ts", datetime.now(timezone.utc)),
            int(r.get("duration_ns", 1000000)),
            r.get("status_code", "OK"),
            r.get("status_message"),
            r.get("http_method"),
            r.get("http_route"),
            r.get("http_status"),
            1 if r.get("is_error") else 0,
            r.get("error_fingerprint", ""),
            r.get("attributes", "{}"),
            r.get("resource_attributes", "{}"),
        ])
    client.insert("agamotto_telemetry.canonical_spans", data, column_names=columns)
    return len(data)


def insert_canonical_logs_ch(org_id: str, rows: list[dict]) -> int:
    """Helper to insert logs into ClickHouse canonical_logs table."""
    if not rows:
        return 0
    client = get_ch_client()
    columns = [
        "org_id", "log_id", "time_ns", "ts", "trace_id",
        "span_id", "service_name", "severity_text", "severity_number",
        "body", "error_fingerprint", "attributes"
    ]
    data = []
    for r in rows:
        data.append([
            org_id,
            r.get("log_id", ""),
            int(r.get("time_ns", 1000000000)),
            r.get("ts", datetime.now(timezone.utc)),
            r.get("trace_id"),
            r.get("span_id"),
            r.get("service_name", "service"),
            r.get("severity_text", "INFO"),
            r.get("severity_number", 9),
            r.get("body", ""),
            r.get("error_fingerprint", ""),
            r.get("attributes", "{}"),
        ])
    client.insert("agamotto_telemetry.canonical_logs", data, column_names=columns)
    return len(data)
