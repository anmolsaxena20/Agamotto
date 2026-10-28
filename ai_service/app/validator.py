"""
validator.py – Evidence validation (Features 9 and 19).

Dual-Engine Architecture:
- Collects every span_id, log_id, and trace_id in evidence cited by an AiAnswer.
- Checks DuckDB local analytical storage first.
- Queries ClickHouse cloud/cluster storage for unverified items or historical telemetry.
- Enforces strict multi-tenant isolation: telemetry belonging to other orgs is NEVER verified.
- Drops hallucinated and cross-tenant evidence items so no chip leads to a missing item.
- Enriches verified evidence with real telemetry attributes (duration, errors, preview, deep-link URLs).
- A hypothesis left with no valid evidence is downgraded to low confidence or removed.
- If nothing valid remains, sets insufficient_evidence = True with a clear notification banner summary.
"""

from __future__ import annotations

import logging
from typing import Set, Dict, Any, List, Optional, Tuple

import app.database
from app.database import (
    verify_spans_in_duckdb,
    verify_logs_in_duckdb,
    verify_traces_in_duckdb,
)
from app.clickhouse import (
    verify_spans_in_clickhouse,
    verify_logs_in_clickhouse,
    verify_traces_in_clickhouse,
)
from app.schemas import AiAnswer, EvidenceItem, HypothesisItem

logger = logging.getLogger(__name__)


def validate_ai_answer(
    answer: AiAnswer,
    org_id: str,
    check_clickhouse: bool = True,
) -> AiAnswer:
    """
    Validate all cited evidence in an AiAnswer against DuckDB and ClickHouse for org_id.
    
    Feature 19 Rules:
    1. Every cited span or log is checked to exist in the store (DuckDB or ClickHouse).
    2. Any cited ID that is not in the store for this org_id is removed or flagged.
    3. Verified evidence items are enriched with metadata (duration_ms, is_error, service, deep-link url).
    4. A hypothesis left with no valid evidence is downgraded to low confidence or removed.
    5. If nothing valid remains, sets insufficient_evidence = True.
    """
    total_submitted = len(answer.evidence)

    if not answer.evidence:
        # If no evidence was cited at all, mark insufficient_evidence if hypotheses were made
        if not answer.insufficient_evidence and answer.hypotheses:
            answer.insufficient_evidence = True
            answer.summary = (
                "Insufficient telemetry evidence available in the store to verify this diagnosis. "
                "No verified spans or logs could support the investigation."
            )
        answer.validation_stats = {
            "total_submitted": 0,
            "verified_count": 0,
            "dropped_count": 0,
            "sources": [],
            "downgraded_hypotheses": 0,
        }
        return answer

    # 1. Collect all distinct IDs to verify
    span_ids_to_check: list[str] = []
    log_ids_to_check: list[str] = []
    trace_ids_to_check: list[str] = []

    for ev in answer.evidence:
        if ev.kind == "span":
            if ev.span_id:
                span_ids_to_check.append(ev.span_id)
            elif ev.trace_id:
                trace_ids_to_check.append(ev.trace_id)
        elif ev.kind == "log":
            if ev.log_id:
                log_ids_to_check.append(ev.log_id)
            elif ev.span_id:
                span_ids_to_check.append(ev.span_id)
        elif ev.kind == "trace":
            if ev.trace_id:
                trace_ids_to_check.append(ev.trace_id)

    # 2. Query DuckDB
    conn = app.database.get_db()
    verified_spans: dict[str, dict] = verify_spans_in_duckdb(conn, org_id, span_ids_to_check)
    verified_logs: dict[str, dict] = verify_logs_in_duckdb(conn, org_id, log_ids_to_check)
    verified_traces: dict[str, dict] = verify_traces_in_duckdb(conn, org_id, trace_ids_to_check)

    sources_used = set()
    if verified_spans or verified_logs or verified_traces:
        sources_used.add("duckdb")

    # 3. For any IDs missing in DuckDB, check ClickHouse (Dual-Engine Fallback)
    if check_clickhouse:
        missing_spans = [sid for sid in span_ids_to_check if sid not in verified_spans]
        missing_logs = [lid for lid in log_ids_to_check if lid not in verified_logs]
        missing_traces = [tid for tid in trace_ids_to_check if tid not in verified_traces]

        if missing_spans or missing_logs or missing_traces:
            try:
                ch_spans = verify_spans_in_clickhouse(org_id, missing_spans)
                if ch_spans:
                    verified_spans.update(ch_spans)
                    sources_used.add("clickhouse")

                ch_logs = verify_logs_in_clickhouse(org_id, missing_logs)
                if ch_logs:
                    verified_logs.update(ch_logs)
                    sources_used.add("clickhouse")

                ch_traces = verify_traces_in_clickhouse(org_id, missing_traces)
                if ch_traces:
                    verified_traces.update(ch_traces)
                    sources_used.add("clickhouse")
            except Exception as ch_err:
                logger.warning("ClickHouse verification error: %s", ch_err)

    # 4. Filter and enrich evidence items
    validated_evidence: list[EvidenceItem] = []
    valid_evidence_ids: Set[str] = set()

    for ev in answer.evidence:
        meta: Optional[dict] = None
        is_valid = False

        if ev.kind == "span":
            if ev.span_id and ev.span_id in verified_spans:
                meta = verified_spans[ev.span_id]
                is_valid = True
            elif ev.trace_id and not ev.span_id and ev.trace_id in verified_traces:
                meta = verified_traces[ev.trace_id]
                is_valid = True
        elif ev.kind == "log":
            if ev.log_id and ev.log_id in verified_logs:
                meta = verified_logs[ev.log_id]
                is_valid = True
            elif ev.span_id and ev.span_id in verified_spans:
                meta = verified_spans[ev.span_id]
                is_valid = True
        elif ev.kind == "trace":
            if ev.trace_id and ev.trace_id in verified_traces:
                meta = verified_traces[ev.trace_id]
                is_valid = True

        if is_valid and meta:
            # Enrich item with real store metadata
            ev.status = "verified"
            ev.source = meta.get("source", "duckdb")

            if meta.get("service_name") and not ev.service_name:
                ev.service_name = meta.get("service_name")

            if meta.get("span_name") and not ev.span_name:
                ev.span_name = meta.get("span_name")

            if meta.get("duration_ms") is not None and ev.duration_ms is None:
                ev.duration_ms = meta.get("duration_ms")

            if meta.get("is_error") is not None and ev.is_error is None:
                ev.is_error = meta.get("is_error")

            if meta.get("timestamp") and not ev.timestamp:
                ev.timestamp = meta.get("timestamp")

            # Generate deep-link URL (Feature 14 & 19 click-through)
            t_id = ev.trace_id or meta.get("trace_id")
            s_id = ev.span_id or meta.get("span_id")
            l_id = ev.log_id or meta.get("log_id")

            if ev.kind == "span" and t_id and s_id:
                ev.url = f"/traces/{t_id}?span={s_id}"
                ev.preview = f"[{ev.service_name or 'span'}] {ev.span_name or 'operation'} ({ev.duration_ms or 0}ms)"
            elif ev.kind == "log":
                if t_id and s_id:
                    ev.url = f"/traces/{t_id}?span={s_id}"
                elif l_id:
                    ev.url = f"/logs?log_id={l_id}"
                ev.preview = f"[{ev.service_name or 'log'}] {meta.get('severity_text', 'LOG')}: {meta.get('body', ev.label)[:80]}"
            elif ev.kind == "trace" and t_id:
                ev.url = f"/traces/{t_id}"
                ev.preview = f"Trace {t_id[:12]} ({meta.get('span_count', 1)} spans)"

            validated_evidence.append(ev)
            valid_evidence_ids.add(ev.evidence_id)
        else:
            logger.info("Feature 19 Validator dropped unverified/cross-tenant evidence: %s", ev)

    answer.evidence = validated_evidence

    # 5. Clean up hypotheses referencing dropped evidence
    validated_hypotheses: list[HypothesisItem] = []
    downgraded_count = 0

    for hyp in answer.hypotheses:
        remaining_eids = [eid for eid in hyp.evidence_ids if eid in valid_evidence_ids]
        if not remaining_eids:
            # A hypothesis left with no valid evidence is downgraded to low confidence or removed
            if hyp.confidence != "low":
                hyp.confidence = "low"
                hyp.evidence_ids = []
                hyp.verified = False
                validated_hypotheses.append(hyp)
                downgraded_count += 1
            else:
                # If already low confidence and zero valid evidence, discard it
                pass
        else:
            hyp.evidence_ids = remaining_eids
            hyp.verified = False
            validated_hypotheses.append(hyp)

    answer.hypotheses = validated_hypotheses

    # 6. Check if anything valid remains
    if not answer.evidence:
        answer.insufficient_evidence = True
        if "insufficient" not in answer.summary.lower():
            answer.summary = (
                "Insufficient telemetry evidence available in the store to verify this diagnosis. "
                "No verified spans or logs could support the investigation."
            )

    # 7. Record validation statistics
    answer.validation_stats = {
        "total_submitted": total_submitted,
        "verified_count": len(validated_evidence),
        "dropped_count": total_submitted - len(validated_evidence),
        "sources": sorted(list(sources_used)),
        "downgraded_hypotheses": downgraded_count,
    }

    return answer


def verify_single_evidence_item(
    org_id: str,
    kind: str,
    item_id: str,
    check_clickhouse: bool = True,
) -> dict[str, Any]:
    """
    Verify a single span_id, log_id, or trace_id for org_id.
    Returns status dict with metadata and direct navigation URL.
    """
    conn = app.database.get_db()
    kind = kind.lower()

    if kind == "span":
        res = verify_spans_in_duckdb(conn, org_id, [item_id])
        if not res and check_clickhouse:
            res = verify_spans_in_clickhouse(org_id, [item_id])
        if item_id in res:
            m = res[item_id]
            t_id = m.get("trace_id")
            return {
                "verified": True,
                "kind": "span",
                "item_id": item_id,
                "source": m.get("source"),
                "details": m,
                "url": f"/traces/{t_id}?span={item_id}" if t_id else f"/spans?span_id={item_id}",
                "preview": f"[{m.get('service_name')}] {m.get('span_name')} ({m.get('duration_ms')}ms)",
            }

    elif kind == "log":
        res = verify_logs_in_duckdb(conn, org_id, [item_id])
        if not res and check_clickhouse:
            res = verify_logs_in_clickhouse(org_id, [item_id])
        if item_id in res:
            m = res[item_id]
            t_id = m.get("trace_id")
            s_id = m.get("span_id")
            return {
                "verified": True,
                "kind": "log",
                "item_id": item_id,
                "source": m.get("source"),
                "details": m,
                "url": f"/traces/{t_id}?span={s_id}" if t_id and s_id else f"/logs?log_id={item_id}",
                "preview": f"[{m.get('service_name')}] {m.get('body')[:80]}",
            }

    elif kind == "trace":
        res = verify_traces_in_duckdb(conn, org_id, [item_id])
        if not res and check_clickhouse:
            res = verify_traces_in_clickhouse(org_id, [item_id])
        if item_id in res:
            m = res[item_id]
            return {
                "verified": True,
                "kind": "trace",
                "item_id": item_id,
                "source": m.get("source"),
                "details": m,
                "url": f"/traces/{item_id}",
                "preview": f"Trace {item_id[:12]} ({m.get('service_name', 'trace')})",
            }

    return {
        "verified": False,
        "kind": kind,
        "item_id": item_id,
        "source": None,
        "details": None,
        "url": None,
        "preview": None,
    }
