"""
Pydantic contracts and schemas for Feature 8: MCP Server.

Matches packages/contracts/schemas/filter.json and the Shared Domain Names
and Project Schema specification.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict


class TelemetryFilter(BaseModel):
    """
    Canonical filter object matching packages/contracts/schemas/filter.json.
    Used by all filter-based query endpoints, saved queries, and MCP tools.
    org_id is NEVER in the filter; it is applied server-side from the token.
    """
    model_config = ConfigDict(populate_by_name=True)

    from_ts: Optional[datetime] = Field(
        default=None,
        alias="from",
        description="Start time (UTC ISO 8601).",
    )
    to_ts: Optional[datetime] = Field(
        default=None,
        alias="to",
        description="End time (UTC ISO 8601).",
    )
    services: List[str] = Field(
        default_factory=list,
        description="Optional list of service names to filter by.",
    )
    severity: List[str] = Field(
        default_factory=list,
        description="Optional list of log severities (e.g. ['ERROR', 'FATAL']).",
    )
    text: Optional[str] = Field(
        default=None,
        description="Substring search for log messages or span names.",
    )
    regex: Optional[str] = Field(
        default=None,
        description="Regex pattern for log body or span name matching.",
    )
    status: Optional[str] = Field(
        default=None,
        description="Status filter: 'OK', 'ERROR', or 'UNSET'.",
    )
    trace_id: Optional[str] = Field(
        default=None,
        description="Optional trace ID filter.",
    )
    limit: int = Field(
        default=50,
        ge=1,
        le=1000,
        description="Maximum rows to return (capped to prevent context overflow).",
    )
    cursor: Optional[str] = Field(
        default=None,
        description="Pagination cursor for list queries.",
    )


class ServiceStatItem(BaseModel):
    """Per-service telemetry aggregate."""
    service_name: str
    request_count: int
    error_count: int
    error_rate: float = Field(..., description="Fraction from 0.0 to 1.0")
    p50_ns: int
    p95_ns: int
    p99_ns: int
    p50_ms: float
    p95_ms: float
    p99_ms: float


class SlowSpanItem(BaseModel):
    """One ranked slow span."""
    trace_id: str
    span_id: str
    service_name: str
    span_name: str
    start_ts: datetime
    duration_ns: int
    duration_ms: float
    self_time_ns: int
    self_time_ms: float
    is_error: bool
    http_status: Optional[int] = None


class ErrorGroupItem(BaseModel):
    """Aggregated error group by error_fingerprint."""
    error_fingerprint: str
    service_name: str
    pattern: str = Field(..., description="Sample error message or operation pattern")
    count: int
    first_seen: datetime
    last_seen: datetime
    sample_trace_id: Optional[str] = None
    sample_span_id: Optional[str] = None


class TraceSpanItem(BaseModel):
    """Span inside a full trace tree."""
    span_id: str
    parent_span_id: Optional[str] = None
    service_name: str
    span_name: str
    start_time_ns: int
    duration_ns: int
    duration_ms: float
    self_time_ns: int
    self_time_ms: float
    depth: int = Field(..., description="Tree depth from root span (root is 0)")
    critical_path: bool = Field(..., description="True if span lies on critical bottleneck path")
    is_error: bool
    http_status: Optional[int] = None


class TraceDetailResponse(BaseModel):
    """Full trace representation with computed tree metrics."""
    trace_id: str
    root_span_name: str
    start_ts: datetime
    duration_ns: int
    duration_ms: float
    span_count: int
    service_count: int
    has_error: bool
    spans: List[TraceSpanItem]


class LogItem(BaseModel):
    """Sanitized, capped log record for AI inspection."""
    log_id: str
    ts: datetime
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    service_name: str
    severity_text: str
    severity_number: Optional[int] = None
    body: str


class SpanDelta(BaseModel):
    """Delta comparison between a span and its baseline counterpart."""
    service_name: str
    span_name: str
    status: Literal["added", "missing", "same", "slower", "faster"]
    duration_ns: Optional[int] = None
    baseline_duration_ns: Optional[int] = None
    duration_delta_ns: Optional[int] = None
    duration_delta_ms: Optional[float] = None


class TraceComparisonResponse(BaseModel):
    """Structural and latency comparison between a trace and baseline."""
    trace_id: str
    baseline_trace_id: str
    duration_ns: int
    baseline_duration_ns: int
    duration_delta_ns: int
    duration_delta_ms: float
    added_spans_count: int
    missing_spans_count: int
    deltas: List[SpanDelta]


class TopologyEdgeItem(BaseModel):
    """Caller-to-callee dependency edge."""
    caller: str
    callee: str
    call_count: int
    p95_ns: int
    p95_ms: float
    error_rate: float = Field(..., description="Fraction from 0.0 to 1.0")


class ToolInfo(BaseModel):
    """Metadata describing an exposed MCP tool."""
    name: str
    description: str
    input_schema: Dict[str, Any]
    enabled: bool
