"""
FastAPI router providing DuckDB and ClickHouse database integration endpoints.
"""

from __future__ import annotations

import time
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Query

from app.clickhouse import get_ch_client
from app.database import (
    get_db,
    query_clickhouse_arrow,
    query_clickhouse_df,
    query_clickhouse_with_duckdb,
    sync_clickhouse_to_duckdb,
)
from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/db", tags=["database"])


class ClickHouseQueryRequest(BaseModel):
    query: str = Field(..., description="ClickHouse SQL SELECT query to execute")
    parameters: Optional[Dict[str, Any]] = Field(default=None, description="Optional parameterized arguments")


class DuckDBQueryRequest(BaseModel):
    query: str = Field(..., description="DuckDB SQL query to execute")


class FederatedQueryRequest(BaseModel):
    clickhouse_query: str = Field(..., description="ClickHouse SELECT query providing source dataset")
    duckdb_query: str = Field(..., description="DuckDB SQL query to run against registered dataset")
    table_alias: str = Field(default="ch_data", description="Virtual table alias inside DuckDB")
    parameters: Optional[Dict[str, Any]] = Field(default=None, description="Optional parameters for ClickHouse query")


class SyncRequest(BaseModel):
    clickhouse_table: str = Field(..., description="Source ClickHouse table name")
    duckdb_table: Optional[str] = Field(default=None, description="Target DuckDB table name")
    where_clause: Optional[str] = Field(default="", description="Optional SQL WHERE filter")
    limit: Optional[int] = Field(default=10000, description="Max rows to sync into DuckDB")


@router.get("/health")
def db_health():
    """
    Check connectivity and response time for both ClickHouse and DuckDB.
    """
    settings = get_settings()
    status: Dict[str, Any] = {
        "status": "healthy",
        "clickhouse": {},
        "duckdb": {},
    }

    # ClickHouse status
    try:
        t0 = time.perf_counter()
        ch = get_ch_client()
        tables_res = ch.query("SHOW TABLES").result_rows
        ch_tables = [r[0] for r in tables_res]
        elapsed_ch_ms = round((time.perf_counter() - t0) * 1000, 2)
        status["clickhouse"] = {
            "status": "connected",
            "host": settings.CLICKHOUSE_HOST,
            "port": settings.CLICKHOUSE_PORT,
            "database": settings.CLICKHOUSE_DATABASE,
            "latency_ms": elapsed_ch_ms,
            "tables": ch_tables,
        }
    except Exception as e:
        status["status"] = "degraded"
        status["clickhouse"] = {
            "status": "error",
            "error": str(e),
        }

    # DuckDB status
    try:
        t0 = time.perf_counter()
        db = get_db()
        duck_tables_res = db.execute("SHOW TABLES").fetchall()
        duck_tables = [r[0] for r in duck_tables_res]
        elapsed_duck_ms = round((time.perf_counter() - t0) * 1000, 2)
        status["duckdb"] = {
            "status": "connected",
            "path": settings.DUCKDB_PATH,
            "latency_ms": elapsed_duck_ms,
            "tables": duck_tables,
        }
    except Exception as e:
        status["status"] = "degraded"
        status["duckdb"] = {
            "status": "error",
            "error": str(e),
        }

    return status


@router.post("/clickhouse/query")
def execute_clickhouse_query(req: ClickHouseQueryRequest):
    """
    Execute a read-only query directly against ClickHouse.
    """
    # Guard against accidental destructive queries
    stripped = req.query.strip().lower()
    if not (stripped.startswith("select") or stripped.startswith("show") or stripped.startswith("describe") or stripped.startswith("explain")):
        raise HTTPException(status_code=400, detail="Only read queries (SELECT, SHOW, DESCRIBE, EXPLAIN) are permitted through this endpoint.")

    try:
        ch = get_ch_client()
        result = ch.query(req.query, parameters=req.parameters)
        return {
            "columns": result.column_names,
            "types": result.column_types,
            "rows": result.result_rows,
            "row_count": len(result.result_rows),
        }
    except Exception as e:
        logger.exception("ClickHouse query failed: %s", req.query)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/duckdb/query")
def execute_duckdb_query(req: DuckDBQueryRequest):
    """
    Execute a SQL query inside DuckDB.
    """
    try:
        db = get_db()
        cursor = db.execute(req.query)
        if cursor.description:
            cols = [d[0] for d in cursor.description]
            rows = cursor.fetchall()
            return {
                "columns": cols,
                "rows": [dict(zip(cols, row)) for row in rows],
                "row_count": len(rows),
            }
        return {"row_count": cursor.rowcount}
    except Exception as e:
        logger.exception("DuckDB query failed: %s", req.query)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/federated/query")
def execute_federated_query(req: FederatedQueryRequest):
    """
    Stream dataset from ClickHouse into DuckDB via zero-copy Arrow,
    and execute an analytical DuckDB query over it.
    """
    try:
        rows = query_clickhouse_with_duckdb(
            ch_query=req.clickhouse_query,
            duckdb_sql=req.duckdb_query,
            table_alias=req.table_alias,
            parameters=req.parameters,
        )
        return {
            "rows": rows,
            "row_count": len(rows),
        }
    except Exception as e:
        logger.exception("Federated query failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync")
def sync_table(req: SyncRequest):
    """
    Sync or snapshot a ClickHouse table into a DuckDB table.
    """
    try:
        synced_count = sync_clickhouse_to_duckdb(
            ch_table=req.clickhouse_table,
            target_table=req.duckdb_table,
            where_clause=req.where_clause or "",
            limit=req.limit,
        )
        dest = req.duckdb_table or req.clickhouse_table
        return {
            "status": "success",
            "synced_rows": synced_count,
            "target_table": dest,
        }
    except Exception as e:
        logger.exception("Sync failed: %s", req.clickhouse_table)
        raise HTTPException(status_code=500, detail=str(e))
