"""
evidence.py – Router for Feature 19: Clickable Evidence in AI Answers.

Endpoints:
- POST /evidence/validate: Validates an AI answer or evidence list against DuckDB & ClickHouse.
- GET /evidence/check/{kind}/{item_id}: Verifies a single span, log, or trace ID with metadata & deep-link URL.
- GET /evidence/health: Checks connectivity and readiness of DuckDB and ClickHouse telemetry stores.
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import get_current_org
from app.database import get_db
from app.clickhouse import get_ch_client
from app.schemas import (
    AiAnswer,
    EvidenceItem,
    ValidateEvidenceRequest,
    ValidateEvidenceResponse,
    SingleEvidenceVerificationResponse,
)
from app.validator import validate_ai_answer, verify_single_evidence_item

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/evidence", tags=["evidence-validation"])


@router.post("/validate", response_model=ValidateEvidenceResponse)
async def validate_evidence_endpoint(
    payload: ValidateEvidenceRequest,
    auth: dict = Depends(get_current_org),
):
    """
    POST /evidence/validate – Feature 19 Evidence Validator.

    Validates every span_id, log_id, and trace_id in cited evidence against
    DuckDB and ClickHouse for the tenant's org_id.
    
    Rules enforced:
    - Drops hallucinated and cross-tenant evidence items.
    - Enriches verified evidence items with real store attributes (latency, errors, deep-link url).
    - Downgrades or removes hypotheses left with no valid evidence.
    - If nothing valid remains, sets insufficient_evidence = True.
    """
    org_id = auth["org_id"]

    if payload.answer:
        answer_to_validate = payload.answer
    else:
        answer_to_validate = AiAnswer(
            summary=payload.summary or "Evidence verification request.",
            insufficient_evidence=False,
            evidence=payload.evidence or [],
            hypotheses=payload.hypotheses or [],
            next_steps=[],
        )

    validated_answer = validate_ai_answer(answer_to_validate, org_id)

    return ValidateEvidenceResponse(
        answer=validated_answer,
        stats=validated_answer.validation_stats or {},
    )


@router.get("/check/{kind}/{item_id}", response_model=SingleEvidenceVerificationResponse)
async def check_single_evidence(
    kind: str,
    item_id: str,
    check_clickhouse: bool = Query(default=True, description="Query ClickHouse if not found in DuckDB"),
    auth: dict = Depends(get_current_org),
):
    """
    GET /evidence/check/{kind}/{item_id} – Single ID telemetry verification.
    kind: 'span' | 'log' | 'trace'
    """
    org_id = auth["org_id"]
    if kind not in ("span", "log", "trace"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid kind '{kind}'. Must be 'span', 'log', or 'trace'.",
        )

    result = verify_single_evidence_item(
        org_id=org_id,
        kind=kind,
        item_id=item_id,
        check_clickhouse=check_clickhouse,
    )

    return SingleEvidenceVerificationResponse(
        kind=kind,
        item_id=item_id,
        verified=result["verified"],
        source=result.get("source"),
        details=result.get("details"),
        preview=result.get("preview"),
        url=result.get("url"),
    )


@router.get("/health")
async def evidence_store_health(auth: dict = Depends(get_current_org)):
    """
    GET /evidence/health – Dual-Engine Health Check.
    Reports operational readiness of DuckDB and ClickHouse for the organization.
    """
    org_id = auth["org_id"]

    # DuckDB check
    duckdb_status = "ok"
    duckdb_spans = 0
    duckdb_logs = 0
    try:
        conn = get_db()
        r1 = conn.execute("SELECT count(*) FROM spans WHERE org_id = ?", [org_id]).fetchone()
        duckdb_spans = r1[0] if r1 else 0
        r2 = conn.execute("SELECT count(*) FROM logs WHERE org_id = ?", [org_id]).fetchone()
        duckdb_logs = r2[0] if r2 else 0
    except Exception as e:
        duckdb_status = f"error: {e}"

    # ClickHouse check
    clickhouse_status = "unavailable"
    clickhouse_spans = 0
    try:
        ch_client = get_ch_client()
        res = ch_client.command("SELECT 1")
        if res == 1:
            clickhouse_status = "ok"
            try:
                ch_cnt = ch_client.query(
                    "SELECT count() FROM agamotto_telemetry.trace_spans WHERE (toString(organization_id) = {org_id:String} OR organization_id = toUUIDOrDefault({org_id:String}, '00000000-0000-0000-0000-000000000000'))",
                    parameters={"org_id": org_id},
                )
                clickhouse_spans = ch_cnt.result_rows[0][0] if ch_cnt.result_rows else 0
            except Exception:
                pass
    except Exception as e:
        clickhouse_status = f"error: {e}"

    return {
        "status": "ok" if duckdb_status == "ok" else "degraded",
        "org_id": org_id,
        "engines": {
            "duckdb": {
                "status": duckdb_status,
                "spans_count": duckdb_spans,
                "logs_count": duckdb_logs,
            },
            "clickhouse": {
                "status": clickhouse_status,
                "spans_count": clickhouse_spans,
            },
        },
    }
