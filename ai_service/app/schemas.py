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
from typing import Optional
from pydantic import BaseModel, Field


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
