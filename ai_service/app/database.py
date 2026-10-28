"""
DuckDB connection management for the ai-service.

Rules:
- Only one DuckDB writer process per file (the store-service owns the file).
- The ai-service opens DuckDB read-write only when running in :memory: mode
  (tests / standalone demo).  In production it connects to the same file with
  read-write so it can maintain the `anomalies` table; the store-service must
  not be running against the same file at the same time without WAL / ClickHouse.
- All connections go through get_db() which is a cached singleton.
"""

import threading
import duckdb
from .config import get_settings

_lock = threading.Lock()
_conn: duckdb.DuckDBPyConnection | None = None


def get_db() -> duckdb.DuckDBPyConnection:
    """Return the (lazily-created) DuckDB connection. Thread-safe singleton."""
    global _conn
    if _conn is None:
        with _lock:
            if _conn is None:
                cfg = get_settings()
                _conn = duckdb.connect(cfg.DUCKDB_PATH)
                _ensure_schema(_conn)
    return _conn


def set_db(conn: duckdb.DuckDBPyConnection | None) -> None:
    """Explicitly set or override the DuckDB connection (useful for tests and dependency injection)."""
    global _conn
    with _lock:
        _conn = conn


def _ensure_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """Create all tables that the ai-service owns if they do not exist yet."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS spans (
            org_id            VARCHAR      NOT NULL,
            trace_id          VARCHAR      NOT NULL,
            span_id           VARCHAR      NOT NULL,
            parent_span_id    VARCHAR,
            service_name      VARCHAR      NOT NULL,
            span_name         VARCHAR      NOT NULL,
            span_kind         VARCHAR,
            start_time_ns     BIGINT       NOT NULL,
            start_ts          TIMESTAMP    NOT NULL,
            duration_ns       BIGINT       NOT NULL,
            status_code       VARCHAR      DEFAULT 'UNSET',
            status_message    VARCHAR,
            http_method       VARCHAR,
            http_route        VARCHAR,
            http_status       SMALLINT,
            is_error          BOOLEAN      DEFAULT FALSE,
            error_fingerprint VARCHAR,
            attributes        JSON,
            resource_attributes JSON,
            ingested_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (org_id, trace_id, span_id)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            org_id            VARCHAR      NOT NULL,
            log_id            VARCHAR      NOT NULL,
            time_ns           BIGINT       NOT NULL,
            ts                TIMESTAMP    NOT NULL,
            trace_id          VARCHAR,
            span_id           VARCHAR,
            service_name      VARCHAR      NOT NULL,
            severity_text     VARCHAR,
            severity_number   SMALLINT,
            body              VARCHAR,
            error_fingerprint VARCHAR,
            attributes        JSON,
            PRIMARY KEY (org_id, log_id)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            org_id       VARCHAR   NOT NULL,
            event_id     VARCHAR   NOT NULL,
            ts           TIMESTAMP NOT NULL,
            event_type   VARCHAR   NOT NULL,
            service_name VARCHAR,
            label        VARCHAR,
            details      JSON,
            PRIMARY KEY (org_id, event_id)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS anomalies (
            org_id              VARCHAR   NOT NULL,
            anomaly_id          VARCHAR   NOT NULL,
            service_name        VARCHAR   NOT NULL,
            window_start        TIMESTAMP NOT NULL,
            window_end          TIMESTAMP NOT NULL,
            p99_ns              BIGINT    NOT NULL,
            baseline_p99_ns     BIGINT    NOT NULL,
            ratio               DOUBLE    NOT NULL,
            error_rate          DOUBLE    NOT NULL,
            baseline_error_rate DOUBLE    NOT NULL,
            status              VARCHAR   NOT NULL DEFAULT 'open',
            suspects            JSON,
            detected_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            recovery_count      INTEGER   NOT NULL DEFAULT 0,
            PRIMARY KEY (org_id, anomaly_id)
        )
    """)

    # Index to speed up the most common detector query
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_anomalies_org_service_status
        ON anomalies (org_id, service_name, status)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_spans_org_service_ts
        ON spans (org_id, service_name, start_ts)
    """)

    # Derived Views (Feature 6, 8, 15)
    conn.execute("""
        CREATE VIEW IF NOT EXISTS v_trace_summary AS
        SELECT
            org_id,
            trace_id,
            coalesce(any_value(CASE WHEN parent_span_id IS NULL THEN span_name ELSE NULL END), any_value(span_name)) AS root_span_name,
            min(start_ts) AS start_ts,
            max(start_time_ns + duration_ns) - min(start_time_ns) AS duration_ns,
            count(DISTINCT service_name) AS service_count,
            count(*) AS span_count,
            bool_or(is_error) AS has_error
        FROM spans
        GROUP BY org_id, trace_id
    """)

    conn.execute("""
        CREATE VIEW IF NOT EXISTS v_topology_edges AS
        SELECT
            p.org_id AS org_id,
            p.service_name AS caller,
            c.service_name AS callee,
            count(*) AS call_count,
            quantile_cont(c.duration_ns, 0.95) AS p95_ns,
            avg(CASE WHEN c.is_error THEN 1.0 ELSE 0.0 END) AS error_rate,
            min(c.start_ts) AS window_start,
            max(c.start_ts) AS window_end
        FROM spans c
        JOIN spans p ON c.org_id = p.org_id AND c.trace_id = p.trace_id AND c.parent_span_id = p.span_id
        WHERE c.service_name != p.service_name
        GROUP BY p.org_id, p.service_name, c.service_name
    """)

    conn.execute("""
        CREATE VIEW IF NOT EXISTS v_error_groups AS
        SELECT
            org_id,
            error_fingerprint,
            service_name,
            any_value(span_name) AS pattern,
            count(*) AS count,
            min(start_ts) AS first_seen,
            max(start_ts) AS last_seen,
            any_value(trace_id) AS sample_trace_id,
            any_value(span_id) AS sample_span_id
        FROM spans
        WHERE is_error = TRUE AND error_fingerprint IS NOT NULL AND error_fingerprint != ''
        GROUP BY org_id, error_fingerprint, service_name
    """)


def close_db() -> None:
    """Close the DuckDB connection (called on shutdown)."""
    global _conn
    if _conn is not None:
        with _lock:
            if _conn is not None:
                _conn.close()
                _conn = None


def query_clickhouse_arrow(ch_query: str, parameters: dict | None = None):
    """Query ClickHouse directly and return an Apache Arrow Table."""
    from .clickhouse import get_ch_client
    client = get_ch_client()
    return client.query_arrow(ch_query, parameters=parameters)


def query_clickhouse_df(ch_query: str, parameters: dict | None = None):
    """Query ClickHouse directly and return a Pandas DataFrame."""
    from .clickhouse import get_ch_client
    client = get_ch_client()
    return client.query_df(ch_query, parameters=parameters)


def query_clickhouse_with_duckdb(
    ch_query: str,
    duckdb_sql: str,
    table_alias: str = "ch_data",
    parameters: dict | None = None,
) -> list:
    """
    Execute a ClickHouse query, register the result into DuckDB with zero-copy,
    and execute a DuckDB analytical SQL query over it.
    """
    conn = get_db()
    arrow_tbl = query_clickhouse_arrow(ch_query, parameters=parameters)
    conn.register(table_alias, arrow_tbl)
    try:
        cursor = conn.execute(duckdb_sql)
        cols = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        return [dict(zip(cols, row)) for row in rows]
    finally:
        try:
            conn.unregister(table_alias)
        except Exception:
            pass


def sync_clickhouse_to_duckdb(
    ch_table: str,
    target_table: str | None = None,
    where_clause: str = "",
    limit: int | None = None,
) -> int:
    """
    Fetch rows from ClickHouse and materialize them into a local DuckDB table.
    Returns the number of rows synced.
    """
    conn = get_db()
    dest = target_table or ch_table
    sql = f"SELECT * FROM {ch_table}"
    if where_clause:
        sql += f" WHERE {where_clause}"
    if limit:
        sql += f" LIMIT {limit}"

    arrow_tbl = query_clickhouse_arrow(sql)
    row_count = arrow_tbl.num_rows
    conn.register(f"_sync_temp_{dest}", arrow_tbl)
    try:
        conn.execute(f"CREATE OR REPLACE TABLE {dest} AS SELECT * FROM _sync_temp_{dest}")
    finally:
        try:
            conn.unregister(f"_sync_temp_{dest}")
        except Exception:
            pass
    return row_count


def verify_spans_in_duckdb(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    span_ids: list[str],
) -> dict[str, dict]:
    """
    Feature 19: Verify span IDs against DuckDB for org_id.
    Returns mapping: span_id -> metadata dictionary.
    """
    if not span_ids:
        return {}
    placeholders = ", ".join(["?"] * len(span_ids))
    sql = f"""
        SELECT
            span_id,
            trace_id,
            service_name,
            span_name,
            duration_ns,
            is_error,
            status_code,
            start_ts
        FROM spans
        WHERE org_id = ? AND span_id IN ({placeholders})
    """
    try:
        rows = conn.execute(sql, [org_id] + span_ids).fetchall()
        result = {}
        for r in rows:
            dur_ns = int(r[4]) if r[4] is not None else 0
            result[r[0]] = {
                "span_id": r[0],
                "trace_id": r[1],
                "service_name": r[2],
                "span_name": r[3],
                "duration_ns": dur_ns,
                "duration_ms": round(dur_ns / 1_000_000, 2),
                "is_error": bool(r[5]),
                "status_code": r[6] or "UNSET",
                "timestamp": str(r[7]) if r[7] else None,
                "source": "duckdb",
            }
        return result
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Error verifying spans in DuckDB: %s", e)
        return {}


def verify_logs_in_duckdb(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    log_ids: list[str],
) -> dict[str, dict]:
    """
    Feature 19: Verify log IDs against DuckDB for org_id.
    Returns mapping: log_id -> metadata dictionary.
    """
    if not log_ids:
        return {}
    placeholders = ", ".join(["?"] * len(log_ids))
    sql = f"""
        SELECT
            log_id,
            trace_id,
            span_id,
            service_name,
            severity_text,
            body,
            ts
        FROM logs
        WHERE org_id = ? AND log_id IN ({placeholders})
    """
    try:
        rows = conn.execute(sql, [org_id] + log_ids).fetchall()
        result = {}
        for r in rows:
            result[r[0]] = {
                "log_id": r[0],
                "trace_id": r[1],
                "span_id": r[2],
                "service_name": r[3],
                "severity_text": r[4] or "INFO",
                "body": r[5] or "",
                "timestamp": str(r[6]) if r[6] else None,
                "source": "duckdb",
            }
        return result
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Error verifying logs in DuckDB: %s", e)
        return {}


def verify_traces_in_duckdb(
    conn: duckdb.DuckDBPyConnection,
    org_id: str,
    trace_ids: list[str],
) -> dict[str, dict]:
    """
    Feature 19: Verify trace IDs against DuckDB for org_id.
    Returns mapping: trace_id -> metadata dictionary.
    """
    if not trace_ids:
        return {}
    placeholders = ", ".join(["?"] * len(trace_ids))
    sql = f"""
        SELECT
            trace_id,
            any_value(service_name) AS service_name,
            any_value(span_name) AS root_span_name,
            count(*) AS span_count,
            bool_or(is_error) AS has_error,
            max(start_time_ns + duration_ns) - min(start_time_ns) AS duration_ns
        FROM spans
        WHERE org_id = ? AND trace_id IN ({placeholders})
        GROUP BY trace_id
    """
    try:
        rows = conn.execute(sql, [org_id] + trace_ids).fetchall()
        result = {}
        for r in rows:
            dur_ns = int(r[5]) if r[5] is not None else 0
            result[r[0]] = {
                "trace_id": r[0],
                "service_name": r[1],
                "span_name": r[2],
                "span_count": int(r[3]),
                "is_error": bool(r[4]),
                "duration_ns": dur_ns,
                "duration_ms": round(dur_ns / 1_000_000, 2),
                "source": "duckdb",
            }
        return result
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Error verifying traces in DuckDB: %s", e)
        return {}

