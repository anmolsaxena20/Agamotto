"""
Pydantic models (schemas) for Feature 7.

These are the canonical wire types shared between:
  - GET /anomalies  (Feature 7)
  - MCP get_anomalies tool   (Feature 8, future)
  - AI investigation assistant (Feature 9, future)

All IDs are strings. Timestamps are ISO-8601 UTC strings so they serialise
identically in JSON whether consumed by a JS frontend or a Python client.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, Any, List, Dict
from pydantic import BaseModel, Field, model_validator



class Suspect(BaseModel):
    """One ranked suspect span inside an anomaly."""

    span_id: str
    span_name: str
    service_name: str
    trace_id: str
    duration_ns: int = Field(..., description="Total span duration in nanoseconds")
    self_time_ns: int = Field(..., description="Self time = duration minus child span overlap")
    is_error: bool = False

    @property
    def self_time_ms(self) -> float:
        return self.self_time_ns / 1_000_000

    @property
    def duration_ms(self) -> float:
        return self.duration_ns / 1_000_000


class AnomalyOut(BaseModel):
    """Public response shape for a single anomaly – used by GET /anomalies."""

    anomaly_id: str
    service_name: str
    window_start: datetime
    window_end: datetime
    detected_at: datetime
    updated_at: datetime
    status: str  # "open" | "closed"
    p99_ns: int
    baseline_p99_ns: int
    ratio: float = Field(..., description="p99_ns / baseline_p99_ns")
    p99_ms: float
    baseline_p99_ms: float
    error_rate: float
    baseline_error_rate: float
    suspects: list[Suspect] = []
    summary: str = Field("", description="Human-readable one-liner for the banner")


class AnomalyListResponse(BaseModel):
    anomalies: list[AnomalyOut]
    total: int


class AnomalyFilterParams(BaseModel):
    """Query parameters for GET /anomalies."""

    service: Optional[str] = None
    status: Optional[str] = None          # "open" | "closed"
    from_ts: Optional[datetime] = None    # window_start >= from_ts
    to_ts: Optional[datetime] = None      # window_end   <= to_ts
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


# ── Feature 9 & 19: AI Investigation Assistant & Clickable Evidence Schemas ───

class EvidenceItem(BaseModel):
    """
    Evidence cited by the AI assistant (Feature 19).
    Validated by validator.py to ensure that cited spans or logs exist in DuckDB or ClickHouse.
    Enriched with real telemetry metadata and direct click-through URLs.
    """
    evidence_id: str
    kind: str = Field(..., description="'span', 'log', or 'trace'")
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    log_id: Optional[str] = None
    label: str = Field(..., description="Short readable label, e.g. 'payment POST /charge 2.1s'")
    service_name: Optional[str] = Field(default=None, description="Service that produced the telemetry")
    span_name: Optional[str] = Field(default=None, description="Span operation name")
    duration_ms: Optional[float] = Field(default=None, description="Duration in milliseconds")
    is_error: Optional[bool] = Field(default=None, description="Whether span or log indicates an error")
    status: str = Field(default="verified", description="'verified', 'flagged', or 'unverified'")
    source: Optional[str] = Field(default=None, description="Store engine: 'duckdb' | 'clickhouse'")
    preview: Optional[str] = Field(default=None, description="Hover preview text for the evidence chip")
    url: Optional[str] = Field(default=None, description="Direct navigation link: e.g. /traces/{trace_id}?span={span_id}")
    timestamp: Optional[str] = Field(default=None, description="Observed event timestamp")


class HypothesisItem(BaseModel):
    """An unverified hypothesis proposed by the AI assistant."""
    text: str
    confidence: str = Field(..., description="'low' | 'medium' | 'high'")
    evidence_ids: list[str] = Field(default_factory=list, description="IDs of cited evidence items supporting this")
    verified: bool = Field(default=False, description="Always False: hypotheses are unverified per the specification")


class AiAnswer(BaseModel):
    """
    Canonical AI Answer schema matching the specification and packages/contracts/schemas/ai-answer.json.
    """
    summary: str
    insufficient_evidence: bool = False
    evidence: list[EvidenceItem] = Field(default_factory=list)
    hypotheses: list[HypothesisItem] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    validation_stats: Optional[dict] = Field(default=None, description="Summary stats from Feature 19 Evidence Validator")


class AskContext(BaseModel):
    """Contextual metadata supplied to the AI investigation assistant."""
    filter: Optional[dict] = None
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    anomaly_id: Optional[str] = None


class AskRequest(BaseModel):
    """Request payload for POST /ask."""
    question: Optional[str] = None
    query: Optional[str] = None
    context: Optional[AskContext] = None

    @model_validator(mode="before")
    @classmethod
    def resolve_question(cls, data: Any):
        if isinstance(data, dict):
            q = data.get("question") or data.get("query")
            if not q:
                raise ValueError("Field required: 'question' or 'query'")
            data["question"] = q
        return data


class ValidateEvidenceRequest(BaseModel):
    """Request payload for POST /evidence/validate."""
    answer: Optional[AiAnswer] = None
    evidence: Optional[list[EvidenceItem]] = None
    hypotheses: Optional[list[HypothesisItem]] = None
    summary: Optional[str] = None


class ValidateEvidenceResponse(BaseModel):
    """Response payload for POST /evidence/validate."""
    answer: AiAnswer
    stats: dict


class SingleEvidenceVerificationResponse(BaseModel):
    """Response payload for single item verification."""
    kind: str
    item_id: str
    verified: bool
    source: Optional[str] = None
    details: Optional[dict] = None
    preview: Optional[str] = None
    url: Optional[str] = None


# ── Feature 20: Natural-Language Search Schemas ───────────────────────────────

class Filter(BaseModel):
    """
    Canonical Filter schema matching packages/contracts/schemas/filter.json and
    the specification in Eye of Agamotto AI and ML Part.
    Used by logs and traces search, saved queries, natural-language search, and URL state.
    """
    model_config = {"populate_by_name": True}

    from_time: Optional[str] = Field(default=None, alias="from", description="ISO-8601 UTC start timestamp")
    to_time: Optional[str] = Field(default=None, alias="to", description="ISO-8601 UTC end timestamp")
    services: list[str] = Field(default_factory=list, description="Target microservice names")
    severity: list[str] = Field(default_factory=list, description="OTel severity texts: TRACE, DEBUG, INFO, WARN, ERROR, FATAL")
    text: Optional[str] = Field(default=None, description="Plain text search term")
    regex: Optional[str] = Field(default=None, description="Regular expression pattern (must compile, max 200 chars)")
    status: Optional[str] = Field(default=None, description="Span status: UNSET, OK, ERROR")
    trace_id: Optional[str] = Field(default=None, description="OTel trace ID hex")
    limit: int = Field(default=100, ge=1, le=1000, description="Max telemetry records to return")
    cursor: Optional[str] = Field(default=None, description="Paging cursor")


class FilterChip(BaseModel):
    """
    Individual editable chip for the 'Interpreted as' row in the frontend.
    Allows user to see, edit, or remove interpreted components.
    """
    id: str
    type: str  # "service" | "severity" | "time_range" | "text" | "regex" | "status" | "trace_id" | "limit"
    label: str
    value: Any
    removable: bool = True
    raw_field: str


class ParseFilterRequest(BaseModel):
    """
    Request payload for POST /parse-filter (Feature 20).
    Receives sentence or query, optional client current time, and optional known service names.
    """
    sentence: Optional[str] = Field(default=None, description="Natural language search query from Logs or Traces search bar")
    query: Optional[str] = Field(default=None, description="Alternative field for search query")
    domain: Optional[str] = Field(default=None, description="Alternative field for target domain")
    current_time: Optional[str] = Field(default=None, description="Client current timestamp (ISO 8601 UTC)")
    services: Optional[list[str]] = Field(default=None, description="List of known service names for the organization")
    target: Optional[str] = Field(default="all", description="'logs', 'traces', or 'all'")
    execute: bool = Field(default=False, description="If True, also execute search against DuckDB and ClickHouse")
    retention_days: int = Field(default=30, ge=1, le=365, description="Organization plan retention in days")
    limit: int = Field(default=100, ge=1, le=1000)

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            s = data.get("sentence") or data.get("query") or ""
            data["sentence"] = s
            if not data.get("target") and data.get("domain"):
                data["target"] = data["domain"]
        return data


class ParseFilterResponse(BaseModel):
    """
    Response payload for POST /parse-filter (Feature 20).
    Returns the structured Filter object, UI chips, fallback flag, explanation, and optional executed results.
    """
    filter: Filter
    chips: list[FilterChip] = []
    is_fallback: bool = False
    explanation: str = ""
    warnings: list[str] = []
    target: str = "all"
    results: Optional[dict] = None


class ExecuteFilterRequest(BaseModel):
    """
    Request payload to execute a validated Filter directly against DuckDB and ClickHouse telemetry stores.
    """
    filter: Filter
    target: str = Field(default="all", description="'logs', 'traces', or 'all'")
    domain: Optional[str] = Field(default=None, description="Alternative field name for target")
    engine: str = Field(default="auto", description="'auto', 'duckdb', 'clickhouse', 'federated'")
    limit: int = Field(default=100, ge=1, le=1000)

    @model_validator(mode="before")
    @classmethod
    def normalize_target(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("target") and data.get("domain"):
                data["target"] = data["domain"]
        return data


class ExecuteFilterResponse(BaseModel):
    """
    Response payload containing telemetry matched by the filter.
    """
    target: str
    engine_used: str
    total: int
    spans: list[dict] = []
    logs: list[dict] = []
    execution_time_ms: float

