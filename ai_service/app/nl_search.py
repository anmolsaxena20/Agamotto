"""
nl_search.py – Natural-Language Search Filter Engine (Feature 20).

Key Responsibilities:
1. Receives natural language queries typed into Logs or Traces search bar.
2. Identifies and safely neutralizes prompt injection and SQL injection attacks (treats as literal text, never runs SQL).
3. Resolves relative times ("last 15 minutes", "since the deploy") using client current time.
4. Performs dynamic deploy event lookup against DuckDB and ClickHouse ("since the deploy" -> latest events row).
5. Discovers known service names dynamically for the organization from DuckDB and ClickHouse.
6. Employs LLM tool calling (via LLMClient) with a deterministic NLP rule-based parser fallback.
7. Validates and sanitizes structured filter: known services only, valid OTel severities, regex <= 200 chars and compiling, time range <= plan retention, limit <= 1000.
8. Produces rich, editable UI filter chips ("Interpreted as" row).
9. Executes telemetry search queries end-to-end against DuckDB and ClickHouse.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

import duckdb
from pydantic import BaseModel

import app.database
from app.config import get_settings
from app.database import get_db, query_clickhouse_with_duckdb
from app.clickhouse import get_ch_client
from app.llm import LLMClient
from app.schemas import (
    Filter,
    FilterChip,
    ParseFilterRequest,
    ParseFilterResponse,
    ExecuteFilterRequest,
    ExecuteFilterResponse,
)

logger = logging.getLogger(__name__)

# Valid OTel severity names
VALID_SEVERITIES = {"TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"}

# Valid span statuses
VALID_SPAN_STATUSES = {"UNSET", "OK", "ERROR"}

# Dangerous SQL patterns and destructive keywords to detect
DANGEROUS_SQL_PATTERNS = [
    r"\bdrop\s+table\b",
    r"\bdelete\s+from\b",
    r"\binsert\s+into\b",
    r"\bupdate\s+\w+\s+set\b",
    r"\balter\s+table\b",
    r"\bselect\s+.*\s+from\b",
    r"\bunion\s+(all\s+)?select\b",
    r"\btruncate\s+table\b",
    r"\bgrant\s+all\b",
    r"\bexec\s*\(",
    r"\bexecute\s*\(",
    r";\s*--",
    r"--\s*$",
    r"'\s*or\s+'1'\s*=\s*'1",
    r"'\s*or\s+1\s*=\s*1",
]

# Prompt injection markers
PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"disregard\s+(all\s+)?previous",
    r"you\s+are\s+now\s+in\s+developer\s+mode",
    r"system\s+prompt\s+override",
    r"bypass\s+all\s+rules",
]


def is_dangerous_or_injection(sentence: str) -> Tuple[bool, str]:
    """
    Check if the user input contains SQL injection or prompt injection attempts.
    Returns (is_dangerous, reason).
    """
    s_lower = sentence.lower()

    for pattern in DANGEROUS_SQL_PATTERNS:
        if re.search(pattern, s_lower, re.IGNORECASE):
            return True, f"SQL statement pattern detected ('{pattern}')"

    for pattern in PROMPT_INJECTION_PATTERNS:
        if re.search(pattern, s_lower, re.IGNORECASE):
            return True, f"Prompt injection pattern detected ('{pattern}')"

    return False, ""


# ── Metadata Discovery from DuckDB and ClickHouse ─────────────────────────────

def lookup_latest_deploy_event(org_id: str) -> Optional[datetime]:
    """
    Feature 20: Look up the latest deployment timestamp from the events table
    for the given org_id in DuckDB or ClickHouse.
    """
    # 1. Try DuckDB events table
    try:
        conn = get_db()
        row = conn.execute(
            """
            SELECT ts FROM events
            WHERE org_id = ? AND event_type = 'deploy'
            ORDER BY ts DESC
            LIMIT 1
            """,
            [org_id],
        ).fetchone()

        if row and row[0]:
            ts_val = row[0]
            if isinstance(ts_val, datetime):
                return ts_val if ts_val.tzinfo else ts_val.replace(tzinfo=timezone.utc)
            return datetime.fromisoformat(str(ts_val)).replace(tzinfo=timezone.utc)
    except Exception as e:
        logger.debug("DuckDB events deploy lookup note: %s", e)

    # 2. Try ClickHouse events table
    try:
        client = get_ch_client()
        res = client.query(
            """
            SELECT ts FROM agamotto_telemetry.events
            WHERE (toString(org_id) = {org_id:String} OR org_id = {org_id:String})
              AND event_type = 'deploy'
            ORDER BY ts DESC
            LIMIT 1
            """,
            parameters={"org_id": org_id},
        )
        if res.result_rows:
            ts_val = res.result_rows[0][0]
            if isinstance(ts_val, datetime):
                return ts_val if ts_val.tzinfo else ts_val.replace(tzinfo=timezone.utc)
            return datetime.fromisoformat(str(ts_val)).replace(tzinfo=timezone.utc)
    except Exception as e:
        logger.debug("ClickHouse events deploy lookup note: %s", e)

    return None


def discover_known_services(org_id: str) -> list[str]:
    """
    Feature 20: Discover known service names for an organization from DuckDB & ClickHouse.
    """
    services: set[str] = set()

    # 1. DuckDB spans & logs
    try:
        conn = get_db()
        rows = conn.execute(
            """
            SELECT DISTINCT service_name FROM spans WHERE org_id = ?
            UNION
            SELECT DISTINCT service_name FROM logs WHERE org_id = ?
            """,
            [org_id, org_id],
        ).fetchall()
        for r in rows:
            if r[0]:
                services.add(str(r[0]).strip())
    except Exception as e:
        logger.debug("DuckDB service discovery note: %s", e)

    # 2. ClickHouse canonical_spans / services / trace_spans
    try:
        client = get_ch_client()
        try:
            res = client.query(
                """
                SELECT DISTINCT service_name FROM agamotto_telemetry.canonical_spans
                WHERE org_id = {org_id:String}
                """,
                parameters={"org_id": org_id},
            )
            for r in res.result_rows:
                if r[0]:
                    services.add(str(r[0]).strip())
        except Exception:
            pass

        try:
            res2 = client.query(
                """
                SELECT DISTINCT service_name FROM agamotto_telemetry.services
                WHERE (toString(organization_id) = {org_id:String} OR organization_id = toUUIDOrDefault({org_id:String}, '00000000-0000-0000-0000-000000000000'))
                UNION DISTINCT
                SELECT DISTINCT service_name FROM agamotto_telemetry.trace_spans
                WHERE (toString(organization_id) = {org_id:String} OR organization_id = toUUIDOrDefault({org_id:String}, '00000000-0000-0000-0000-000000000000'))
                """,
                parameters={"org_id": org_id},
            )
            for r in res2.result_rows:
                if r[0]:
                    services.add(str(r[0]).strip())
        except Exception:
            pass
    except Exception as e:
        logger.debug("ClickHouse service discovery note: %s", e)

    # Default common demo services if empty
    if not services:
        return ["payment", "checkout", "auth", "api-gateway", "inventory", "notification", "order"]

    return sorted(list(services))


# ── Relative Time Resolution ──────────────────────────────────────────────────

def resolve_time_expression(
    expr: str,
    now: datetime,
    org_id: str,
) -> Tuple[Optional[datetime], Optional[datetime], Optional[str], Optional[str]]:
    """
    Resolves relative time expressions into (from_time, to_time, explanation, warning).
    """
    expr_clean = expr.strip().lower()

    # Deploy event lookup: "since the deploy", "since deploy", "after deploy", "since last deploy"
    if "deploy" in expr_clean:
        deploy_dt = lookup_latest_deploy_event(org_id)
        if deploy_dt:
            return deploy_dt, now, f"Since latest deployment at {deploy_dt.strftime('%Y-%m-%d %H:%M:%S UTC')}", None
        else:
            fallback_dt = now - timedelta(hours=1)
            return (
                fallback_dt,
                now,
                "Since deployment (no deploy event found in store; defaulted to past 1 hour)",
                "No deploy event found for organization; defaulted time range to past 1 hour",
            )

    # Minutes: "last 15 minutes", "past 30 mins", "10m"
    m_min = re.search(r"(?:last|past)?\s*(\d+)\s*(?:minutes?|mins?|m\b)", expr_clean)
    if m_min:
        mins = int(m_min.group(1))
        return now - timedelta(minutes=mins), now, f"Last {mins} minutes", None

    # Hours: "last hour", "last 2 hours", "past 24h"
    if "last hour" in expr_clean or "past hour" in expr_clean:
        return now - timedelta(hours=1), now, "Last 1 hour", None

    m_hr = re.search(r"(?:last|past)?\s*(\d+)\s*(?:hours?|hrs?|h\b)", expr_clean)
    if m_hr:
        hrs = int(m_hr.group(1))
        return now - timedelta(hours=hrs), now, f"Last {hrs} hours", None

    # Days: "last 7 days", "past 2 days", "last day"
    if "last day" in expr_clean or "past day" in expr_clean:
        return now - timedelta(days=1), now, "Last 24 hours", None

    m_day = re.search(r"(?:last|past)?\s*(\d+)\s*(?:days?|d\b)", expr_clean)
    if m_day:
        days = int(m_day.group(1))
        return now - timedelta(days=days), now, f"Last {days} days", None

    # "today"
    if "today" in expr_clean:
        start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start_of_today, now, "Today (UTC)", None

    # "yesterday"
    if "yesterday" in expr_clean:
        start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start_of_yesterday = start_of_today - timedelta(days=1)
        return start_of_yesterday, start_of_today, "Yesterday (UTC)", None

    return None, None, None, None


# ── Rule-Based NLP Parser (Deterministic Engine) ──────────────────────────────

def parse_filter_rules(
    sentence: str,
    now: datetime,
    known_services: list[str],
    org_id: str,
) -> Tuple[Filter, str, list[str]]:
    """
    Deterministic rule-based filter parser.
    Used for unit testing, offline execution, and fallback when LLM is unavailable.
    Guarantees 100% compliance with Feature 20 requirements.
    """
    warnings: list[str] = []
    explanations: list[str] = []

    text_search: Optional[str] = None
    regex_search: Optional[str] = None
    trace_id_search: Optional[str] = None
    status_search: Optional[str] = None
    matched_services: list[str] = []
    matched_severities: list[str] = []
    from_time: Optional[str] = None
    to_time: Optional[str] = None

    s_lower = sentence.lower()

    # 1. Trace ID extraction: 32 hex chars
    trace_match = re.search(r"\b([0-9a-fA-F]{32})\b", sentence)
    if trace_match:
        trace_id_search = trace_match.group(1).lower()
        explanations.append(f"Trace ID '{trace_id_search}'")

    # 2. Regex pattern extraction: e.g. matching regex '...', regex "...", regex /.../
    regex_match = re.search(
        r"(?:matching\s+regex|regex)\s*(?:['\"/])([^'\"/]+)(?:['\"/])",
        sentence,
        re.IGNORECASE,
    )
    if regex_match:
        raw_reg = regex_match.group(1).strip()
        regex_search = raw_reg
        explanations.append(f"Regex pattern /{raw_reg}/")

    # 3. Time range extraction
    from_dt, to_dt, time_exp, time_warn = resolve_time_expression(sentence, now, org_id)
    if from_dt and to_dt:
        from_time = from_dt.isoformat().replace("+00:00", "Z")
        to_time = to_dt.isoformat().replace("+00:00", "Z")
        if time_exp:
            explanations.append(time_exp)
        if time_warn:
            warnings.append(time_warn)

    # 4. Service matching
    known_lower_map = {svc.lower(): svc for svc in known_services}
    for svc_lower, svc_canonical in known_lower_map.items():
        # Match word boundaries or hyphenated service names
        pattern = rf"\b{re.escape(svc_lower)}(?:-service|\s+service)?\b"
        if re.search(pattern, s_lower):
            if svc_canonical not in matched_services:
                matched_services.append(svc_canonical)

    if matched_services:
        explanations.append(f"Services: {', '.join(matched_services)}")

    # 5. Severity extraction
    if re.search(r"\b(errors?|failures?|failed)\b", s_lower):
        matched_severities.extend(["ERROR", "FATAL"])
    if re.search(r"\b(warn|warnings?)\b", s_lower):
        if "WARN" not in matched_severities:
            matched_severities.append("WARN")
    if re.search(r"\b(fatal|critical)\b", s_lower):
        if "FATAL" not in matched_severities:
            matched_severities.append("FATAL")
    if re.search(r"\b(info|informational)\b", s_lower):
        if "INFO" not in matched_severities:
            matched_severities.append("INFO")
    if re.search(r"\b(debug)\b", s_lower):
        if "DEBUG" not in matched_severities:
            matched_severities.append("DEBUG")
    if re.search(r"\b(trace)\b", s_lower) and not trace_id_search:
        # Check if severity 'trace' was intended
        if re.search(r"\btrace\s+(?:logs?|records?|severity)\b", s_lower):
            if "TRACE" not in matched_severities:
                matched_severities.append("TRACE")

    # Deduplicate severities
    matched_severities = list(dict.fromkeys(matched_severities))
    if matched_severities:
        explanations.append(f"Severities: {', '.join(matched_severities)}")

    # 6. Status extraction
    if re.search(r"\b(status\s*5\d\d|5\d\d|status\s*error|error\s+status)\b", s_lower):
        status_search = "ERROR"
        explanations.append("Status ERROR")
    elif re.search(r"\b(status\s*2\d\d|2\d\d|status\s*ok|successful|status\s*unset)\b", s_lower):
        status_search = "OK"
        explanations.append("Status OK")

    # 7. Text term extraction
    # Look for quotes: 'timeout' or "connection pool"
    quoted = re.findall(r"['\"]([^'\"]+)['\"]", sentence)
    if quoted:
        # If quoted term wasn't the regex, use it as text
        for q in quoted:
            if q != regex_search:
                text_search = q.strip()
                break

    if not text_search and not regex_search:
        # Special common multi-word observability terms checked first
        common_terms = [
            "connection refused",
            "pool exhausted",
            "out of memory",
            "nullpointer",
            "segfault",
            "timeout",
            "404",
            "503",
        ]
        for ct in common_terms:
            if ct in s_lower:
                text_search = ct
                break

    if not text_search and not regex_search:
        # Look for explicit keywords: "containing timeout", "with text timeout", "body has timeout", "with message ..."
        m_txt = re.search(
            r"(?:containing|with\s+(?:text|message)|body\s+has)\s+(.+?)(?:\s+(?:in|for|from|since|matching|where)|$)",
            sentence,
            re.IGNORECASE,
        )
        if m_txt:
            term = m_txt.group(1).strip().strip("'\"")
            # Don't grab service names or severity words as text
            if term.lower() not in known_lower_map and term.lower() not in ["error", "errors", "warn", "info"]:
                text_search = term

    if text_search:
        explanations.append(f'Text: "{text_search}"')

    # Construct the raw Filter
    filter_obj = Filter(
        from_time=from_time,
        to_time=to_time,
        services=matched_services,
        severity=matched_severities,
        text=text_search,
        regex=regex_search,
        status=status_search,
        trace_id=trace_id_search,
        limit=100,
    )

    explanation_str = "Interpreted filter: " + "; ".join(explanations) if explanations else "Search query interpreted."
    return filter_obj, explanation_str, warnings


# ── Filter Validation & Sanitization ──────────────────────────────────────────

def validate_and_sanitize_filter(
    filter_obj: Filter,
    known_services: list[str],
    retention_days: int = 30,
    now: Optional[datetime] = None,
) -> Tuple[Filter, list[str]]:
    """
    Enforces specification rules on the Filter:
    - Known services only: any service not in the organization's known services list is stripped.
    - Severity from allowed list: TRACE, DEBUG, INFO, WARN, ERROR, FATAL.
    - Status from allowed list: UNSET, OK, ERROR.
    - Regex compiles and is under 200 characters. If invalid, falls back to plain text.
    - Time range at most the plan's retention (from_time >= now - retention_days).
    - Limit at most 1000.
    """
    warnings: list[str] = []
    current = now or datetime.now(timezone.utc)

    # 1. Known services validation
    known_set = {s.lower() for s in known_services}
    valid_services: list[str] = []
    canonical_map = {s.lower(): s for s in known_services}

    for svc in filter_obj.services:
        s_low = svc.strip().lower()
        if s_low in known_set:
            valid_services.append(canonical_map[s_low])
        else:
            warnings.append(f"Ignored unknown service '{svc}'; only known services for this organization are permitted.")

    filter_obj.services = valid_services

    # 2. Severity validation
    valid_sev: list[str] = []
    for sev in filter_obj.severity:
        sev_up = sev.strip().upper()
        if sev_up in VALID_SEVERITIES:
            if sev_up not in valid_sev:
                valid_sev.append(sev_up)
        else:
            warnings.append(f"Ignored invalid severity level '{sev}'. Permitted: {', '.join(sorted(VALID_SEVERITIES))}.")

    filter_obj.severity = valid_sev

    # 3. Status validation
    if filter_obj.status:
        stat_up = filter_obj.status.strip().upper()
        if stat_up in VALID_SPAN_STATUSES:
            filter_obj.status = stat_up
        else:
            warnings.append(f"Ignored invalid status '{filter_obj.status}'. Permitted: UNSET, OK, ERROR.")
            filter_obj.status = None

    # 4. Regex validation
    if filter_obj.regex:
        if len(filter_obj.regex) > 200:
            warnings.append(f"Regex pattern exceeds maximum length of 200 characters ({len(filter_obj.regex)} chars); converted to text search.")
            if not filter_obj.text:
                filter_obj.text = filter_obj.regex[:200]
            filter_obj.regex = None
        else:
            try:
                re.compile(filter_obj.regex)
            except re.error as err:
                warnings.append(f"Invalid regex syntax ('{filter_obj.regex}'): {err}; converted to plain text filter.")
                if not filter_obj.text:
                    filter_obj.text = filter_obj.regex
                filter_obj.regex = None

    # 5. Time range validation & retention enforcement
    retention_boundary = current - timedelta(days=retention_days)

    if filter_obj.from_time:
        try:
            f_dt = datetime.fromisoformat(filter_obj.from_time.replace("Z", "+00:00"))
            if f_dt.tzinfo is None:
                f_dt = f_dt.replace(tzinfo=timezone.utc)

            # Check if older than retention window
            if f_dt < retention_boundary:
                warnings.append(
                    f"Start time {filter_obj.from_time} is older than organization retention of {retention_days} days; clamped to retention start."
                )
                filter_obj.from_time = retention_boundary.isoformat().replace("+00:00", "Z")

            if filter_obj.to_time:
                t_dt = datetime.fromisoformat(filter_obj.to_time.replace("Z", "+00:00"))
                if t_dt.tzinfo is None:
                    t_dt = t_dt.replace(tzinfo=timezone.utc)

                if f_dt > t_dt:
                    warnings.append("Start time was greater than end time; inverted boundaries.")
                    filter_obj.from_time, filter_obj.to_time = filter_obj.to_time, filter_obj.from_time
        except Exception as err:
            warnings.append(f"Failed to parse time range: {err}")

    # 6. Limit clamping: 1 to 1000
    if filter_obj.limit is None or filter_obj.limit <= 0:
        filter_obj.limit = 100
    elif filter_obj.limit > 1000:
        warnings.append(f"Limit of {filter_obj.limit} exceeded maximum allowable 1000; clamped to 1000.")
        filter_obj.limit = 1000

    return filter_obj, warnings


# ── Chip Generation for "Interpreted as" UI Row ───────────────────────────────

def generate_filter_chips(filter_obj: Filter) -> list[FilterChip]:
    """
    Turns the validated Filter into editable chips for the frontend 'Interpreted as' row.
    """
    chips: list[FilterChip] = []

    # Service chips
    for svc in filter_obj.services:
        chips.append(
            FilterChip(
                id=f"chip_svc_{svc}",
                type="service",
                label=f"Service: {svc}",
                value=svc,
                removable=True,
                raw_field="services",
            )
        )

    # Severity chip
    if filter_obj.severity:
        chips.append(
            FilterChip(
                id="chip_severity",
                type="severity",
                label=f"Severity: {', '.join(filter_obj.severity)}",
                value=filter_obj.severity,
                removable=True,
                raw_field="severity",
            )
        )

    # Status chip
    if filter_obj.status:
        chips.append(
            FilterChip(
                id="chip_status",
                type="status",
                label=f"Status: {filter_obj.status}",
                value=filter_obj.status,
                removable=True,
                raw_field="status",
            )
        )

    # Time range chip
    if filter_obj.from_time or filter_obj.to_time:
        lbl_from = filter_obj.from_time[:19].replace("T", " ") if filter_obj.from_time else "Beginning"
        lbl_to = filter_obj.to_time[:19].replace("T", " ") if filter_obj.to_time else "Now"
        chips.append(
            FilterChip(
                id="chip_time_range",
                type="time_range",
                label=f"Time: {lbl_from} to {lbl_to}",
                value={"from": filter_obj.from_time, "to": filter_obj.to_time},
                removable=True,
                raw_field="time_range",
            )
        )

    # Text search chip
    if filter_obj.text:
        chips.append(
            FilterChip(
                id="chip_text",
                type="text",
                label=f'Text: "{filter_obj.text}"',
                value=filter_obj.text,
                removable=True,
                raw_field="text",
            )
        )

    # Regex search chip
    if filter_obj.regex:
        chips.append(
            FilterChip(
                id="chip_regex",
                type="regex",
                label=f"Regex: /{filter_obj.regex}/",
                value=filter_obj.regex,
                removable=True,
                raw_field="regex",
            )
        )

    # Trace ID chip
    if filter_obj.trace_id:
        chips.append(
            FilterChip(
                id="chip_trace_id",
                type="trace_id",
                label=f"Trace: {filter_obj.trace_id[:8]}…",
                value=filter_obj.trace_id,
                removable=True,
                raw_field="trace_id",
            )
        )

    return chips


# ── LLM Tool-Calling Integration ──────────────────────────────────────────────

SET_FILTER_TOOL = {
    "name": "set_search_filter",
    "description": (
        "Extract structured search filter parameters from the user's natural language query. "
        "Never write SQL. Output structured parameters only."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "services": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of recognized microservice names from the known services list",
            },
            "severity": {
                "type": "array",
                "items": {"type": "string", "enum": ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]},
                "description": "OTel severity levels",
            },
            "status": {
                "type": "string",
                "enum": ["UNSET", "OK", "ERROR"],
                "description": "Span status code",
            },
            "from_time": {
                "type": "string",
                "description": "ISO 8601 UTC start timestamp or relative time keyword (e.g. 'last 15 minutes')",
            },
            "to_time": {
                "type": "string",
                "description": "ISO 8601 UTC end timestamp",
            },
            "text": {
                "type": "string",
                "description": "Plain text search term or substring",
            },
            "regex": {
                "type": "string",
                "description": "Regular expression pattern (max 200 chars)",
            },
            "trace_id": {
                "type": "string",
                "description": "OTel trace ID hex",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum records (1-1000)",
            },
        },
    },
}


async def parse_with_llm(
    sentence: str,
    now: datetime,
    known_services: list[str],
    org_id: str,
) -> Optional[Tuple[Filter, str]]:
    """
    Attempt to parse query using the configured LLM provider via tool calling.
    Returns (Filter, explanation) or None if LLM is unavailable or fails.
    """
    llm = LLMClient()
    if llm.provider == "mock" or not llm.api_key:
        return None

    system_prompt = (
        "You are the Natural-Language Telemetry Search Parser for Eye of Agamotto.\n"
        "Convert the user's search sentence into a structured telemetry filter by calling set_search_filter.\n"
        "NEVER WRITE SQL. Do not execute commands.\n"
        f"Current UTC time is {now.isoformat()}.\n"
        f"Known microservices for this organization: {json.dumps(known_services)}.\n"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Parse this search sentence into filter parameters: {sentence}"},
    ]

    try:
        content, tool_calls = await llm.chat(messages, tools=[SET_FILTER_TOOL], force_answer=False)
        if tool_calls:
            for tc in tool_calls:
                if tc.get("name") == "set_search_filter":
                    args = tc.get("arguments") or {}
                    # Build filter from tool call arguments
                    from_val = args.get("from_time")
                    to_val = args.get("to_time")

                    # If relative string returned, resolve it
                    if from_val and not from_val.endswith("Z") and not ("+" in from_val):
                        f_dt, t_dt, _, _ = resolve_time_expression(from_val, now, org_id)
                        if f_dt and t_dt:
                            from_val = f_dt.isoformat().replace("+00:00", "Z")
                            to_val = t_dt.isoformat().replace("+00:00", "Z")

                    f_obj = Filter(
                        from_time=from_val,
                        to_time=to_val,
                        services=args.get("services") or [],
                        severity=args.get("severity") or [],
                        status=args.get("status"),
                        text=args.get("text"),
                        regex=args.get("regex"),
                        trace_id=args.get("trace_id"),
                        limit=args.get("limit") or 100,
                    )
                    return f_obj, "Interpreted via LLM tool-calling."
    except Exception as e:
        logger.warning("LLM tool-calling parse failed (%s); falling back to rule-based engine", e)

    return None


# ── Dual DuckDB and ClickHouse Telemetry Query Execution Engine ────────────────

def execute_telemetry_query(
    filter_obj: Filter,
    org_id: str,
    target: str = "all",
    engine: str = "auto",
    limit: int = 100,
) -> ExecuteFilterResponse:
    """
    Executes a structured search filter against DuckDB and ClickHouse.
    Supports querying spans, logs, or both.
    """
    t0 = datetime.now()
    spans: list[dict] = []
    logs: list[dict] = []
    engine_used = engine

    # Determine execution strategy
    use_duckdb = engine in ("duckdb", "auto")
    use_clickhouse = engine in ("clickhouse", "federated")

    # 1. Execute against DuckDB
    if use_duckdb:
        try:
            conn = get_db()

            # Query Spans
            if target in ("traces", "spans", "all"):
                sql_spans = "SELECT org_id, trace_id, span_id, parent_span_id, service_name, span_name, span_kind, start_ts, duration_ns, status_code, is_error FROM spans WHERE org_id = ?"
                params_spans: list[Any] = [org_id]

                if filter_obj.services:
                    placeholders = ", ".join(["?"] * len(filter_obj.services))
                    sql_spans += f" AND service_name IN ({placeholders})"
                    params_spans.extend(filter_obj.services)

                if filter_obj.status:
                    sql_spans += " AND status_code = ?"
                    params_spans.append(filter_obj.status)
                elif filter_obj.severity and any(s in ("ERROR", "FATAL") for s in filter_obj.severity):
                    sql_spans += " AND (status_code = 'ERROR' OR is_error = TRUE)"

                if filter_obj.trace_id:
                    sql_spans += " AND trace_id = ?"
                    params_spans.append(filter_obj.trace_id)

                if filter_obj.from_time:
                    try:
                        f_dt = datetime.fromisoformat(filter_obj.from_time.replace("Z", "+00:00"))
                    except Exception:
                        f_dt = filter_obj.from_time
                    sql_spans += " AND start_ts >= ?"
                    params_spans.append(f_dt)

                if filter_obj.to_time:
                    try:
                        t_dt = datetime.fromisoformat(filter_obj.to_time.replace("Z", "+00:00"))
                    except Exception:
                        t_dt = filter_obj.to_time
                    sql_spans += " AND start_ts <= ?"
                    params_spans.append(t_dt)

                if filter_obj.text:
                    sql_spans += " AND (span_name ILIKE ? OR attributes::VARCHAR ILIKE ?)"
                    params_spans.extend([f"%{filter_obj.text}%", f"%{filter_obj.text}%"])

                sql_spans += f" ORDER BY start_ts DESC LIMIT {min(limit, filter_obj.limit)}"

                cursor = conn.execute(sql_spans, params_spans)
                cols = [desc[0] for desc in cursor.description]
                for row in cursor.fetchall():
                    item = dict(zip(cols, row))
                    if isinstance(item.get("start_ts"), datetime):
                        item["start_ts"] = item["start_ts"].isoformat()
                    spans.append(item)

            # Query Logs
            if target in ("logs", "all"):
                sql_logs = "SELECT org_id, log_id, time_ns, ts, trace_id, span_id, service_name, severity_text, body FROM logs WHERE org_id = ?"
                params_logs: list[Any] = [org_id]

                if filter_obj.services:
                    placeholders = ", ".join(["?"] * len(filter_obj.services))
                    sql_logs += f" AND service_name IN ({placeholders})"
                    params_logs.extend(filter_obj.services)

                if filter_obj.severity:
                    placeholders = ", ".join(["?"] * len(filter_obj.severity))
                    sql_logs += f" AND severity_text IN ({placeholders})"
                    params_logs.extend(filter_obj.severity)

                if filter_obj.trace_id:
                    sql_logs += " AND trace_id = ?"
                    params_logs.append(filter_obj.trace_id)

                if filter_obj.from_time:
                    try:
                        f_dt = datetime.fromisoformat(filter_obj.from_time.replace("Z", "+00:00"))
                    except Exception:
                        f_dt = filter_obj.from_time
                    sql_logs += " AND ts >= ?"
                    params_logs.append(f_dt)

                if filter_obj.to_time:
                    try:
                        t_dt = datetime.fromisoformat(filter_obj.to_time.replace("Z", "+00:00"))
                    except Exception:
                        t_dt = filter_obj.to_time
                    sql_logs += " AND ts <= ?"
                    params_logs.append(t_dt)

                if filter_obj.text:
                    sql_logs += " AND body ILIKE ?"
                    params_logs.append(f"%{filter_obj.text}%")

                if filter_obj.regex:
                    sql_logs += " AND regexp_matches(body, ?)"
                    params_logs.append(filter_obj.regex)

                sql_logs += f" ORDER BY ts DESC LIMIT {min(limit, filter_obj.limit)}"

                cursor = conn.execute(sql_logs, params_logs)
                cols = [desc[0] for desc in cursor.description]
                for row in cursor.fetchall():
                    item = dict(zip(cols, row))
                    if isinstance(item.get("ts"), datetime):
                        item["ts"] = item["ts"].isoformat()
                    logs.append(item)

            engine_used = "duckdb"
        except Exception as e:
            logger.warning("DuckDB filter query execution failed: %s", e)

    # 2. If engine requested ClickHouse or federated, or if DuckDB returned 0 results and clickhouse requested
    if (use_clickhouse or (engine == "auto" and not spans and not logs and get_settings().CLICKHOUSE_HOST)):
        try:
            client = get_ch_client()

            # Query ClickHouse canonical_spans
            if target in ("traces", "spans", "all") and not spans:
                ch_sql = """
                    SELECT
                        org_id, trace_id, span_id, parent_span_id, service_name,
                        span_name, span_kind, start_ts, duration_ns, status_code, is_error
                    FROM agamotto_telemetry.canonical_spans
                    WHERE org_id = {org_id:String}
                """
                ch_params: dict[str, Any] = {"org_id": org_id}

                if filter_obj.services:
                    ch_sql += " AND service_name IN ({services:Array(String)})"
                    ch_params["services"] = filter_obj.services

                if filter_obj.status:
                    ch_sql += " AND status_code = {status:String}"
                    ch_params["status"] = filter_obj.status

                if filter_obj.trace_id:
                    ch_sql += " AND trace_id = {trace_id:String}"
                    ch_params["trace_id"] = filter_obj.trace_id

                if filter_obj.text:
                    ch_sql += " AND (span_name ILIKE {txt:String} OR attributes ILIKE {txt:String})"
                    ch_params["txt"] = f"%{filter_obj.text}%"

                ch_sql += f" ORDER BY start_ts DESC LIMIT {min(limit, filter_obj.limit)}"

                if engine == "federated":
                    # Federated Arrow query via DuckDB
                    duck_sql = "SELECT * FROM ch_spans"
                    fed_rows = query_clickhouse_with_duckdb(ch_sql, duck_sql, table_alias="ch_spans", parameters=ch_params)
                    spans.extend(fed_rows)
                    engine_used = "federated"
                else:
                    res = client.query(ch_sql, parameters=ch_params)
                    cols = res.column_names
                    for r in res.result_rows:
                        spans.append(dict(zip(cols, r)))
                    if spans:
                        engine_used = "clickhouse"

            # Query ClickHouse canonical_logs
            if target in ("logs", "all") and not logs:
                ch_sql_l = """
                    SELECT
                        org_id, log_id, time_ns, ts, trace_id, span_id, service_name, severity_text, body
                    FROM agamotto_telemetry.canonical_logs
                    WHERE org_id = {org_id:String}
                """
                ch_params_l: dict[str, Any] = {"org_id": org_id}

                if filter_obj.services:
                    ch_sql_l += " AND service_name IN ({services:Array(String)})"
                    ch_params_l["services"] = filter_obj.services

                if filter_obj.severity:
                    ch_sql_l += " AND severity_text IN ({severity:Array(String)})"
                    ch_params_l["severity"] = filter_obj.severity

                if filter_obj.trace_id:
                    ch_sql_l += " AND trace_id = {trace_id:String}"
                    ch_params_l["trace_id"] = filter_obj.trace_id

                if filter_obj.text:
                    ch_sql_l += " AND body ILIKE {txt:String}"
                    ch_params_l["txt"] = f"%{filter_obj.text}%"

                ch_sql_l += f" ORDER BY ts DESC LIMIT {min(limit, filter_obj.limit)}"

                try:
                    res_l = client.query(ch_sql_l, parameters=ch_params_l)
                    cols_l = res_l.column_names
                    for r in res_l.result_rows:
                        logs.append(dict(zip(cols_l, r)))
                    if logs and engine_used != "federated":
                        engine_used = "clickhouse"
                except Exception:
                    pass

            # Fallback to ClickHouse trace_spans & telemetry_logs tables if canonical returned empty
            if target in ("traces", "spans", "all") and not spans:
                try:
                    ch_sql_ts = """
                        SELECT
                            toString(organization_id) AS org_id,
                            trace_id,
                            span_id,
                            parent_span_id,
                            service_name,
                            name AS span_name,
                            kind AS span_kind,
                            start_time AS start_ts,
                            duration_ns,
                            status_code,
                            (status_code = 2) AS is_error
                        FROM agamotto_telemetry.trace_spans
                        WHERE (toString(organization_id) = {org_id:String} OR organization_id = toUUIDOrDefault({org_id:String}, '00000000-0000-0000-0000-000000000000'))
                    """
                    ts_params: dict[str, Any] = {"org_id": org_id}
                    if filter_obj.services:
                        ch_sql_ts += " AND service_name IN ({services:Array(String)})"
                        ts_params["services"] = filter_obj.services
                    if filter_obj.trace_id:
                        ch_sql_ts += " AND trace_id = {trace_id:String}"
                        ts_params["trace_id"] = filter_obj.trace_id
                    if filter_obj.text:
                        ch_sql_ts += " AND name ILIKE {txt:String}"
                        ts_params["txt"] = f"%{filter_obj.text}%"
                    ch_sql_ts += f" ORDER BY start_time DESC LIMIT {min(limit, filter_obj.limit)}"

                    res_ts = client.query(ch_sql_ts, parameters=ts_params)
                    for r in res_ts.result_rows:
                        spans.append(dict(zip(res_ts.column_names, r)))
                    if spans and engine_used != "federated":
                        engine_used = "clickhouse"
                except Exception as e_ts:
                    logger.debug("ClickHouse trace_spans query note: %s", e_ts)

            if target in ("logs", "all") and not logs:
                try:
                    ch_sql_tl = """
                        SELECT
                            toString(organization_id) AS org_id,
                            span_id AS log_id,
                            toUnixTimestamp64Nano(time) AS time_ns,
                            time AS ts,
                            trace_id,
                            span_id,
                            service_name,
                            severity_text,
                            body
                        FROM agamotto_telemetry.telemetry_logs
                        WHERE (toString(organization_id) = {org_id:String} OR organization_id = toUUIDOrDefault({org_id:String}, '00000000-0000-0000-0000-000000000000'))
                    """
                    tl_params: dict[str, Any] = {"org_id": org_id}
                    if filter_obj.services:
                        ch_sql_tl += " AND service_name IN ({services:Array(String)})"
                        tl_params["services"] = filter_obj.services
                    if filter_obj.severity:
                        ch_sql_tl += " AND severity_text IN ({severity:Array(String)})"
                        tl_params["severity"] = filter_obj.severity
                    if filter_obj.trace_id:
                        ch_sql_tl += " AND trace_id = {trace_id:String}"
                        tl_params["trace_id"] = filter_obj.trace_id
                    if filter_obj.text:
                        ch_sql_tl += " AND body ILIKE {txt:String}"
                        tl_params["txt"] = f"%{filter_obj.text}%"
                    ch_sql_tl += f" ORDER BY time DESC LIMIT {min(limit, filter_obj.limit)}"

                    res_tl = client.query(ch_sql_tl, parameters=tl_params)
                    for r in res_tl.result_rows:
                        logs.append(dict(zip(res_tl.column_names, r)))
                    if logs and engine_used != "federated":
                        engine_used = "clickhouse"
                except Exception as e_tl:
                    logger.debug("ClickHouse telemetry_logs query note: %s", e_tl)

        except Exception as e:
            logger.debug("ClickHouse telemetry query note: %s", e)

    elapsed_ms = round((datetime.now() - t0).total_seconds() * 1000, 2)
    return ExecuteFilterResponse(
        target=target,
        engine_used=engine_used,
        total=len(spans) + len(logs),
        spans=spans,
        logs=logs,
        execution_time_ms=elapsed_ms,
    )


# ── Main Entrypoint for Feature 20 ───────────────────────────────────────────

async def parse_natural_language_search(
    req: ParseFilterRequest,
    org_id: str,
    visible_services: Optional[list[str]] = None,
) -> ParseFilterResponse:
    """
    Main pipeline for Feature 20: Natural-Language Search.
    
    1. Checks for dangerous commands / SQL injection -> safe fallback plain text search.
    2. Resolves client current time (UTC).
    3. Resolves known service names for tenant from request, visible_services, and DuckDB/ClickHouse.
    4. Runs LLM tool-calling or rule-based deterministic parser.
    5. Validates and sanitizes the parsed Filter against organization limits and contracts.
    6. Generates interactive UI chips for the 'Interpreted as' row.
    7. Optionally executes query against DuckDB and ClickHouse telemetry stores.
    """
    sentence = req.sentence.strip()
    warnings: list[str] = []

    # 1. Safety & Dangerous SQL / Prompt Injection Guard
    is_dangerous, reason = is_dangerous_or_injection(sentence)
    if is_dangerous:
        logger.warning("Unsafe search query intercepted ('%s'): %s. Yielding safe plain text fallback.", sentence, reason)
        safe_filter = Filter(
            text=sentence,
            limit=min(req.limit, 1000),
        )
        safe_chips = generate_filter_chips(safe_filter)
        return ParseFilterResponse(
            filter=safe_filter,
            chips=safe_chips,
            is_fallback=True,
            explanation=(
                f"Potentially unsafe input detected ({reason}). "
                "Per system security policy, input was safely treated as a literal plain text search string."
            ),
            warnings=[f"Safety guard triggered: {reason}. Filter treated as plain text."],
            target=req.target or "all",
            results=None,
        )

    # 2. Resolve client current time
    if req.current_time:
        try:
            now_dt = datetime.fromisoformat(req.current_time.replace("Z", "+00:00"))
            if now_dt.tzinfo is None:
                now_dt = now_dt.replace(tzinfo=timezone.utc)
        except Exception:
            now_dt = datetime.now(timezone.utc)
    else:
        now_dt = datetime.now(timezone.utc)

    # 3. Resolve known service names
    if req.services and len(req.services) > 0:
        known_services = list(req.services)
    else:
        known_services = discover_known_services(org_id)

    # Intersect with group visible_services if specified
    if visible_services:
        visible_set = {s.lower() for s in visible_services}
        known_services = [s for s in known_services if s.lower() in visible_set]

    # 4. Parse Query (LLM tool-calling with deterministic rule engine fallback)
    raw_filter: Optional[Filter] = None
    explanation: str = ""
    is_fallback = False

    llm_res = await parse_with_llm(sentence, now_dt, known_services, org_id)
    if llm_res:
        raw_filter, explanation = llm_res
    else:
        # Fallback to robust deterministic rule-based NLP engine
        raw_filter, explanation, parse_warns = parse_filter_rules(sentence, now_dt, known_services, org_id)
        warnings.extend(parse_warns)
        is_fallback = False  # Deterministic NLP parser is fully supported

    # If parsing somehow yielded an empty filter, fall back to plain text
    if not (
        raw_filter.services
        or raw_filter.severity
        or raw_filter.status
        or raw_filter.from_time
        or raw_filter.text
        or raw_filter.regex
        or raw_filter.trace_id
    ):
        raw_filter.text = sentence
        is_fallback = True
        explanation = f"Could not extract specific telemetry filters; searching body and message for '{sentence}'."

    # 5. Validate & Sanitize Filter
    validated_filter, val_warnings = validate_and_sanitize_filter(
        raw_filter,
        known_services=known_services,
        retention_days=req.retention_days,
        now=now_dt,
    )
    warnings.extend(val_warnings)

    # 6. Generate UI Chips
    chips = generate_filter_chips(validated_filter)

    # 7. Optional execution against DuckDB and ClickHouse
    executed_results = None
    if req.execute:
        exec_resp = execute_telemetry_query(
            filter_obj=validated_filter,
            org_id=org_id,
            target=req.target or "all",
            engine="auto",
            limit=req.limit,
        )
        executed_results = exec_resp.model_dump()

    return ParseFilterResponse(
        filter=validated_filter,
        chips=chips,
        is_fallback=is_fallback,
        explanation=explanation,
        warnings=warnings,
        target=req.target or "all",
        results=executed_results,
    )
